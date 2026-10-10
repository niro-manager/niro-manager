# PWA 만들기 인계 노트 (GitHub Pages + 안드로이드 크롬)

이 저장소의 PWA 작업은 이 문서의 규칙을 따릅니다. 사용자가 제공한 인계 노트이며, 야구맘기록지·요리 레시피 앱에서 실제로 겪은 문제(2026-10)를 바탕으로 정리했습니다.

## 1. 꼭 지킬 규칙 (요약)

- **앱 하나 = 사이트 주소 하나.** 설치형 앱마다 전용 GitHub 조직을 만들어 `https://<조직>.github.io/<저장소>/`로 배포합니다. 한 계정 주소(`https://<계정>.github.io/`) 아래에 PWA를 두 개 이상 두지 않습니다.
- **manifest `id`는 앱 경로를 포함한 절대 경로로 씁니다.** 예: `"/<저장소>/<앱이름>"`. `"./"`처럼 상대 경로로 쓰지 않습니다.
- **서비스 워커가 manifest를 캐시하면, manifest를 고칠 때 캐시 이름도 올립니다.**
- **기록·데이터는 처음부터 백업(내보내기)·불러오기 기능을 만듭니다.** 주소를 옮기면 데이터가 따라오지 않습니다.

## 2. Niro Manager에 적용할 때 확인할 점

아래는 규칙을 이 프로젝트에 적용한 내용입니다.

- **호스팅:** GitHub Pages. 무료 플랜의 Pages는 Public 저장소가 필요하므로 저장소를 Public으로 전환합니다. 비밀값·개인정보·실제 차계부 데이터는 저장소에 넣지 않습니다.
- **전용 조직:** 전용 조직 `niro-manager`를 사용하고 이 저장소를 `niro-manager`라는 이름으로 이전한 뒤 Public으로 전환합니다(2026-10-10 결정). 배포 주소는 `https://niro-manager.github.io/niro-manager/`입니다.
- **manifest `id`·`start_url`·`scope`:** `id`는 `/niro-manager/niro-manager`, `start_url`·`scope`는 `/niro-manager/`입니다(`public/manifest.webmanifest`, `vite.config.ts`의 `base`). 저장소 이름이 바뀌면 설치 앱 식별자가 바뀌므로 바꾸지 않습니다.
- **서비스 워커 캐시:** 앱 셸(정적 파일)만 캐시합니다. Google 인증 응답, API 응답, 차계부 기록은 캐시하지 않습니다(`AGENTS.md` 원칙). 페이지와 manifest는 네트워크 우선, 빌드 해시가 붙은 `assets/`는 캐시 우선입니다. manifest나 앱 셸 목록을 바꾸면 `public/sw.js`의 `CACHE_VERSION`을 올립니다.
- **백업·불러오기:** 원본 데이터는 Google 스프레드시트에 있으므로 주소가 바뀌어도 기록 자체는 보존됩니다. 다만 앱이 브라우저에 저장하는 설정(대상 시트 ID, 복사본/원본 모드, 탭 이름)은 주소를 옮기면 사라지므로 첫 버전부터 설정 화면에서 JSON 내보내기·불러오기를 제공합니다(`src/settings/`). 기록 내보내기는 앱에 두지 않고 Google Sheets의 "파일 → 다운로드"를 씁니다(2026-10-10 결정). 내보낸 파일은 Git에 커밋하지 않습니다.
- **Google OAuth:** OAuth 클라이언트의 승인된 JavaScript 원본은 배포 주소(`https://niro-manager.github.io`)와 일치해야 합니다. 주소를 옮기면 OAuth 설정도 갱신해야 합니다.
- **검증 기기:** 안드로이드 크롬 설치를 1차 기준으로 검증하고, iOS Safari·Windows/macOS 브라우저 설치도 확인합니다.
