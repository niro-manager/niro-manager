# Codex에서 이어서 작업하기

## 현재 저장소

[niro-manager/niro-manager](https://github.com/niro-manager/niro-manager)는 Public 조직 저장소입니다. 이전 주소 `Hoyasiro/Niro-Manager` 대신 새 저장소를 선택합니다. main에는 PR #3까지 반영되어 있습니다(2026-10-11 확인).

## 작업 환경

1. `AGENTS.md`, `CLAUDE.md`, `docs/DEPLOYMENT_CHECKLIST.md`를 읽습니다.
2. `git remote -v`, `git status -sb`, 원격 main을 확인하고 별도 작업 브랜치를 만듭니다.
3. Node.js 22 이상에서 `npm ci`를 실행합니다. 명령은 README를 참고합니다.
4. Google 연결이 필요한 로컬 개발에서만 `.env.local`에 공개 설정값 3개를 넣습니다. Codex 환경 변수는 GitHub Actions 변수와 별개입니다.
5. 변경 후 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`를 실행하고 PR로 전달합니다. 사용자 승인 없이 병합하지 않습니다.

GitHub 연결 목록에 저장소가 없으면 조직의 GitHub App 저장소 접근 범위를 확인합니다. API별 권한은 다르므로 저장소 읽기 성공만으로 Actions Variables나 조직 관리 권한까지 있다고 판단하지 않습니다.

## 다음 작업

대상 파일·탭 분석과 테스트 복사본 쓰기 범위는 이미 합의되어 있습니다. 배포 준비 상태와 Google 설정을 확인하고 실제 로그인 → Picker → 복사본 읽기 → 복사본 쓰기·재조회 순으로 검증합니다. 실제 계정 동의와 파일 선택은 사용자가 직접 수행합니다. 원본 쓰기 잠금은 별도 승인 전까지 유지합니다.
