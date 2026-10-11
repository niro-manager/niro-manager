# Niro Manager

개인용 차량 관리 웹 앱(Google Apps Script 웹 앱). 기존 Google Drive의 `차계부` Google 스프레드시트를 원본 데이터 저장소로 유지하면서 주유·정비 기록을 입력하고 누적 데이터를 시각화합니다.

## 현재 상태

초기 개인용 운영 단계입니다. 기록 조회·월별 차트·주유 및 정비 입력·설정 백업을 제공합니다. 2026-10-11 사용자 결정으로 GitHub Pages + Google Cloud(OAuth·Picker) 방식에서 **차계부 스프레드시트에 연결된 Apps Script 웹 앱**으로 전환했습니다. 웹 앱은 소유자 계정으로 실행되고 소유자만 열 수 있어 앱에서 따로 로그인하지 않습니다. 설치와 배포는 [Apps Script 설치·배포 안내](docs/APPS_SCRIPT_SETUP.md)를 따릅니다.

## 확정된 범위

- 초기 사용자는 소유자 한 명이며 Google 계정으로 로그인합니다.
- 기존 스프레드시트의 기록, 탭, 열, 수식 및 서식을 보존합니다.
- 주유 및 정비 내역 입력·조회와 Google Sheets 데이터 동기화를 지원합니다.
- 월별 주유비, 주유량, 정비비, 주유 단가를 시각화합니다.
- Android, iOS, Windows, macOS의 브라우저에서 사용합니다(Apps Script 웹 앱, 휴대폰은 홈 화면 바로가기). PWA 설치는 전환으로 제외했습니다.
- 초기에는 별도 데이터베이스 서버를 사용하지 않습니다.

## 문서 구조

- `AGENTS.md`: Codex 작업 규칙, 아키텍처 원칙, 데이터 보호 및 브랜치/PR 규칙
- `CLAUDE.md`: 확정 요구사항, 진행 상황, 미결정 사항 및 TODO
- `docs/CODEX_START.md`: Codex에서 개발을 이어가는 절차
- `docs/APPS_SCRIPT_SETUP.md`: Apps Script 설치·웹 앱 배포·업데이트 절차
- `docs/SHEET_ANALYSIS.md`: 차계부 시트 구조 분석(읽기 전용, 개인 기록 제외)
- `.github/pull_request_template.md`: 변경 내용과 검증을 기록하는 PR 양식

## 실행 방법

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run typecheck  # 타입 검사
npm run lint       # oxlint
npm test           # vitest 단위 테스트
npm run build      # dist/에 Apps Script용 index.html·Code.js·appsscript.json 생성
```

`npm run dev`로 화면을 띄울 수 있지만 Apps Script 밖에서는 시트에 연결되지 않습니다.

## 코드 구조

- `apps-script/Code.js`, `apps-script/appsscript.json`: Apps Script 서버(웹 앱 제공, 시트 읽기, 허용된 batchUpdate 요청만 적용, Sheets 고급 서비스)
- `vite.config.ts`: JS·CSS를 `index.html` 한 파일로 묶고 서버 파일을 `dist/`에 복사
- `src/domain/`: 시트 값 해석(날짜 직렬값, 빈 칸과 0 구분), 주유(`시트1`)·정비(`시트2`) 기록 매핑
- `src/sheets/`: 시트 어댑터(`sheetsClient.ts` 연결 형식, `appsScriptBackend.ts` 서버 함수 호출과 오류 구분), 읽기
- `src/records/`: 기록 목록 화면, 시트 읽기 상태(`useLogbook.ts`: 열면 바로 읽기, 앱 복귀 시 5분 경과면 재읽기)
- `src/entry/`, `src/domain/fuelInput.ts`, `src/domain/maintenanceInput.ts`, `src/sheets/fuelWriter.ts`, `src/sheets/maintenanceWriter.ts`: 주유·정비 입력, 쓰기 위치 계산(추가/날짜순 끼워 넣기), batchUpdate 쓰기와 저장 후 검증
- `src/sheets/writeGuard.ts`: 원본 쓰기 잠금 스위치
- `src/entry/drafts.ts`, `src/session/useOnline.ts`: 저장하지 않은 입력 임시 보관, 오프라인 안내와 연결 복구 시 재읽기(기록 자체는 기기에 저장하지 않음)
- `src/domain/monthly.ts`, `src/charts/`: 월별 집계(주유 단가는 리터 가중 평균)와 SVG 차트
- `src/settings/`: 탭 이름 설정, localStorage 저장, JSON 백업·불러오기
- `.github/workflows/ci.yml`: PR·main에서 타입 검사, 린트, 테스트, 빌드 후 `apps-script` 아티팩트 업로드

## 개발 시작

`AGENTS.md`와 `CLAUDE.md`를 먼저 읽고 [Codex 시작 안내](docs/CODEX_START.md)를 따릅니다. 중요한 설계 결정은 한 번에 질문 하나씩 사용자와 합의합니다.

대상 파일·탭 분석과 프레임워크, 실행 방식(Apps Script 웹 앱), 집계 기준, 테스트 복사본 쓰기 범위는 확정되어 있습니다(`CLAUDE.md`). 원본 저장 활성화가 승인되었습니다.

모든 변경은 별도 브랜치에서 진행하고 자체 검토·검증 → Push → PR → 사용자 검토 → 승인된 Merge 순서를 따릅니다. PR 생성이나 Push만으로 main에 병합되지 않습니다. 사용자 승인 없이 main 병합과 자동 병합을 수행하지 않습니다.

## 데이터 보호

복사본에서 추가·끼워 넣기·수식·서식 보존을 검증한 뒤 사용자 승인으로 원본 저장을 활성화했습니다. 저장 전 확인·중복 경고·저장 직전 재조회·저장 후 검증을 유지합니다. 인증 토큰, 개인정보, 실제 차계부 내보내기 파일은 Git에 저장하지 않습니다.

스프레드시트 ID와 Apps Script 스크립트 ID(`.clasp.json`)는 커밋하지 않습니다.
