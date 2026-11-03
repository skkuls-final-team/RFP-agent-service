# 설계: update-type-rule-gaps

## 결정

### 1. 규칙 4줄 (`data/seed/type_rules.csv`, 우선순위는 숫자가 작을수록 먼저)
| 규칙 | 유형 | 표현 | 우선순위 |
|---|---|---|---|
| T-STD-02 | STANDARD_CERT | `(?i)\b(?:IEC|IEEE|ANSI|NEMA|UL)(?:/(?:IEC|…))*\s+standards?\b` | 65 |
| T-COST-23 | COST | `(?i)\b(unit prices?|price basis|commercial proposal|price validity)\b|(?<![가-힣])단가` | 25 |
| T-QUAL-05 | MAKER_QUAL | `(?i)\bmanufacturer(?:'s)? authori[sz]ation\b|\bproduction facility\b|\bafter-sales\b` | 20 |
| T-TECH-04 | TECH_PERF | `(?i)\b(?:gas )?leakage\b|\bpartial discharge\b|누설` | 50 |

- T-STD-02는 처음에 40(T-STD-01과 같음)으로 두니 "Rated terminal load / As per IEC standards"처럼 기술 성능 줄의 주 유형을 규격으로 바꿨다. 65(기술 성능 60보다 뒤)로 내려 다른 유형이 없는 줄만 규격이 되게 했다.
- "단가"는 처음에 그대로 두니 "차단가의 보조접점"(차단기 오타)에 걸렸다. 앞에 한글이 없을 때만으로 좁혔다("각 부품별 단가"는 걸림).

### 2. 측정 (AI 없음, 2026-11-03)
- 합성 RFP 28: K13 38/42 → 42/42. 협조 요청 견적·품질·영업 7·4·3 → 8·4·4(commercial proposal 줄이 견적, manufacturer authorization 줄이 영업).
- 문서 28개(data/private)에서 주 유형이 바뀐 줄은 모두 미분류 → 유형(다른 유형을 덮어쓴 줄 없음): 규격 54줄(실제 RFP의 "in accordance with IEC standards" 등), 기술 성능 57줄(SF6 가스 누설·누설전류 감시기 등), 비용 7줄(합성 RFP·"부품별 단가"), 제조사 자격 5줄(합성 RFP).

## 위험
- 실제 RFP의 유형별 협조 요청 수가 조금 늘 수 있다(비용 1줄). 기술 성능·규격은 엔지니어 담당이라 협조 요청을 만들지 않는다.
