// scripts/deploy-apps-script.sh를 가짜 clasp로 실행해 비밀값 없음 분기, 명령 순서, 실패 처리, 비밀값 비노출을 확인한다.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = new URL('./deploy-apps-script.sh', import.meta.url).pathname
const SECRETS = {
  CLASPRC_JSON: '{"tokens":{"default":{"refresh_token":"secret-refresh-token"}}}',
  APPS_SCRIPT_ID: 'secret-script-id',
  APPS_SCRIPT_DEPLOYMENT_ID: 'AKfy-secret-deployment-id',
}

/** 가짜 clasp: 받은 인자와 그때의 파일 상태를 기록하고, FAKE_CLASP_FAIL에 맞는 명령은 실패한다 */
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
echo "$cmd|$*|cwd=$(pwd)|auth=$(cat "$auth")|project=$(cat .clasp.json)|files=$(ls | tr '\\n' ' ')" >> "${log}"
if [ "$cmd" = "\${FAKE_CLASP_FAIL:-}" ]; then echo "Error: User has not enabled the Apps Script API. token=secret-refresh-token" >&2; exit 1; fi
if [ "$cmd" = update-deployment ]; then echo '{"deploymentId":"AKfy-secret-deployment-id","versionNumber":42,"description":"x"}'; fi
`,
  )
  chmodSync(clasp, 0o755)
  const summary = join(root, 'summary.md')
  return { root, dist, log, clasp, summary }
}

function run(ctx, env) {
  const result = spawnSync('bash', [SCRIPT], {
    env: {
      PATH: process.env.PATH,
      DIST_DIR: ctx.dist,
      WORK_DIR: ctx.root,
      CLASP: ctx.clasp,
      COMMIT_SHA: 'abcdef0123456789',
      GITHUB_STEP_SUMMARY: ctx.summary,
      ...env,
    },
    encoding: 'utf8',
  })
  const summary = existsSync(ctx.summary) ? readFileSync(ctx.summary, 'utf8') : ''
  const calls = existsSync(ctx.log) ? readFileSync(ctx.log, 'utf8').trim().split('\n') : []
  return { ...result, summary, calls, output: result.stdout + result.stderr + summary }
}

describe('deploy-apps-script.sh', () => {
  it.each(Object.keys(SECRETS))('%s가 없으면 배포를 건너뛰고 성공으로 끝낸다', (name) => {
    const ctx = setup()
    const result = run(ctx, { ...SECRETS, [name]: '' })
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([])
    expect(result.summary).toContain('설정 필요')
    expect(result.summary).toContain(name)
  })

  it('비밀값이 모두 없어도 실패하지 않는다', () => {
    const ctx = setup()
    const result = run(ctx, {})
    expect(result.status).toBe(0)
    expect(result.summary).toContain('CLASPRC_JSON APPS_SCRIPT_ID APPS_SCRIPT_DEPLOYMENT_ID')
  })

  it('push -f 후 기존 배포만 새 버전으로 갱신하고, 요약에는 버전과 SHA만 남긴다', () => {
    const ctx = setup()
    const result = run(ctx, SECRETS)
    expect(result.status).toBe(0)
    expect(result.calls).toHaveLength(2)
    const [push, deploy] = result.calls
    expect(push).toMatch(/^push\|-A .*\/apps-script-deploy\/auth\/\.clasprc\.json push -f\|/)
    expect(push).toContain(`auth=${SECRETS.CLASPRC_JSON}`)
    expect(push).toContain('project={"scriptId":"secret-script-id","rootDir":"."}')
    expect(push).toContain('files=Code.js appsscript.json index.html')
    expect(deploy).toContain('update-deployment AKfy-secret-deployment-id -d commit abcdef0 --json')
    expect(result.calls.join('\n')).not.toMatch(/create-deployment|deploy -i| deploy /)
    expect(result.summary).toContain('버전: 42')
    expect(result.summary).toContain('커밋: abcdef0')
    expect(result.stdout + result.stderr + result.summary).not.toMatch(/secret-/)
  })

  it('끝나면 로그인 정보와 프로젝트 파일을 지운다', () => {
    const ctx = setup()
    run(ctx, SECRETS)
    expect(existsSync(join(ctx.root, 'apps-script-deploy'))).toBe(false)
  })

  it.each(['push', 'update-deployment'])('%s가 실패하면 실패로 끝내고 비밀값을 출력하지 않는다', (cmd) => {
    const ctx = setup()
    const result = run(ctx, { ...SECRETS, FAKE_CLASP_FAIL: cmd })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`clasp ${cmd}가 실패했습니다.`)
    expect(result.stderr).toContain('User has not enabled the Apps Script API')
    expect(result.summary).not.toContain('배포 완료')
    expect(result.output).not.toMatch(/secret-/)
    expect(result.stderr).toContain('token=***')
    expect(existsSync(join(ctx.root, 'apps-script-deploy'))).toBe(false)
  })

  it('CLASPRC_JSON이 JSON이 아니면 clasp를 부르지 않고 실패한다', () => {
    const ctx = setup()
    const result = run(ctx, { ...SECRETS, CLASPRC_JSON: 'not json secret-refresh-token' })
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([])
    expect(result.output).not.toContain('secret-refresh-token')
  })

  it('빌드 결과가 없으면 실패한다', () => {
    const ctx = setup()
    const result = run(ctx, { ...SECRETS, DIST_DIR: join(ctx.root, 'missing') })
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([])
  })
})
