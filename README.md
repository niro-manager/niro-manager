# Niro Manager

개인용 차량 관리 웹앱(PWA). 기존 Google Drive의 `차계부` Google 스프레드시트를 원본 데이터 저장소로 유지하면서 주유·정비 기록을 입력하고 누적 데이터를 시각화합니다.

## 현재 상태

MVP 1단계(읽기 전용) 개발 중입니다. Vite + React + TypeScript 앱, PWA manifest·서비스 워커, Google 로그인(`drive.file`)과 Picker 파일 선택, 주유·정비 기록 읽기와 목록, 설정 백업·불러오기를 만들었습니다. 월별 차트는 집계 기준 합의 후 만듭니다. 실제 Google 계정 연결은 [Google 설정](docs/GOOGLE_SETUP.md) 후 확인합니다. 원본 스프레드시트는 읽기만 했고 수정하지 않았습니다.

GitHub 저장소: `Hoyasiro/Niro-Manager` (Private). 준비 문서 PR #1은 사용자 승인 후 main에 병합되었습니다. 분석 대상 시트를 확정하고 읽기 전용으로 구조를 분석했습니다(`docs/SHEET_ANALYSIS.md`).

## 확정된 범위

- 초기 사용자는 소유자 한 명이며 Google 계정으로 로그인합니다.
- 기존 스프레드시트의 기록, 탭, 열, 수식 및 서식을 보존합니다.
- 주유 및 정비 내역 입력·조회와 Google Sheets 데이터 동기화를 지원합니다.
- 월별 주유비, 주유량, 정비비, 주유 단가를 시각화합니다.
- Android, iOS, Windows, macOS의 브라우저에서 사용 가능한 PWA를 목표로 합니다.
- 초기에는 별도 데이터베이스 서버를 사용하지 않습니다.

## 문서 구조

- `AGENTS.md`: Codex 작업 규칙, 아키텍처 원칙, 데이터 보호 및 브랜치/PR 규칙
- `CLAUDE.md`: 확정 요구사항, 진행 상황, 미결정 사항 및 TODO
- `docs/CODEX_START.md`: Codex에서 개발을 이어가는 절차
- `docs/GOOGLE_SETUP.md`: Google Cloud 프로젝트, OAuth 클라이언트, API 키 설정 절차
- `docs/SHEET_ANALYSIS.md`: 차계부 시트 구조 분석(읽기 전용, 개인 기록 제외)
- `docs/PWA_GUIDE.md`: PWA 생성·배포 규칙(GitHub Pages, manifest id, 캐시, 백업)
- `.github/pull_request_template.md`: 변경 내용과 검증을 기록하는 PR 양식

## 실행 방법

Node.js 22 이상이 필요합니다. Google 로그인을 쓰려면 [Google 설정](docs/GOOGLE_SETUP.md)대로 `.env.local`을 만듭니다.

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173/niro-manager/)
npm run typecheck  # 타입 검사
npm run lint       # oxlint
npm test           # vitest 단위 테스트
npm run build      # dist/ 정적 빌드
npm run preview    # 빌드 결과 확인 (서비스 워커는 빌드에서만 등록)
```

## 코드 구조

- `src/domain/`: 시트 값 해석(날짜 직렬값, 빈 칸과 0 구분), 주유(`시트1`)·정비(`시트2`) 기록 매핑
- `src/auth/`: Google Identity Services 토큰 로그인(토큰은 메모리에만)
- `src/sheets/`: Sheets API 어댑터(읽기, 오류 구분), Google Picker 파일 선택
- `src/records/`: 기록 목록 화면
- `src/settings/`: 연결할 시트 설정, localStorage 저장, JSON 백업·불러오기
- `public/manifest.webmanifest`, `public/sw.js`: PWA 설정과 앱 셸 캐시
- `.github/workflows/ci.yml`: PR·main에서 타입 검사, 린트, 테스트, 빌드
- `.github/workflows/deploy.yml`: main 병합 후 GitHub Pages 배포(`niro-manager/niro-manager` 저장소에서만 실행)

## 배포

배포 주소는 `https://niro-manager.github.io/niro-manager/`입니다. 저장소를 `niro-manager` 조직으로 옮기고 Settings → Pages → Source를 "GitHub Actions"로 설정해야 배포가 동작합니다.

## 개발 시작

`AGENTS.md`와 `CLAUDE.md`를 먼저 읽고 [Codex 시작 안내](docs/CODEX_START.md)를 따릅니다. 중요한 설계 결정은 한 번에 질문 하나씩 사용자와 합의합니다.

첫 개발 작업은 대상 `차계부` 파일과 탭을 사용자에게 확인하고 읽기 전용으로 구조를 분석하는 것입니다. 프레임워크, 호스팅, 인증 방식은 정했습니다(`CLAUDE.md`의 확정된 결정). 쓰기 범위와 집계 정의는 아직 결정하지 않았습니다.

모든 변경은 별도 브랜치에서 진행하고 자체 검토·검증 → Push → PR → 사용자 검토 → 승인된 Merge 순서를 따릅니다. PR 생성이나 Push만으로 main에 병합되지 않습니다. 사용자 승인 없이 main 병합과 자동 병합을 수행하지 않습니다.

## 데이터 보호

원본 쓰기는 기본적으로 비활성화합니다. 쓰기 기능은 사용자가 지정한 테스트용 복사본에서 먼저 검증하고, 원본으로 전환하기 전에 별도 승인을 받습니다. 인증 토큰, 개인정보, 실제 차계부 내보내기 파일은 Git에 저장하지 않습니다.

OAuth 클라이언트 ID, API 키, 프로젝트 번호는 커밋하지 않고 `.env.local`(개발)과 GitHub Actions Variables(배포)로 넣습니다.
