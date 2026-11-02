## ADDED Requirements

### Requirement: AI 문장 구분에서 묻지 않는 문장
시스템은 AI로 요구사항 후보를 작성 규칙·설명과 구분할 때, 위험 표현이 든 문장과 협조 요청 유형(비용 영향·시험·제조사 자격처럼 담당이 견적·품질·영업인 유형) 규칙에 걸리는 문장은 AI에 묻지 않고 요구사항으로 두어야 한다(SHALL, CR-01). 그 밖의 문장은 AI 답을 따른다. 작성 규칙·설명으로 바뀌면 위험 조건 찾기와 부서 협조 요청에서 빠지기 때문이다. [제안 11-02]

#### Scenario: 협조 요청 유형 문장
- **WHEN** AI가 절의 문장을 모두 작성 규칙이라고 답하는 처리에서 "The evaluated price shall state the currency, price validity period and payment milestones for the complete scope of supply."를 처리하면
- **THEN** 그 문장은 AI에 묻지 않고 요구사항으로 남으며 주 유형은 비용 영향이다

#### Scenario: 유형 낱말이 없는 문장
- **WHEN** 같은 처리에서 위험 표현도 협조 요청 유형 낱말도 없는 "The Evaluation Committee shall score compliant proposals using the weight model below."를 처리하면
- **THEN** AI 답대로 작성 규칙이다
