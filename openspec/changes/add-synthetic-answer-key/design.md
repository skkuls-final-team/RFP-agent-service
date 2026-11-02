# 설계: add-synthetic-answer-key

## 결정

### 1. 정답을 어떻게 골랐나
- 채점 대상과 정답이 같은 코드에서 나오지 않게, 시스템 추출 결과가 아니라 docx를 직접 읽고 생성기(`generate_evaluative_rfp.py` → `…_collaboration` → `generate_risk_rfp.py` → `generate_switch_rfp.py`)가 일부러 쓴 줄을 사람 눈으로 골랐다(Claude 초안).
- 요구사항(65): 입찰자 의무가 있는 문장과 표 줄.
  - 1장 2문장(입찰자 의무, 가정값을 제조사 자료로 바꿀 의무), 2장 필수 제출물 8줄, 4장 머리 문장, 4장 응답 요구 표 T1~T10(가장 긴 칸 "Required Bidder Response"), 6장 가정값 확인 의무, 8장 9문장, 9장 5문장.
  - 데이터시트 표 29줄(4.2 TS-170-GIS 11, 4.3 TS-24-CB 7, 부록 B 11)은 값·단위를 함께 적는다(K3). 원문은 칸을 " / "로 이은 표 줄("1 / Rated voltage / kV / ≥170 kV"). 표마다 같은 항목 이름(Rated voltage)이 있어 항목 이름만 쓰면 다른 표의 값과 맞아 버리므로 줄 전체를 쓴다.
- 요구사항이 아님(뺌): 1·9장 머리말 같은 설명, 5장 평가위원회 채점 방법, 5장 점수 표, 7장 입찰자 신고 서식 칸, 부록 A 제품 목록, 부록 B 안내 문장(평가자에게 하는 말).
- 위험 조건(4): 9.1 "deemed"·"No deviations"(포괄 조항), 9.2 "including but not limited to"(범위 모호), 9.3 가스 누설률 0.5 %(부록 B 0.4 %와 값 불일치). 9.2 "at no extra cost"는 생성기 의도가 비용 전가인데 정답 종류(BLANKET·OPEN_SCOPE·VALUE_MISMATCH)에 없어 넣지 않았다.
- 유형(65): 8장은 생성기 의도대로 견적·품질·영업(COST·TEST·MAKER_QUAL), 데이터시트 줄은 TECH_PERF, 9장 위험 조항은 RISK, 가스 누설률 문장은 TECH_PERF. 둘 이상으로 볼 수 있는 줄(가정값 의무, 유지·수명, 공급·물류, 입회 시험, 비용 전가 등 10줄)은 애매함 Y.
- 문서의 둥근 작은따옴표(’)는 시스템이 곧은 따옴표로 읽어 같은 글자로 맞춘다.

### 2. 넣는 법
- 기존 CLI: `rfp-db load-answer-key data/seed/answer_keys/synthetic_rfp28_req.csv --name "합성 RFP 28 요구사항" --kind REQ --doc RFP_Product_Master_Evaluative_EN_With_Product_Switch`, `rfp-db load-answer-key data/seed/answer_keys/synthetic_rfp28_type.csv --name "합성 RFP 28 유형"`. `--human` 없이(Claude 초안).

### 3. 기준 점수 (AI 없음, 실제 제품표, 2026-11-02)
| 지표 | 값 | 놓친 것 |
|---|---|---|
| K1 | 47/65 (72.3 %) | 2장 필수 제출물 글머리 7줄, 4장 응답 요구 표 10줄, "No deviations …" |
| K2 | 47/50 (94.0 %) | 응답 요구 표 머리 줄, 평가위원회 문장, 부록 B 안내 |
| K3 | 30/30 (100 %) | |
| K10 | 3/4 (75 %) | "No deviations …"가 요구사항이 아니라 포괄 조항 후보가 없음 |
| K13 | 36/37 (97.3 %) | 맞은 37줄 중 1줄, 못 찾은 줄 18 |
- 개선할 곳이 숫자로 드러난다(다음 change 후보: shall 없는 필수 제출물 글머리, 응답 요구 표 줄).

### 4. 시험
- `tests/test_synthetic_rfps.py` "합성 RFP 정답지 채점": 두 정답지를 넣고(69·65줄, 빠진 줄 없음, Claude 초안) 파일 28을 AI 없이 처리한 검토를 채점하면 위 기준 점수(분자·분모)가 나온다. 원문(data/private)이 있을 때만 돈다.
- 정답지 CSV 모양만 보는 시험(원문 없이도 돎): 두 파일이 들어가고 줄 수·종류 수가 맞다.

## 위험
- 기준 점수를 시험에 고정하므로 추출 규칙을 고치면 시험 숫자를 함께 바꿔야 한다. 그것이 개선 전후 기록이다(채점 기록 메모에도 남긴다).
