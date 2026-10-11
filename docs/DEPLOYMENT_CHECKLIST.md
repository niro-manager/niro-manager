# 초기 개시 및 배포 점검

2026-10-11 기준입니다.

## 완료한 항목

- 조직 이전·Public 전환·기본 브랜치 main 확인.
- Pages 배포 성공: [실행 38130617402](https://github.com/niro-manager/niro-manager/actions/runs/38130617402).
- Vite·manifest·서비스 워커 범위 `/niro-manager/` 일치.
- Google 설정값 사전 검사·main 배포 제한 적용.
- PR #5 병합: github-pages 환경 Variables·Secrets 지원. Variables 우선.
- 사용자가 API 키 리퍼러를 `https://niro-manager.github.io/*`로 수정한 뒤 정상 동작 확인.
- 사용자가 남은 PR 병합·배포와 원본 저장 활성화 명시 승인.
- 테스트 복사본에서 주유·정비 추가·끼워 넣기·수식·서식 보존 실제 검증 완료(CLAUDE.md).

## 운영 및 기기 설정

[앱 열기](https://niro-manager.github.io/niro-manager/)

1. 설정 → Google Drive에서 원본 차계부 선택.
2. 연결 대상 **원본** → **대상·탭 이름 저장**. 입력 화면의 파일 이름과 원본 표시 확인.
3. 실제 기록을 저장할 때 저장 전 내용을 확인하고 저장 후 기록 확인.
4. 기기별 PWA 설치·재실행·설정 백업/불러오기 확인. 이 항목은 아직 미완료.

기존 복사본 설정은 자동 변경하지 않습니다. 저장 전 확인·중복 경고·저장 직전 재조회·저장 후 검증·오프라인 저장 차단을 유지합니다. 이번 변경에서 실제 원본에 검증용 기록을 쓰지 않았습니다. Google 계정 동의·Picker 선택·기기 설치는 사용자 브라우저에서 수행합니다. Google Cloud 관리 설정은 직접 조회하지 못했으며 정상 동작은 사용자 확인을 근거로 기록합니다.

## 문제 해결 링크

- [배포 Actions](https://github.com/niro-manager/niro-manager/actions/workflows/deploy.yml): 설정 검사 → build → deploy 순서로 확인.
- [Actions Variables](https://github.com/niro-manager/niro-manager/settings/variables/actions): CLIENT_ID는 OAuth ID, API_KEY는 Picker 키, APP_ID는 숫자 프로젝트 번호. Codex 환경 값은 자동 전달되지 않음.
- [Google 사용자 인증 정보](https://console.cloud.google.com/apis/credentials): OAuth 원본 `https://niro-manager.github.io`, 키 리퍼러 `https://niro-manager.github.io/*`. 경로로 제한하지 않음.
- [Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com): 같은 프로젝트에서 사용 설정. 상세 안내는 [GOOGLE_SETUP.md](GOOGLE_SETUP.md).
- GitHub 값 변경 시 main에서 새 빌드 필요. Google 키 제한만 변경하면 잠시 기다리고 새로고침.

최종 CI·배포 결과는 PR과 Actions에서 확인합니다. 가족 공유·동시 입력 기능은 향후 범위입니다.
