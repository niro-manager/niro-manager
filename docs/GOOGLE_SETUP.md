# Google 로그인·파일 선택 설정

앱은 서버 없이 브라우저에서 Google에 로그인하고, `drive.file` 권한으로 **사용자가 Google Picker에서 고른 파일에만** 접근합니다. 아래 값 세 개가 필요합니다. 모두 브라우저에 공개되는 값이라 비밀값은 아니지만, 저장소에는 커밋하지 않고 환경 변수로 넣습니다.

| 환경 변수 | 값 |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth 클라이언트 ID (`…apps.googleusercontent.com`) |
| `VITE_GOOGLE_API_KEY` | Google Picker용 API 키 |
| `VITE_GOOGLE_APP_ID` | Google Cloud 프로젝트 **번호**(숫자). 프로젝트 ID와 다름 |

## 1. Google Cloud 프로젝트

1. https://console.cloud.google.com 에서 새 프로젝트를 만듭니다(예: `niro-manager`).
2. 대시보드(또는 IAM 및 관리자 → 설정)에서 **프로젝트 번호**를 확인합니다 → `VITE_GOOGLE_APP_ID`.
3. API 및 서비스 → 라이브러리에서 **Google Sheets API**, **Google Picker API**, **Google Drive API**를 사용 설정합니다.

## 2. OAuth 동의 화면 (Google 인증 플랫폼)

1. 사용자 유형: **외부**. 앱 이름(예: Niro Manager)과 지원 이메일을 입력합니다.
2. 데이터 액세스(범위)에 `https://www.googleapis.com/auth/drive.file` 하나만 추가합니다.
3. 대상(테스트 사용자)에 본인 Google 계정을 추가합니다. 게시 상태는 **테스트**로 두어도 됩니다. 동의 화면의 앱 이름·요청 범위·계정을 확인합니다. 접근이 차단되면 테스트 사용자 등록과 선택한 프로젝트를 먼저 확인합니다.

## 3. OAuth 클라이언트 ID

사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → **웹 애플리케이션**.

- 승인된 JavaScript 원본:
  - `https://niro-manager.github.io`
  - `http://localhost:5173` (개발 서버)
  - `http://localhost:4173` (빌드 미리보기)
- 승인된 리디렉션 URI: 비워 둡니다(팝업 토큰 방식).

만든 클라이언트 ID → `VITE_GOOGLE_CLIENT_ID`. 클라이언트 보안 비밀번호는 쓰지 않으며 어디에도 넣지 않습니다.

## 4. API 키

사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키. 만든 뒤 **키 제한**을 꼭 설정합니다.

- 애플리케이션 제한: **HTTP 리퍼러**
  - `https://niro-manager.github.io/*`
  - `http://localhost:5173/*`
  - `http://localhost:4173/*`
- API 제한: **Google Picker API**만 선택

→ `VITE_GOOGLE_API_KEY`.

외부 요청의 Referer는 브라우저 정책에 따라 경로 없이 출처만 전달될 수 있으므로 `/niro-manager/*`로 제한하지 않습니다. 전용 조직 출처 전체를 허용합니다. OAuth 클라이언트, API 키, 프로젝트 번호는 **같은 Google Cloud 프로젝트**의 값을 사용합니다.

## 5. 값 넣기

- **배포:** GitHub 저장소 Settings → Secrets and variables → Actions → **Variables** 탭에 위 세 이름으로 추가합니다. `deploy.yml`이 빌드할 때 넣습니다.
- **개발:** `.env.example`을 `.env.local`로 복사해 값을 채웁니다. `.env.local`은 `.gitignore`에 포함되어 커밋되지 않습니다.

Codex Cloud 실행 환경의 변수는 GitHub Actions에 자동 전달되지 않습니다. Actions의 **Repository variables**에 별도로 등록합니다. `github-pages` 환경의 Variables도 지원합니다. Secrets에 같은 이름으로 등록한 경우에도 읽으며, 둘 다 있으면 Variables가 우선입니다. 값 변경 후에는 main에서 새 배포를 실행해야 번들에 반영됩니다. 배포 전 검사에서는 누락·형식만 확인하며 실제 프로젝트/API 설정까지 검증하지는 않습니다.

## 6. 사용

1. 앱 설정 화면에서 **Google Drive에서 선택** → 로그인 → 사용할 차계부 스프레드시트를 고릅니다.
2. 원본에 저장하려면 연결 대상을 **원본**으로 선택하고 **대상·탭 이름 저장**을 누릅니다.
3. 기록·차트를 확인하고 입력 화면에서 저장 전 내용을 확인합니다.

액세스 토큰은 약 1시간 유효하며 메모리에만 둡니다. 만료되거나 앱을 다시 열면 로그인 버튼을 다시 누릅니다. 고른 파일에 대한 접근 허용은 같은 OAuth 클라이언트를 쓰는 동안 유지되므로, 설정 백업을 불러오면 파일을 다시 고르지 않아도 됩니다.

배포 순서와 사용자 확인 항목은 [이전 후 배포 점검](DEPLOYMENT_CHECKLIST.md)을 참고합니다.

## API 키 오류 해결 기록

2026-10-11 경로를 포함한 리퍼러 제한에서 Picker API 키 오류가 발생했습니다. `https://niro-manager.github.io/*`로 변경한 뒤 사용자가 정상 동작을 확인했습니다. 키 제한만 변경하면 재배포가 필요하지 않습니다.

[사용자 인증 정보](https://console.cloud.google.com/apis/credentials) · [Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com) · [GitHub Variables](https://github.com/niro-manager/niro-manager/settings/variables/actions) · [배포 Actions](https://github.com/niro-manager/niro-manager/actions/workflows/deploy.yml)
