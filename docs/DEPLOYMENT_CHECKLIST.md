# 이전 후 GitHub Pages 배포 점검

2026-10-11 확인 기준입니다. 미확인 항목을 미설정으로 단정하지 않습니다.

## 확인된 상태

| 항목 | 상태 |
|---|---|
| 저장소 | `niro-manager/niro-manager`, 조직 소유, Public, 기본 브랜치 main |
| main | PR #3 병합 `d4b7f5df03314d63e2fb46ca825f576e66ef0835`, CI 성공 |
| Pages | build_type `workflow`(GitHub Actions), github-pages 환경에 main 배포 허용 |
| 최근 배포 | [실행 38026841992](https://github.com/niro-manager/niro-manager/actions/runs/38026841992) skipped. 이전 전 저장소 조건으로 건너뛴 실행이며 이전 자체는 새 push가 아님 |
| 사이트 | `https://niro-manager.github.io/niro-manager/` HTTP 404 |
| 정적 경로 | Vite base, HTML 링크, manifest start_url/scope, 서비스 워커 등록 범위 `/niro-manager/` 일치 |
| PWA 식별자 | manifest id `/niro-manager/niro-manager` 유지 |
| GitHub 변수 | 조회 HTTP 403. 등록 여부·값 미확인 |
| Google Cloud | 연결된 관리 자격 증명 없음. 프로젝트/API/OAuth/키 제한 미확인 |

## Codex가 준비한 변경

- 수동 실행도 main에서만 배포하도록 제한합니다.
- Google 변수 누락·공백, OAuth ID 접미사, 프로젝트 번호 형식을 배포 전에 검사합니다. 값은 로그에 출력하지 않습니다.
- Pages 구성 확인과 타입 검사·린트를 배포 작업에도 추가합니다. CI 성공과 별개로 배포 작업 자체에서 검증합니다.
- 이전 전 인계 문서와 API 키 리퍼러 설정 안내를 갱신합니다.
- 원본 쓰기 잠금, 인증 범위(`drive.file`), 시트 구조는 유지합니다.

## 사용자: Google Cloud에서 확인할 것

기존 프로젝트가 있다면 새로 만들기 전에 그 설정을 확인합니다. 상세 화면 순서는 [GOOGLE_SETUP.md](GOOGLE_SETUP.md)를 따릅니다.

1. 같은 프로젝트에서 Sheets API, Drive API, Picker API를 사용 설정합니다.
2. Google 인증 플랫폼에서 외부/테스트 사용자에 본인 계정을 등록하고 `drive.file` 범위를 확인합니다.
3. 웹 애플리케이션 OAuth 클라이언트의 JavaScript 원본에 `https://niro-manager.github.io`를 넣습니다. 경로 `/niro-manager/`는 넣지 않습니다. 팝업 토큰 방식이므로 리디렉션 URI나 client secret은 필요하지 않습니다.
4. Picker API 키의 웹사이트 제한은 `https://niro-manager.github.io/*`, API 제한은 Google Picker API로 설정합니다. 경로 제한은 출처만 전달하는 Referer와 맞지 않을 수 있습니다.
5. OAuth 클라이언트 ID, API 키, 프로젝트 **번호**가 같은 프로젝트 소속인지 확인합니다.

### 환경 변수 디버깅 결과 (2026-10-11)

Codex 실행 환경에서 값의 내용을 출력하지 않고 형식을 검사한 결과, 등록된 세 값이 서로 다른 칸에 들어 있었습니다. 아래는 확인 당시의 매핑입니다. 수정할 때 기존 세 값을 먼저 따로 보관한 다음 이동해야 덮어쓰기로 잃어버리지 않습니다.

| 올바른 변수 | 확인 당시 값이 들어 있던 변수 | 값의 형식 |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `VITE_GOOGLE_API_KEY` | `…apps.googleusercontent.com` |
| `VITE_GOOGLE_API_KEY` | `VITE_GOOGLE_APP_ID` | `AIza…` API 키 |
| `VITE_GOOGLE_APP_ID` | `VITE_GOOGLE_CLIENT_ID` | 숫자 프로젝트 번호 |

환경 등록 여부와 값의 올바른 매핑은 별개입니다. 실행 환경 설정 화면에서 이 매핑을 수정하고 GitHub Repository variables에도 올바른 이름으로 등록합니다. 배포 검사는 API 키 형식과 값이 다른 변수에 잘못 들어간 경우도 진단하며 값을 출력하지 않습니다. 실제 API 활성화·키 제한·OAuth 원본은 이 형식 검사만으로 확인할 수 없습니다.

## 사용자: GitHub와 브라우저에서 할 것

1. [Actions Variables](https://github.com/niro-manager/niro-manager/settings/variables/actions)의 **Repository variables**에 `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`를 확인·등록합니다. 값은 브라우저 번들에 공개됩니다. client secret·서비스 계정 키·액세스 토큰은 넣지 않습니다. Codex 실행 환경에 등록해도 이곳에는 자동 등록되지 않습니다.
2. 준비 PR을 검토하고 승인된 변경을 main에 병합합니다. main push가 배포를 시작합니다. 변수만 나중에 바꿨다면 [Deploy to GitHub Pages](https://github.com/niro-manager/niro-manager/actions/workflows/deploy.yml) → Run workflow → **main**으로 새 빌드·배포를 실행합니다.
3. Pages 소스는 이미 GitHub Actions입니다. 실패 시 [Pages 설정](https://github.com/niro-manager/niro-manager/settings/pages), 조직 Actions 정책 및 github-pages 환경의 main 허용 여부를 확인합니다.
4. [앱](https://niro-manager.github.io/niro-manager/)에서 실제 Google 로그인 → Picker로 지정된 **테스트 복사본** 선택 → 두 탭 읽기·차트 표시를 확인합니다. 파일 ID 직접 입력만으로 `drive.file` 접근 권한이 생기지는 않습니다.
5. 복사본 모드에서 주유·정비 입력 후 재조회와 기존 수식·서식 보존을 확인합니다. 원본 쓰기 전환은 별도 승인 사항입니다.
6. Android Chrome 설치·재실행, 설정 JSON 백업/불러오기, 오프라인 안내·연결 복구를 확인합니다. 이후 iOS Safari 및 데스크톱에서 확인합니다.

실제 Google 계정 동의·Picker 선택과 기기 설치는 사용자가 직접 수행해야 합니다. Google Cloud 관리 설정과 GitHub 변수 등록은 현재 연결에서 확인/변경 권한이 없어 사용자 작업으로 남깁니다. 코드의 형식 검사가 통과해도 API 활성화·키 제한·로그인 성공까지 보장하지 않습니다.
