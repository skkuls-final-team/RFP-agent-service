# 설계: update-ai-label-keep-handoff

## 결정

### 1. 무엇을 묻지 않나
- `document._refine_with_ai`가 절마다 AI에 물을 문장을 모을 때, 위험 표현 문장(지금)과 함께 **협조 요청 유형 규칙에 걸리는 문장**을 뺀다. 빠진 문장은 처음 추출 그대로 요구사항이고, 유형은 규칙표가 붙인다(비용 영향 → 견적 담당 등).
- 협조 요청 유형 = `requirement_type.default_role`이 견적(COST)·품질(QUALITY)·영업(SALES)인 유형: `COST`·`TEST`·`MAKER_QUAL`(0002 기준표). 코드 상수 `HANDOFF_TYPES`로 두고 그 유형의 규칙(`dicts.type_rules`)만 쓴다. 기준표가 바뀌면 상수도 함께 바꾼다(시험이 기준표와 같은지 본다).
- 처리 뒤 점검의 "떨어진 절만 다시 묻기"(update-partial-reprocess)도 같은 함수를 쓰므로 같은 보호를 받는다.

### 2. 버린 대안
- AI 답 뒤에 되돌리기: 묻고 버리는 셈이라 호출만 늘고, 위험 표현 문장 처리와 모양이 달라진다.
- 입찰자 의무 표현(bidder shall/must) 지키기: proposal "하지 않음" 참고. 입찰 서식 처리기와 부딪치고, 측정에서 옮겨진 줄 대부분은 응답 작성 방법이었다.
- 프롬프트에 "비용·시험 문장은 요구사항" 지시 더하기: AI가 따르는지 코드가 보장하지 못한다(CR-01).

### 3. 영향
- AI를 끈 분석은 그대로(묻지 않으니 차이 없음).
- AI 질문 수가 그만큼 준다. 처리 판은 코드 판(문서 모듈 해시)이 바뀌어 저절로 새로 분석된다.
- 기존 시험 중 "AI가 모든 문장을 작성 규칙이라고 답하는" 대역으로 절을 통째로 떨어뜨리는 시험은, 문서에 협조 요청 유형 낱말(spare parts, type test 등)이 있으면 그 줄이 남는다. 그런 시험은 대역이 떨어뜨릴 문장을 유형 낱말 없는 문장으로 바꾼다(시험이 보려는 것은 점검·다시 묻기).

### 4. 시험
- `tests/test_ai_label_keep.py`: 모든 문장을 작성 규칙이라고 답하는 대역으로 처리하면 "The evaluated price shall state …"(비용 영향)·"Type Test reports …"(시험)·"ISO 9001 …"(제조사 자격)은 요구사항이고 AI 질문에 없으며 유형이 그대로, 유형 낱말 없는 "The Evaluation Committee shall score …"는 작성 규칙.
- 상수와 기준표가 같은지: DB `requirement_type`에서 담당이 ENGINEER가 아닌 유형 = `HANDOFF_TYPES`.
- 측정: AI 켬 다시 재기는 비용이 들어 하지 않는다(가짜 AI 시험으로 확인).
