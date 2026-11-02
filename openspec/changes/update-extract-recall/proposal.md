# 의무 표현이 없는 요구 줄 뽑기 (요구사항 재현율)

## 왜

- 합성 RFP 28 정답지로 재니(add-synthetic-answer-key, AI 없음) K1 47/65(72.3 %), K10 3/4였다. 놓친 18줄은 모두 1차 후보 표현("shall / must / required …")이 없는 줄이었다.
  - 4장 응답 요구 표 T1~T10(10줄): 상태 칸이 "Mandatory"인데 문장 표현이 없다. 오히려 머리 줄("… | Required Bidder Response | …")이 "Required" 낱말로 잘못 뽑혔다(K2 오답).
  - 2장 필수 제출물 글머리(7줄): "Mandatory Proposal Submission" 절의 목록 줄.
  - "No deviations from the technical requirements will be accepted after contract award."(1줄): 위험 표현(no deviations)이 있는데 의무 표현이 없어 요구사항이 아니었고, 그래서 포괄 조항도 놓쳤다(K10).

## 무엇 (코드 규칙, AI 없음)

1. **상태 칸이 있는 요구 표**: 데이터시트가 아닌 표에서 한 칸이 상태 값("Mandatory", "Required", "필수" 등)으로 2줄 이상 반복되면, 그 값이 있는 줄만 요구사항 후보로 뽑고 머리 줄은 뺀다.
2. **제출물 목록 절**: 절 제목이 필수 제출물·제출 서류를 뜻하면("Mandatory … Submission", "Documents to be submitted", "제출 서류·자료") 그 절의 짧은 목록 줄(15~200자, 3낱말 이상, 문서에 한 번만 나오는 줄)을 의무 표현이 없어도 후보로 뽑는다.
3. **위험 표현 문장**: 위험 표현 사전에 걸리는 문장은 의무 표현이 없어도 후보로 뽑는다(위험 조건 찾기의 재료, FR-06).

## 하지 않음

- 평가위원회 채점 방법·부록 안내 같은 잘못 뽑힌 문장(K2 오답 2줄) 거르기 — 입찰자 의무가 아닌 "shall" 문장 구분은 AI 문장 구분 몫이다.
- 유형 규칙표 바꾸기. 새로 뽑힌 줄 중 유형 규칙에 안 걸리는 줄은 AI 없이 미분류다.

관련: FR-03·FR-06, 명세 requirement-extraction "요구사항 추출", evaluation K1·K2·K10.
