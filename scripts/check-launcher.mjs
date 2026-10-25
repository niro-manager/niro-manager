// GitHub Pages 런처(launcher/) 정적 검사. CI와 Pages 배포 전에 실행한다.
// manifest 형식·필수 값, 아이콘 크기, 서비스 워커 캐시 대상 파일, 웹 앱 주소가 커밋되지 않았는지 확인한다.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'launcher'
const errors = []
const fail = (message) => errors.push(message)

let manifest
try {
  manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'))
} catch (error) {
  fail(`manifest.webmanifest를 JSON으로 읽지 못함: ${error.message}`)
}

if (manifest) {
  const expected = {
    id: '/niro-manager/niro-manager',
    start_url: '/niro-manager/',
    scope: '/niro-manager/',
    display: 'standalone',
    name: 'Niro Manager',
    short_name: '니로 차계부',
  }
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) fail(`manifest ${key}: ${JSON.stringify(manifest[key])} (기대값 ${JSON.stringify(value)})`)
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : []
  const need = [
    ['192x192', 'any'],
    ['512x512', 'any'],
    ['512x512', 'maskable'],
  ]
  for (const [sizes, purpose] of need) {
    const icon = icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any').split(' ').includes(purpose))
    if (!icon) {
      fail(`manifest에 ${sizes} ${purpose} 아이콘이 없음`)
      continue
    }
    if (!icon.src.startsWith('/niro-manager/')) {
      fail(`아이콘 경로가 /niro-manager/ 밖: ${icon.src}`)
      continue
    }
    const file = join(dir, icon.src.slice('/niro-manager/'.length))
    if (!existsSync(file)) {
      fail(`아이콘 파일 없음: ${file}`)
      continue
    }
    const png = readFileSync(file)
    const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
    if (png.toString('ascii', 1, 4) !== 'PNG' || size !== sizes) fail(`${file}: PNG ${size} (기대값 ${sizes})`)
  }
}

const sw = readFileSync(join(dir, 'sw.js'), 'utf8')
if (!/const CACHE_VERSION = '[^']+'/.test(sw)) fail('sw.js에 CACHE_VERSION 상수가 없음')
const shell = sw.match(/const SHELL = \[([\s\S]*?)\]/)
if (!shell) fail('sw.js에 SHELL 목록이 없음')
else {
  for (const [, path] of shell[1].matchAll(/'([^']+)'/g)) {
    const file = path === './' ? 'index.html' : path.replace(/^\.\//, '')
    if (!existsSync(join(dir, file))) fail(`sw.js SHELL의 파일 없음: ${path}`)
  }
}

// 실제 배포 ID는 수십 자이다. 테스트의 짧은 예시 주소는 통과한다.
for (const name of readdirSync(dir)) {
  if (!/\.(html|js|webmanifest|json)$/.test(name)) continue
  if (/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{30,}\/exec/.test(readFileSync(join(dir, name), 'utf8'))) {
    fail(`${name}에 실제 웹 앱 주소로 보이는 값이 있음(공개 저장소에 넣지 않음)`)
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`✗ ${message}`)
  process.exit(1)
}
console.log('launcher 검사 통과')
