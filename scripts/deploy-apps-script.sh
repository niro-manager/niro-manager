#!/usr/bin/env bash
# Apps Script 자동 배포(2026-11-06 사용자 결정 B). GitHub Actions의 deploy-apps-script.yml이 부른다.
# dist/의 index.html·Code.js·appsscript.json을 clasp로 올리고, 기존 웹 앱 배포를 새 버전으로 갱신한다(새 배포는 만들지 않아 URL 유지).
#
# 환경 변수
#   NIRO_DEPLOY   GitHub Secret. 한 줄 JSON {"clasprc": <~/.clasprc.json 객체>, "scriptId": "...", "deploymentId": "..."(선택)}.
#                 scripts/setup-deploy.sh가 만들어 준다. 없으면 배포를 건너뛰고 성공으로 끝낸다.
#                 deploymentId가 없으면 @HEAD가 아닌 배포가 정확히 하나일 때 그 배포를 갱신한다.
#   COMMIT_SHA    배포할 커밋(버전 설명에 앞 7자리)
#   DIST_DIR      빌드 결과 폴더(기본 dist)
#   WORK_DIR      로그인 정보·프로젝트 파일을 둘 임시 폴더(기본 $RUNNER_TEMP). 끝나면 지운다.
#   CLASP         clasp 실행 명령(기본 clasp, 테스트에서 가짜 명령으로 바꾼다)
#   GITHUB_STEP_SUMMARY  요약을 덧붙일 파일(없으면 표준 출력)
#
# 비밀값을 출력하지 않는다: set -x를 쓰지 않고, clasp 출력도 그대로 보여 주지 않는다.
set -euo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
dist="${DIST_DIR:-dist}"
clasp="${CLASP:-clasp}"
sha="${COMMIT_SHA:-unknown}"
short_sha="${sha:0:7}"

if [ -z "${NIRO_DEPLOY:-}" ]; then
  {
    echo "### Apps Script 자동 배포: 설정 필요"
    echo ""
    echo "GitHub Secret NIRO_DEPLOY가 없어 배포를 건너뛰었습니다."
    echo "docs/APPS_SCRIPT_SETUP.md의 \"자동 배포(1회 설정)\"를 따라 주세요."
  } >>"$summary"
  exit 0
fi

for file in index.html Code.js appsscript.json; do
  [ -f "$dist/$file" ] || { echo "빌드 결과에 $file이 없습니다." >&2; exit 1; }
done

work="${WORK_DIR:-${RUNNER_TEMP:-$(mktemp -d)}}/apps-script-deploy"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT
rm -rf "$work"
umask 077
mkdir -p "$work/auth" "$work/project"

# NIRO_DEPLOY를 풀어 로그인 정보·프로젝트 파일을 임시 폴더에만 쓴다. 문자열 조각은 모두 로그에서 가린다.
if ! node - "$work" <<'NODE'
const fs = require('fs')
const path = require('path')
const work = process.argv[2]
let config
try {
  config = JSON.parse(process.env.NIRO_DEPLOY)
} catch {
  console.error('NIRO_DEPLOY가 올바른 JSON이 아닙니다. setup-deploy.sh가 출력한 한 줄을 그대로 다시 넣어 주세요.')
  process.exit(1)
}
const secrets = []
const walk = (v) => (typeof v === 'string' ? secrets.push(v) : v && typeof v === 'object' && Object.values(v).forEach(walk))
walk(config)
if (process.env.GITHUB_ACTIONS) for (const s of secrets) if (s.length >= 6) console.log(`::add-mask::${s}`)
const id = /^[A-Za-z0-9_-]{10,}$/
if (!config || typeof config.clasprc !== 'object' || config.clasprc === null || !id.test(config.scriptId ?? '')) {
  console.error('NIRO_DEPLOY에 clasprc(객체)와 scriptId가 있어야 합니다. setup-deploy.sh를 다시 실행해 주세요.')
  process.exit(1)
}
if (config.deploymentId !== undefined && !id.test(config.deploymentId)) {
  console.error('NIRO_DEPLOY의 deploymentId 형식이 올바르지 않습니다.')
  process.exit(1)
}
fs.writeFileSync(path.join(work, 'auth', '.clasprc.json'), JSON.stringify(config.clasprc))
fs.writeFileSync(path.join(work, 'project', '.clasp.json'), JSON.stringify({ scriptId: config.scriptId, rootDir: '.' }))
fs.writeFileSync(path.join(work, 'deployment-id'), config.deploymentId ?? '')
fs.writeFileSync(path.join(work, 'secrets.json'), JSON.stringify(secrets))
NODE
then
  exit 1
fi
cp "$dist/index.html" "$dist/Code.js" "$dist/appsscript.json" "$work/project/"

cd "$work/project"
auth=(-A "$work/auth/.clasprc.json")

# clasp 오류 줄 중 원인을 알 만한 줄만 보여 주되, NIRO_DEPLOY 안의 문자열 값(토큰·ID)은 ***로 가린다.
show_errors() {
  grep -iE "error|denied|enabled|invalid|unauthor|401|403|404" "$1" | head -5 |
    node -e '
      const fs = require("fs")
      const secrets = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
      let text = fs.readFileSync(0, "utf8")
      for (const s of secrets.filter((s) => s.length >= 6).sort((a, b) => b.length - a.length)) text = text.split(s).join("***")
      process.stderr.write(text)
    ' "$work/secrets.json" || true
}

deployment_id=$(cat "$work/deployment-id")
if [ -z "$deployment_id" ]; then
  echo "갱신할 웹 앱 배포를 찾습니다."
  if ! "$clasp" "${auth[@]}" list-deployments --json >"$work/deployments.json" 2>"$work/list.log"; then
    echo "clasp list-deployments가 실패했습니다." >&2
    show_errors "$work/list.log"
    exit 1
  fi
  # @HEAD(버전 번호 없음)가 아닌 배포가 정확히 하나일 때만 그 배포를 쓴다. ID는 출력하지 않는다.
  # shellcheck disable=SC2016 # 작은따옴표 안의 ${}는 셸이 아닌 JavaScript 템플릿 문자열이다.
  if ! deployment_id=$(node -e '
    const list = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const versioned = (Array.isArray(list) ? list : []).filter((d) => d && d.deploymentId && Number.isInteger(d.versionNumber))
    if (versioned.length !== 1) {
      console.error(`버전 배포가 ${versioned.length}개라 어느 것을 갱신할지 정할 수 없습니다. NIRO_DEPLOY에 deploymentId를 지정해야 합니다(setup-deploy.sh를 다시 실행).`)
      process.exit(1)
    }
    process.stdout.write(versioned[0].deploymentId)
  ' "$work/deployments.json"); then
    exit 1
  fi
fi

echo "Apps Script에 파일을 올립니다(index.html, Code.js, appsscript.json)."
if ! "$clasp" "${auth[@]}" push -f >"$work/push.log" 2>&1; then
  echo "clasp push가 실패했습니다." >&2
  show_errors "$work/push.log"
  exit 1
fi

echo "기존 웹 앱 배포를 새 버전으로 갱신합니다."
if ! "$clasp" "${auth[@]}" update-deployment "$deployment_id" -d "commit $short_sha" --json >"$work/deploy.json" 2>"$work/deploy.log"; then
  echo "clasp update-deployment가 실패했습니다." >&2
  show_errors "$work/deploy.log"
  exit 1
fi
version=$(node -e 'const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(j.versionNumber ?? ""))' "$work/deploy.json" 2>/dev/null || true)
if [ -z "$version" ]; then
  echo "새 버전 번호를 확인하지 못했습니다." >&2
  exit 1
fi

{
  echo "### Apps Script 자동 배포 완료"
  echo ""
  echo "- 버전: $version"
  echo "- 커밋: $short_sha"
  echo "- 기존 웹 앱 배포를 갱신했습니다(URL 그대로)."
} >>"$summary"
