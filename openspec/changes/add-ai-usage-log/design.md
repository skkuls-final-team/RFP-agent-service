# 설계: add-ai-usage-log

## 결정

### 1. 어디서 세나
- 분석 밖 요청은 요청마다 새 AI 객체를 만든다(`make_context(conn).llm`, `make_llm`). 그 객체의 `Usage`가 그 요청의 사용량이다.
- `pipeline/ai_usage.py`의 `tracked(conn, feature, run_id, llm)` 문맥: 요청 처리 뒤(오류여도) 사용량 차이가 호출 1회 이상이면 `ai_usage`에 한 줄 넣고 커밋한다. 처리 중 오류로 트랜잭션이 깨졌으면 되돌린 뒤 넣는다(이미 부른 호출은 비용이 나갔으므로 남긴다).
- 기능 코드(코드 표): `ASSISTANT` 검토 도우미, `HANDOFF_ASK` 협조 요청 확인할 점, `PRODUCT_SWITCH` 비교 제품 바꾸기, `LOSS_EDIT` 손실값 고치기, `REVIEW_ACTION` 판정·위험 조건 확정·수정, `BULK_CONFIRM` 한꺼번에 확정.
- 분석 실행(검토 등록·다시 시도·문서 추가·단계부터 다시)은 지금처럼 `review_run`에 쌓인다(중복으로 남기지 않음).

### 2. 표 (0038)
- `ai_usage(usage_id, used_at, feature, run_id NULL, model, calls, retries, input_tokens, output_tokens, thinking_tokens)`. feature는 CHECK로 위 6개.

### 3. 응답 `GET /api/ai-usage?days=30`
- 날짜(DB 날짜)·기능별 묶음 줄: 호출 수, 재시도, 토큰 3종, 추정 비용(원, `run_log.estimated_cost_krw`, 팀 가정 단가, 모르는 모델이면 null).
- 분석 실행은 `review_run.started_at` 날짜·기능 `ANALYSIS`로 같은 모양으로 합친다(AI를 부른 실행만).
- 합계 줄: 호출 수·추정 비용 합.

## 대안
- AI 객체가 호출마다 DB에 직접 쓰기: AI 모듈이 DB를 알게 되고(llm은 호출만, AGENTS 6장) 분석 실행과 두 번 센다.
- 서버 로그만 보기: 토큰을 모른다.

## 시험
- 가짜 AI(토큰 100·10·5)로 검토 도우미 질문 → `ai_usage` 한 줄(ASSISTANT, 검토 번호, 호출 수), AI 끔이면 줄 없음.
- 협조 요청 보내기 → HANDOFF_ASK 한 줄.
- 응답: 기능별 합과 분석 실행 줄, 추정 비용.
