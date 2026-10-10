# Codex에서 이어서 작업하기

## 저장소 연결 전

GitHub에 `Hoyasiro/Niro-Manager`가 Private로 생성되었는지 확인합니다. Private 저장소 생성은 확인했습니다. Codex 작업 환경 연결은 아직 확인하지 않았습니다.

준비 문서는 `chore/project-setup` 같은 별도 브랜치로 올리고 main을 대상으로 PR을 만듭니다. 준비 PR이 미병합 상태라면 그 브랜치를 명시해 문서를 읽게 합니다. 사용자 승인 후 병합된 경우 main에서 새 작업 브랜치를 만듭니다.

## Codex 작업 환경

Codex의 연결된 GitHub 저장소 목록에서 `Hoyasiro/Niro-Manager`를 선택합니다. 목록에 없다면 GitHub 연결의 저장소 접근 범위에 새 저장소가 포함되었는지 확인합니다.

Codex Cloud 환경을 사용하는 경우 저장소를 선택한 작업 환경을 연결합니다. 화면과 제공 방식은 계정에서 실제 표시되는 UI를 따릅니다. 이 준비 단계에서는 앱 의존성과 설치 스크립트가 없으므로 임의의 npm 설치/실행 명령을 설정하지 않습니다.

로컬 Codex를 사용한다면 해당 저장소를 clone하고 그 폴더를 작업 대상으로 엽니다. 먼저 현재 브랜치와 문서가 보이는지 확인합니다. 인증 토큰이나 실제 차계부를 저장소에 넣지 않습니다.

공식 환경 안내: https://learn.chatgpt.com/docs/environments/cloud-environment

## 다음 작업 지시 예시

> Niro-Manager의 AGENTS.md와 CLAUDE.md를 읽고 현재 상태를 확인해줘. 별도 브랜치에서 Interactive Coding으로 진행하자. 먼저 Google Drive의 차계부 파일과 분석할 탭을 내가 지정할 수 있도록 질문 하나만 해줘. 지정 후에는 읽기 전용으로 시트 구조와 기존 기록을 분석하고, 구현 전에 중요한 설계 결정을 나와 합의해줘. 원본은 수정하지 말고 쓰기는 테스트용 복사본에서 먼저 검증해줘. PR을 만들어도 사용자 승인 없이 main에 병합하지 마.

## 연결 확인

- 정확한 저장소와 선택한 브랜치인지 확인
- README.md, AGENTS.md, CLAUDE.md 존재 및 내용 확인
- 이전 작업 상태와 미결정 사항 확인
- 첫 후속 작업용 별도 브랜치 생성

현재 앱 실행, 테스트, 빌드 명령은 없습니다. 스택을 합의한 다음 README에 추가합니다.
