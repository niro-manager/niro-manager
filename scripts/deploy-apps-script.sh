#!/usr/bin/env bash
# Apps Script 자동 배포(2026-11-06 사용자 결정 B). GitHub Actions의 deploy-apps-script.yml이 부른다.
# dist/의 index.html·Code.js·appsscript.json을 clasp로 올리고, 기존 웹 앱 배포를 새 버전으로 갱신한다(새 배포는 만들지 않아 URL 유지).
#
# 환경 변수
#   CLASPRC_JSON, APPS_SCRIPT_ID, APPS_SCRIPT_DEPLOYMENT_ID  GitHub Secrets. 하나라도 비면 배포를 건너뛰고 성공으로 끝낸다.
#   COMMIT_SHA      배포할 커밋(버전 설명에 앞 7자리)
#   DIST_DIR        빌드 결과 폴더(기본 dist)
#   WORK_DIR        로그인 정보·프로젝트 파일을 둘 임시 폴더(기본 $RUNNER_TEMP). 끝나면 지운다.
#   CLASP           clasp 실행 명령(기본 clasp, 테스트에서 가짜 명령으로 바꾼다)
#   GITHUB_STEP_SUMMARY  요약을 덧붙일 파일(없으면 표준 출력)
#
# 비밀값을 출력하지 않는다: set -x를 쓰지 않고, clasp 출력도 그대로 보여 주지 않는다.
set -euo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
dist="${DIST_DIR:-dist}"
clasp="${CLASP:-clasp}"
sha="${COMMIT_SHA:-unknown}"
short_sha="${sha:0:7}"

missing=()
[ -n "${CLASPRC_JSON:-}" ] || missing+=(CLASPRC_JSON)
[ -n "${APPS_SCRIPT_ID:-}" ] || missing+=(APPS_SCRIPT_ID)
[ -n "${APPS_SCRIPT_DEPLOYMENT_ID:-}" ] || missing+=(APPS_SCRIPT_DEPLOYMENT_ID)
if [ "${#missing[@]}" -gt 0 ]; then
  {
    echo "### Apps Script 자동 배포: 설정 필요"
    echo ""
    echo "GitHub Secrets가 없어 배포를 건너뛰었습니다: ${missing[*]}"
    echo "docs/APPS_SCRIPT_SETUP.md의 \"자동 배포(1회 설정)\"를 따라 주세요."
  } >>"$summary"
  exit 0
fi

# 로그에 섞여도 가려지도록 한다(Secrets는 이미 가려지지만 줄바꿈이 있는 JSON 조각까지 확실히 가린다).
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::${APPS_SCRIPT_ID}"
  echo "::add-mask::${APPS_SCRIPT_DEPLOYMENT_ID}"
fi

for file in index.html Code.js appsscript.json; do
  [ -f "$dist/$file" ] || { echo "빌드 결과에 $file이 없습니다." >&2; exit 1; }
done

work="${WORK_DIR:-${RUNNER_TEMP:-$(mktemp -d)}}/apps-script-deploy"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT
rm -rf "$work"
mkdir -p "$work/auth" "$work/project"
chmod 700 "$work"

# 로그인 정보는 임시 폴더에만 쓰고, 끝나면(실패해도) 지운다.
umask 077
printf '%s' "$CLASPRC_JSON" >"$work/auth/.clasprc.json"
if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$work/auth/.clasprc.json" 2>/dev/null; then
  echo "CLASPRC_JSON이 올바른 JSON이 아닙니다. ~/.clasprc.json 내용을 그대로 다시 넣어 주세요." >&2
  exit 1
fi
APPS_SCRIPT_ID="$APPS_SCRIPT_ID" node -e 'process.stdout.write(JSON.stringify({ scriptId: process.env.APPS_SCRIPT_ID, rootDir: "." }))' >"$work/project/.clasp.json"
cp "$dist/index.html" "$dist/Code.js" "$dist/appsscript.json" "$work/project/"

cd "$work/project"
auth=(-A "$work/auth/.clasprc.json")

# clasp 오류 줄 중 원인을 알 만한 줄만 보여 주되, 로그인 정보 JSON 안의 문자열 값(토큰 등)과 ID는 ***로 가린다.
show_errors() {
  grep -iE "error|denied|enabled|invalid|unauthor|401|403|404" "$1" | head -5 |
    CLASPRC_PATH="$work/auth/.clasprc.json" node -e '
      const fs = require("fs")
      const secrets = [process.env.APPS_SCRIPT_ID, process.env.APPS_SCRIPT_DEPLOYMENT_ID]
      const walk = (v) => (typeof v === "string" ? secrets.push(v) : v && typeof v === "object" && Object.values(v).forEach(walk))
      try { walk(JSON.parse(fs.readFileSync(process.env.CLASPRC_PATH, "utf8"))) } catch {}
      let text = fs.readFileSync(0, "utf8")
      for (const s of secrets.filter((s) => s && s.length >= 6).sort((a, b) => b.length - a.length)) text = text.split(s).join("***")
      process.stderr.write(text)
    ' || true
}

echo "Apps Script에 파일을 올립니다(index.html, Code.js, appsscript.json)."
if ! "$clasp" "${auth[@]}" push -f >"$work/push.log" 2>&1; then
  echo "clasp push가 실패했습니다." >&2
  show_errors "$work/push.log"
  exit 1
fi

echo "기존 웹 앱 배포를 새 버전으로 갱신합니다."
if ! "$clasp" "${auth[@]}" update-deployment "$APPS_SCRIPT_DEPLOYMENT_ID" -d "commit $short_sha" --json >"$work/deploy.json" 2>"$work/deploy.log"; then
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
