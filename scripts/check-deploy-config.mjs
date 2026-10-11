// 배포 전 설정 누락/형식만 검사한다. 실제 Google 권한은 브라우저에서 확인한다.
// 값은 오류 로그에 포함하지 않는다.
const rules = {
  VITE_GOOGLE_CLIENT_ID: /^[^\s]+\.apps\.googleusercontent\.com$/,
  VITE_GOOGLE_API_KEY: /^AIza[A-Za-z0-9_-]{35}$/,
  VITE_GOOGLE_APP_ID: /^\d+$/,
}

const values = Object.fromEntries(
  Object.keys(rules).map((name) => [name, (process.env[name] ?? '').trim()]),
)
const invalid = Object.entries(rules)
  .filter(([name, pattern]) => !pattern.test(values[name]))
  .map(([name]) => name)

if (invalid.length) {
  console.error(`Google deployment configuration missing or invalid: ${invalid.join(', ')}. See docs/GOOGLE_SETUP.md (Actions Variables).`)
  for (const name of invalid) {
    const source = Object.keys(rules).find((other) => other !== name && rules[name].test(values[other]))
    if (source) {
      console.error(`${name}: the value in ${source} matches the expected format. Check whether these values were assigned to the wrong fields.`)
    }
  }
  process.exitCode = 1
} else {
  console.log('Google deployment configuration format checked (Google authorization not verified).')
}
