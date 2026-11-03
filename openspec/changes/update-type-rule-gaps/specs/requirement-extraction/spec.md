## ADDED Requirements

### Requirement: 보강한 유형 규칙
시스템의 유형 규칙표는 번호 없는 규격 이름 표현("IEC/ANSI/UL standards", 다른 유형이 없을 때만 주 유형), 단가·가격 조건 표현("unit price", "commercial proposal", "단가"), 제조사 위임·생산 시설 표현("manufacturer authorization", "production facility"), 누설·부분 방전 표현("leakage", "partial discharge", "누설")을 각각 적용 규격·인증, 비용 영향, 제조사 자격, 기술 성능으로 붙여야 한다(SHALL, CR-01). [제안 11-03]

#### Scenario: 번호 없는 규격 이름
- **WHEN** "Applicable IEC/ANSI/UL standards, declarations, certificates, and test reports."에 유형을 붙이면
- **THEN** 주 유형은 적용 규격·인증이다

#### Scenario: 기술 성능 줄의 규격 이름
- **WHEN** "Rated terminal load / As per IEC standards"에 유형을 붙이면
- **THEN** 주 유형은 기술 성능이다

#### Scenario: 단가 조건
- **WHEN** "Commercial proposal showing unit price, quantity, delivery term, warranty, and validity period."에 유형을 붙이면
- **THEN** 주 유형은 비용 영향이고 견적 담당 협조 요청 대상이다

#### Scenario: 한국어 오타의 단가
- **WHEN** "차단가의 보조접점은 10,000회 연속 개폐 후에도 성능을 유지하여야 한다"에 유형을 붙이면
- **THEN** 단가 규칙으로 비용 영향이 되지 않는다

#### Scenario: 제조사 위임
- **WHEN** "Manufacturer authorization, production facility information, after-sales organization, and technical support plan."에 유형을 붙이면
- **THEN** 주 유형은 제조사 자격이다

#### Scenario: 가스 누설
- **WHEN** "The annual gas leakage rate of each gas compartment of the GIS shall not exceed 0.5 %."에 유형을 붙이면
- **THEN** 주 유형은 기술 성능이다
