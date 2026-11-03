## Why

판정 규칙 화면 "사람이 제안한 표현"에서 반영·반려를 정하는 규칙 담당은 제안된 표현만 보고 그 표현이 나온 원래 문장을 볼 수 없었다. 표현이 100자에서 잘렸거나("… 수평작업 등 설") 문장 일부만 제안되면 무슨 뜻인지 판단하기 어렵다. 제안할 때 뜨는 알림은 제안한 사람에게만, 잠깐 보인다.

## What Changes

- 제안 줄을 누르면(또는 표현에 초점을 두고 Enter) 줄 아래에 원래 문장 전체를 펼친다. 제안한 표현은 강조하고, 원문 위치 모두와 메모·반려 사유를 함께 보인다. 다시 누르면 접는다.
- 원래 문장은 판정 상세가 쓰는 원문 줄 API(`GET /runs/{id}/documents/{file_no}/lines`)로 그 위치의 줄만 불러온다. 파일이 없으면 저장된 줄만 보이고 그렇다고 알린다.
- [반영]·[반려]·검토 번호 링크를 눌러도 펼치지 않는다. 백엔드·API 그대로, 화면만, 마이그레이션 없음.

## Capabilities

### Modified Capabilities
- `review-workspace`: 사전 추가 제안 화면

## Impact

- `frontend/src/views/Rules.tsx`, `frontend/src/views/rules.css`, e2e `frontend/e2e/rule-suggestion.spec.ts`
