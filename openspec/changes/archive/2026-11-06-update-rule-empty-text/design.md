# Design

## 결정

- **빈 안내 줄만 격자를 끈다.** `rkp-r`에 `rkp-e`를 더해 `display:block`(`views/rules.css`). 목업 CSS(`mockup/Rules.css`)의 `rkp-r` 격자는 후보 줄이 쓰므로 그대로 둔다.

## 대안

- 안내 span에 `grid-column: 1 / -1`: 같은 효과지만 빈 줄이 격자 간격·정렬을 따라가 버림.
