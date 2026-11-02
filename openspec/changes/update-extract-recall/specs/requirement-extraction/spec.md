## ADDED Requirements

### Requirement: 의무 표현이 없는 요구 줄
시스템은 의무 표현("shall / must / required …")이 없어도 다음 줄을 요구사항 후보로 뽑아야 한다(SHALL, CR-01). 데이터시트가 아닌 표에서 한 칸이 상태 값("Mandatory", "Required", "필수")으로 2줄 이상 반복되면 그 값이 있는 줄(머리 줄은 빼고), 필수 제출물·제출 서류 절의 짧은 목록 줄(문서에 한 번만 나오는 줄), 위험 표현 사전에 걸리는 문장. [제안 11-02]

#### Scenario: 상태 칸이 있는 요구 표
- **WHEN** 머리 줄 "ID | Requirement | Required Bidder Response | Status"와 상태가 "Mandatory"인 줄 3개가 있는 표를 추출하면
- **THEN** 상태가 "Mandatory"인 3줄이 요구사항 후보이고 머리 줄은 후보가 아니다

#### Scenario: 제출물 목록 절
- **WHEN** 제목이 "2. Mandatory Proposal Submission"인 절의 목록 줄 "Manufacturer product datasheet and a complete bill of materials for every offered item."을 추출하면
- **THEN** 의무 표현이 없어도 요구사항 후보이다

#### Scenario: 머리말 반복 줄
- **WHEN** 제출 서류 절 안에 문서 곳곳에 반복되는 머리말 줄과 15자보다 짧은 쪽 번호 줄이 있으면
- **THEN** 그 줄들은 후보가 아니다

#### Scenario: 위험 표현 문장
- **WHEN** "No deviations from the technical requirements will be accepted after contract award."를 추출하면
- **THEN** 의무 표현이 없어도 요구사항 후보이고, 처리하면 포괄 조항 위험 조건 후보가 된다
