## MODIFIED Requirements

### Requirement: 상태 점검 응답
시스템은 `/api/health`에서 API 상태, DB 연결 상태, 마지막으로 적용된 스키마 판, 언어 모델 설정 여부, AI 사용 방식(GEMINI·LOCAL·OFF), 쓰는 모델 이름, 외부 전송 여부를 돌려줘야 한다(SHALL). 키 값과 사내 모델 주소는 돌려주지 않아야 한다(MUST NOT). 실행 기록 화면은 이 값으로 지금 AI 방식과 외부 전송 여부를 한 줄로 보여야 하고(SHALL), 검토 등록 화면에는 이 줄을 보이지 않아야 한다(SHALL NOT).

#### Scenario: 정상
- **WHEN** DB가 연결되고 마이그레이션이 적용된 상태에서 상태를 조회하면
- **THEN** status는 ok, database는 ok, schema_version은 마지막 마이그레이션 파일 이름이다

#### Scenario: DB 장애
- **WHEN** DB에 연결할 수 없는 상태에서 상태를 조회하면
- **THEN** 오류 대신 status는 degraded, database는 down으로 응답한다

#### Scenario: AI 방식 표시
- **WHEN** 방식이 Gemini이고 키가 있으면 / 사내 모델이면 / AI 끄기이면
- **THEN** ai_mode는 GEMINI·LOCAL·OFF, external_send는 true·false·false이고 응답에 키·주소 글자가 없다

#### Scenario: 검토 등록에는 AI 방식 줄 없음
- **WHEN** 엔지니어가 검토 등록 3단계(담당 엔지니어 고르기)까지 가면
- **THEN** AI 방식·외부 전송 줄이 보이지 않고, 실행 기록 화면에는 그 줄이 그대로 보인다
