// scripts/deploy-apps-script.sh와 scripts/setup-deploy.sh를 가짜 clasp로 실행해
// 비밀값 없음 분기, 배포 자동 탐지, 명령 순서, 실패 처리, 비밀값 비노출을 확인한다.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DEPLOY = new URL('./deploy-apps-script.sh', import.meta.url).pathname
const SETUP = new URL('./setup-deploy.sh', import.meta.url).pathname
const CLASPRC = { tokens: { default: { refresh_token: 'secret-refresh-token', client_secret: 'secret-client-secret' } } }
const SCRIPT_ID = 'secret-script-id-0123456789'
const DEPLOYMENT_ID = 'AKfy-secret-deployment-id'
const ONE = JSON.stringify([
  { deploymentId: 'AKfy-head-deployment', description: 'Head' },
  { deploymentId: DEPLOYMENT_ID, versionNumber: 7, description: 'web app' },
])
const TWO = JSON.stringify([
  { deploymentId: 'AKfy-head-deployment' },
  { deploymentId: 'AKfy-first-deployment', versionNumber: 3, description: 'old' },
  { deploymentId: DEPLOYMENT_ID, versionNumber: 7, description: 'web app' },
])

const niroDeploy = (extra = {}) => JSON.stringify({ clasprc: CLASPRC, scriptId: SCRIPT_ID, ...extra })

/**
 * 가짜 clasp: 받은 인자와 그때의 파일 상태를 기록한다.
 * FAKE_CLASP_FAIL에 맞는 명령은 실패하고, list-deployments는 FAKE_DEPLOYMENTS를, login은 인증 파일을 만든다.
 */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'deploy-test-'))
  const dist = join(root, 'dist')
  mkdirSync(dist)
  for (const file of ['index.html', 'Code.js', 'appsscript.json']) writeFileSync(join(dist, file), `// ${file}`)
  const log = join(root, 'clasp.log')
  const clasp = join(root, 'fake-clasp.sh')
  writeFileSync(
    clasp,
    `#!/usr/bin/env bash
auth="$2"; cmd="$3"
if [ "$cmd" = login ]; then echo '${JSON.stringify(CLASPRC)}' > "$auth"; echo "login|$*" >> "${log}"; exit 0; fi
echo "$cmd|$*|auth=$(cat "$auth")|project=$(cat .clasp.json 2>/dev/null)|files=$(ls | tr '\\n' ' ')" >> "${log}"
if [ "$cmd" = "\${FAKE_CLASP_FAIL:-}" ]; then echo "Error: User has not enabled the Apps Script API. token=secret-refresh-token id=${SCRIPT_ID}" >&2; exit 1; fi
if [ "$cmd" = list-deployments ]; then echo "\${FAKE_DEPLOYMENTS:-[]}"; fi
if [ "$cmd" = update-deployment ]; then echo '{"deploymentId":"x","versionNumber":42,"description":"x"}'; fi
`,
  )
  chmodSync(clasp, 0o755)
  return { root, dist, log, clasp, summary: join(root, 'summary.md') }
}

function run(ctx, script, env, input) {
  const result = spawnSync('bash', [script], {
    env: {
      PATH: process.env.PATH,
      HOME: ctx.root,
      DIST_DIR: ctx.dist,
      WORK_DIR: ctx.root,
      CLASP: ctx.clasp,
      COMMIT_SHA: 'abcdef0123456789',
      GITHUB_STEP_SUMMARY: ctx.summary,
      ...env,
    },
    input,
    encoding: 'utf8',
  })
  const summary = existsSync(ctx.summary) ? readFileSync(ctx.summary, 'utf8') : ''
  const calls = existsSync(ctx.log) ? readFileSync(ctx.log, 'utf8').trim().split('\n') : []
  return { ...result, summary, calls, output: result.stdout + result.stderr + summary }
}

describe('deploy-apps-script.sh', () => {
  it('NIRO_DEPLOY가 없으면 배포를 건너뛰고 성공으로 끝낸다', () => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, {})
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([])
    expect(result.summary).toContain('설정 필요')
    expect(result.summary).toContain('NIRO_DEPLOY')
  })

  it('deploymentId가 있으면 push -f 후 그 배포만 새 버전으로 갱신하고, 요약에는 버전과 SHA만 남긴다', () => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy({ deploymentId: DEPLOYMENT_ID }) })
    expect(result.status).toBe(0)
    expect(result.calls.map((c) => c.split('|')[0])).toEqual(['push', 'update-deployment'])
    const [push, deploy] = result.calls
    expect(push).toMatch(/\|-A .*\/apps-script-deploy\/auth\/\.clasprc\.json push -f\|/)
    expect(push).toContain(`auth=${JSON.stringify(CLASPRC)}`)
    expect(push).toContain(`project={"scriptId":"${SCRIPT_ID}","rootDir":"."}`)
    expect(push).toContain('files=Code.js appsscript.json index.html')
    expect(deploy).toContain(`update-deployment ${DEPLOYMENT_ID} -d commit abcdef0 --json`)
    expect(result.summary).toContain('버전: 42')
    expect(result.summary).toContain('커밋: abcdef0')
    expect(result.output).not.toMatch(/secret-/)
  })

  it('deploymentId가 없으면 @HEAD가 아닌 배포가 하나일 때 그 배포를 갱신한다', () => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy(), FAKE_DEPLOYMENTS: ONE })
    expect(result.status).toBe(0)
    expect(result.calls.map((c) => c.split('|')[0])).toEqual(['list-deployments', 'push', 'update-deployment'])
    expect(result.calls[2]).toContain(`update-deployment ${DEPLOYMENT_ID} -d commit abcdef0`)
    expect(result.output).not.toMatch(/secret-|AKfy-/)
  })

  it.each([
    ['0개', '[{"deploymentId":"AKfy-head-deployment"}]', '0개'],
    ['2개', TWO, '2개'],
  ])('버전 배포가 %s면 올리지 않고 deploymentId 지정 필요로 실패하며 ID는 출력하지 않는다', (_name, list, count) => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy(), FAKE_DEPLOYMENTS: list })
    expect(result.status).not.toBe(0)
    expect(result.calls.map((c) => c.split('|')[0])).toEqual(['list-deployments'])
    expect(result.stderr).toContain(`버전 배포가 ${count}`)
    expect(result.stderr).toContain('deploymentId를 지정')
    expect(result.output).not.toMatch(/AKfy-|secret-/)
  })

  it('GitHub Actions에서는 NIRO_DEPLOY의 문자열 조각을 모두 가린다', () => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy({ deploymentId: DEPLOYMENT_ID }), GITHUB_ACTIONS: 'true' })
    expect(result.status).toBe(0)
    for (const s of ['secret-refresh-token', 'secret-client-secret', SCRIPT_ID, DEPLOYMENT_ID]) expect(result.stdout).toContain(`::add-mask::${s}`)
  })

  it('끝나면 로그인 정보와 프로젝트 파일을 지운다', () => {
    const ctx = setup()
    run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy({ deploymentId: DEPLOYMENT_ID }) })
    expect(existsSync(join(ctx.root, 'apps-script-deploy'))).toBe(false)
  })

  it.each(['list-deployments', 'push', 'update-deployment'])('%s가 실패하면 실패로 끝내고 비밀값을 가린다', (cmd) => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy(), FAKE_DEPLOYMENTS: ONE, FAKE_CLASP_FAIL: cmd })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`clasp ${cmd}가 실패했습니다.`)
    expect(result.stderr).toContain('User has not enabled the Apps Script API. token=*** id=***')
    expect(result.output).not.toMatch(/secret-/)
    expect(result.summary).not.toContain('배포 완료')
    expect(existsSync(join(ctx.root, 'apps-script-deploy'))).toBe(false)
  })

  it.each([
    ['JSON이 아님', 'not json secret-refresh-token', '올바른 JSON이 아닙니다'],
    ['base64지만 JSON이 아님', Buffer.from('secret-refresh-token').toString('base64'), '올바른 JSON이 아닙니다'],
    ['scriptId 없음', JSON.stringify({ clasprc: CLASPRC }), 'scriptId'],
    ['clasprc 없음', JSON.stringify({ scriptId: SCRIPT_ID }), 'clasprc'],
  ])('NIRO_DEPLOY가 %s이면 clasp를 부르지 않고 실패한다', (_name, value, message) => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: value })
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([])
    expect(result.stderr).toContain(message)
    expect(result.output).not.toMatch(/secret-/)
  })

  const variants = () => {
    const json = niroDeploy({ deploymentId: DEPLOYMENT_ID })
    const b64 = Buffer.from(json).toString('base64')
    const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const wrap = (s, n) => s.match(new RegExp(`.{1,${n}}`, 'g')).join('\n')
    return [
      ['JSON 중간중간 줄바꿈', wrap(json, 17)],
      ['JSON CRLF 줄바꿈과 앞뒤 공백', `  ${wrap(json, 23).replace(/\n/g, '\r\n')}  \r\n`],
      ['base64 한 줄', b64],
      ['base64 줄바꿈·공백 섞임', ` ${wrap(b64, 30).replace(/\n/g, (_, i) => (i % 2 ? ' \n' : '\r\n'))} `],
      ['URL-safe base64', urlSafe],
      ['시작·끝 표시까지 복사한 base64', `----- NIRO_DEPLOY 시작 -----\n${wrap(b64, 40)}\n----- NIRO_DEPLOY 끝 -----`],
    ]
  }

  it.each(variants())('NIRO_DEPLOY가 %s여도 풀어서 배포한다', (_name, value) => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: value })
    expect(result.status).toBe(0)
    expect(result.calls.map((c) => c.split('|')[0])).toEqual(['push', 'update-deployment'])
    expect(result.calls[0]).toContain(`project={"scriptId":"${SCRIPT_ID}","rootDir":"."}`)
    expect(result.calls[1]).toContain(`update-deployment ${DEPLOYMENT_ID} `)
    expect(result.output).not.toMatch(/secret-/)
  })

  it('잘린 값은 내용을 보이지 않고 진단만 출력한다', () => {
    const ctx = setup()
    const b64 = Buffer.from(niroDeploy()).toString('base64')
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: `${b64.slice(0, 60)}\n${b64.slice(60, 90)}` })
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([])
    expect(result.stderr).toContain('길이 91자')
    expect(result.stderr).toContain("첫 글자가 '{' 아님")
    expect(result.stderr).toContain('base64 글자만 있음')
    expect(result.stderr).toContain('줄바꿈 있음')
    expect(result.output).not.toContain(b64.slice(0, 20))
  })

  it('잘린 JSON은 끝이 "}"가 아니라고 알린다', () => {
    const ctx = setup()
    const json = niroDeploy()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: json.slice(0, json.length - 10) })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("첫 글자가 '{' 맞음")
    expect(result.stderr).toContain("끝 글자가 '}' 아님(잘렸을 수 있음)")
    expect(result.output).not.toMatch(/secret-/)
  })

  it('Actions에서는 여러 줄 값을 줄마다 가리고, 줄바꿈이 든 값은 add-mask에 넘기지 않는다', () => {
    const ctx = setup()
    const b64 = Buffer.from(niroDeploy({ deploymentId: DEPLOYMENT_ID })).toString('base64')
    const lines = b64.match(/.{1,50}/g)
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: lines.join('\n'), GITHUB_ACTIONS: 'true' })
    expect(result.status).toBe(0)
    for (const line of lines.filter((l) => l.length >= 6)) expect(result.stdout).toContain(`::add-mask::${line}\n`)
    expect(result.stdout).toContain(`::add-mask::${b64}\n`)
    // add-mask가 아닌 줄에 값 조각이 그대로 찍히지 않는다.
    const plain = result.stdout.split('\n').filter((l) => !l.startsWith('::add-mask::'))
    for (const line of lines.filter((l) => l.length >= 6)) expect(plain.join('\n')).not.toContain(line)
  })

  it('빌드 결과가 없으면 실패한다', () => {
    const ctx = setup()
    const result = run(ctx, DEPLOY, { NIRO_DEPLOY: niroDeploy(), DIST_DIR: join(ctx.root, 'missing') })
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([])
  })
})

/** setup-deploy.sh가 출력한 NIRO_DEPLOY 한 줄 */
function secretLine(stdout) {
  const lines = stdout.split('\n')
  const value = lines[lines.indexOf('----- NIRO_DEPLOY 시작 -----') + 1]
  expect(value).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
}

describe('setup-deploy.sh', () => {
  it('스크립트 ID 확인 → 로그인 → 배포가 하나면 그 ID를 넣은 NIRO_DEPLOY 한 줄을 출력하고, 로그인 정보를 남기지 않는다', () => {
    const ctx = setup()
    const result = run(ctx, SETUP, { FAKE_DEPLOYMENTS: ONE }, `짧음\n ${SCRIPT_ID} \n`)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('스크립트 ID 형식이 아닙니다')
    expect(result.calls.map((c) => c.split('|')[0])).toEqual(['login', 'list-deployments'])
    expect(result.calls[0]).toContain('login --no-localhost')
    expect(secretLine(result.stdout)).toEqual({ clasprc: CLASPRC, scriptId: SCRIPT_ID, deploymentId: DEPLOYMENT_ID })
    expect(result.stdout).toContain('Name: NIRO_DEPLOY')
    expect(result.stdout).toContain('줄바꿈이 섞여도 괜찮습니다')
    // 같은 값을 ~/niro_deploy.txt(600)에도 저장하고 지우라고 안내한다.
    const saved = join(ctx.root, 'niro_deploy.txt')
    expect(JSON.parse(Buffer.from(readFileSync(saved, 'utf8').trim(), 'base64').toString('utf8')).scriptId).toBe(SCRIPT_ID)
    expect(statSync(saved).mode & 0o777).toBe(0o600)
    expect(result.stdout).toContain('rm ~/niro_deploy.txt')
    expect(existsSync(join(ctx.root, '.clasprc.json'))).toBe(false)
  })

  it('배포가 여러 개면 번호를 골라 그 ID를 넣는다', () => {
    const ctx = setup()
    const result = run(ctx, SETUP, { FAKE_DEPLOYMENTS: TWO }, `${SCRIPT_ID}\n9\n2\n`)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('1부터 2 사이 번호')
    expect(secretLine(result.stdout).deploymentId).toBe(DEPLOYMENT_ID)
  })

  it('배포가 없으면 안내하고 실패한다', () => {
    const ctx = setup()
    const result = run(ctx, SETUP, { FAKE_DEPLOYMENTS: '[]' }, `${SCRIPT_ID}\n`)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('웹 앱 배포가 없습니다')
    expect(result.stdout).not.toContain('NIRO_DEPLOY 시작')
  })

  it('Apps Script API가 꺼져 있으면 켜는 곳을 안내한다', () => {
    const ctx = setup()
    const result = run(ctx, SETUP, { FAKE_CLASP_FAIL: 'list-deployments' }, `${SCRIPT_ID}\n`)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('https://script.google.com/home/usersettings')
  })

  it('예전 ~/.clasprc.json은 기본으로 지우고, n이면 남긴다', () => {
    const ctx = setup()
    writeFileSync(join(ctx.root, '.clasprc.json'), '{}')
    expect(run(ctx, SETUP, { FAKE_DEPLOYMENTS: ONE }, `${SCRIPT_ID}\n\n`).status).toBe(0)
    expect(existsSync(join(ctx.root, '.clasprc.json'))).toBe(false)
    const ctx2 = setup()
    writeFileSync(join(ctx2.root, '.clasprc.json'), '{}')
    expect(run(ctx2, SETUP, { FAKE_DEPLOYMENTS: ONE }, `${SCRIPT_ID}\nn\n`).status).toBe(0)
    expect(existsSync(join(ctx2.root, '.clasprc.json'))).toBe(true)
  })
})
