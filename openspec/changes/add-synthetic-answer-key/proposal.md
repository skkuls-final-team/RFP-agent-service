# 시연용 합성 RFP 정답지

## 왜

- 팀은 시연·평가를 합성 RFP(파일 23~28)로 한다(2026-11-02). 그런데 정답지·채점 화면(K1~K13)에 쓸 정답지는 실제 RFP 공급사 답안(코드 자동, DB에만)과 합성 154 kV GIS 문서뿐이다. 시연 데이터로는 추출·값·위험 조건·유형 정확도를 잴 수 없다.
- 합성 RFP는 팀이 만든 문서라 고객 원문이 아니어서 정답지를 저장소에 둘 수 있다.

## 무엇

- **파일 28 요구사항 정답지** `data/seed/answer_keys/synthetic_rfp28_req.csv`(69줄): 요구사항 65줄(1·2·4·6·8·9장 의무 문장, 4장 응답 요구 표 10줄, 데이터시트 표 29줄은 값·단위), 위험 조건 4줄(포괄 조항 2·범위 모호 1·값 불일치 1). 대상 문서 `RFP_Product_Master_Evaluative_EN_With_Product_Switch`.
- **파일 28 유형 정답지** `data/seed/answer_keys/synthetic_rfp28_type.csv`(65줄): 같은 요구사항 줄의 정답 유형, 애매한 줄 표시.
- 둘 다 Claude 초안(사람 확인 전). 생성기가 일부러 쓴 줄을 문서를 읽고 골랐고, 시스템 코드 결과로 만들지 않았다.
- AI 없이 처리한 파일 28의 기준 점수를 기록한다(개선 전후 비교의 "전").

## 하지 않음

- 채점 규칙·화면 바꾸기. 정답지 데이터와 시험만 더한다.
- 파일 23~27 정답지(파일 28이 27까지 모두 품는다).
- 판정 정답지(K5·K6는 사람 확정으로 잰다, 그대로).

관련: 기획서 2-2 K지표, 명세 evaluation, reference-data "시연용 합성 RFP", 이전 change add-requirement-answer-key·update-synthetic-product-switch.
