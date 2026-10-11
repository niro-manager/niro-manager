# Codex에서 이어서 작업하기

## 현재 저장소

[niro-manager/niro-manager](https://github.com/niro-manager/niro-manager)는 Public 조직 저장소입니다. 2026-10-11 사용자 결정으로 앱을 차계부에 연결된 Apps Script 웹 앱으로 전환했습니다(GitHub Pages·Google Cloud·PWA 사용 안 함).

## 작업 환경

1. `AGENTS.md`, `CLAUDE.md`, `docs/APPS_SCRIPT_SETUP.md`를 읽습니다.
2. `git remote -v`, `git status -sb`, 원격 main을 확인하고 별도 작업 브랜치를 만듭니다.
3. Node.js 22 이상에서 `npm ci`를 실행합니다. 명령은 README를 참고합니다.
4. 변경 후 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`를 실행하고 PR로 전달합니다. 사용자 승인 없이 병합하지 않습니다.

로컬 `npm run dev`에는 `google.script.run`이 없어 시트에 연결되지 않습니다. 화면 확인은 가짜 서버 함수를 넣거나 테스트 복사본의 Apps Script에 올려 확인합니다. Apps Script 편집기 반영과 배포는 사용자가 직접 수행합니다.
