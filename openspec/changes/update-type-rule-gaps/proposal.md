# 유형 규칙 빈틈 채우기

## 왜

- 의무 표현이 없는 요구 줄 뽑기(update-extract-recall) 뒤 합성 RFP 28을 AI 없이 채점하면 K13이 38/42다. 새로 찾은 4줄이 유형 규칙에 걸리지 않아 미분류였다.
  - "Applicable IEC/ANSI/UL standards, declarations, certificates, and test reports." — 규격 규칙(T-STD-01)은 "IEC 62271"처럼 번호까지 있어야 걸린다.
  - "Commercial proposal showing unit price, quantity, delivery term, warranty, and validity period." — 단가 규칙이 없다.
  - "Manufacturer authorization, production facility information, after-sales organization …" — 제조사 자격 규칙은 "authorization letter"만 있다.
  - "The annual gas leakage rate of each gas compartment of the GIS shall not exceed 0.5 %." — 누설 규칙이 없다.
- 비용·자격 줄이 미분류면 견적·영업 협조 요청이 생기지 않는다(FR-11).

## 무엇

유형 규칙표(`data/seed/type_rules.csv`)에 4줄을 더한다(코드 규칙, AI 없음).
- T-STD-02 적용 규격·인증: 번호 없는 "IEC/ANSI/UL … standards". 기술 성능보다 낮은 우선순위(다른 유형이 없을 때만 주 유형).
- T-COST-23 비용 영향: unit price(s)·price basis·commercial proposal·price validity, "단가"(앞에 다른 한글이 없을 때, "차단가" 같은 오타 제외).
- T-QUAL-05 제조사 자격: manufacturer('s) authorization·production facility·after-sales.
- T-TECH-04 기술 성능: (gas) leakage·partial discharge·누설.

## 하지 않음

- 기존 규칙 바꾸기, 우선순위 바꾸기.
- 판정·위험 조건 바꾸기.

관련: FR-04·FR-11, 명세 requirement-extraction "유형 표시", evaluation "시연용 합성 RFP 정답지".
