# 설계: add-demo-setup

## 결정
- `db/cli.py`에 `demo-setup`. 순서: (선택) DB 만들기 → 검토 수 확인(0이 아니면 거절, 종료 코드 1) → 파일 확인 → `migrate` → `seed_rules` → `seed_products`(실제 제품표) → `load_req_key`/`load_key`(`data/seed/answer_keys/synthetic_rfp28_*.csv`, 이름 "합성 RFP 28 요구사항"·"합성 RFP 28 유형") → `demo_businesses([["시연 사업", 파일]], "Demo Grid Co.", 14)`.
- 검토 수 확인은 마이그레이션 전에 한다. 아직 표가 없는 빈 DB(새로 만든 DB)는 0건으로 본다.
- `--create`: `DATABASE_URL`의 DB 이름으로 같은 서버의 `postgres` DB에 붙어 `CREATE DATABASE`(있으면 건너뜀). 이름은 영문·숫자·밑줄만 받는다.
- `--file`: 기본은 `data/private/rfp_docx/RFP_Product_Master_Evaluative_EN_With_Product_Switch.docx`. 시험은 합성 픽스처를 준다.
- AI 방식은 `ai_mode(settings)`로 알린다("AI 끔 — 규칙만" 등). 시연 기본은 끔(.env `RFP_AI_MODE=off`).

## 대안
- 기존 DB를 비우는 `--reset`: 지우는 일이라 실수 위험이 크다. 새 DB를 쓰게 한다.
- 셸 스크립트: 윈도우 팀원이 쓰기 어렵고 시험하기 어렵다.

## 쓰는 법 (README·setup-guide에 적음)
```
cd backend
DATABASE_URL=postgresql://rfp:rfp@localhost:5433/rfp_demo uv run rfp-db demo-setup --create
DATABASE_URL=postgresql://rfp:rfp@localhost:5433/rfp_demo uv run uvicorn rfp_agent.api.main:app --port 8000
```

## 시험
- 빈 DB(시험 DB, 검토 0)에 픽스처 파일로 `demo-setup` → 정답지 2개, 사업 "시연 사업", 검토 1건 담당자 확인.
- 검토가 있으면 거절하고 정답지·사업이 늘지 않음.
- 파일이 없으면 시작 전에 멈춤.
