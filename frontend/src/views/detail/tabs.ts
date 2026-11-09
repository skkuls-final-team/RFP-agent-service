// SCR-08 검토 상세 탭 이름 (목업 v4.96 .pgtabs2, update-detail-header)

/** 탭 줄에 늘 보이는 탭 */
export const MAIN_TABS = [['judge', '판정'], ['bid', '강점 제안'], ['risk', '위험 조건'], ['read', '문서 읽기 점검'], ['comm', '상업 조건'], ['log', '이력']] as const
/** "더 보기" 안의 탭 */
export const MORE_TABS = [['cmp', '지난 RFP 비교'], ['subm', '제출본']] as const
/** 'loss'는 예전 손실 환산 탭 주소. 지금은 강점 제안 탭 안의 한 칸이라 'bid'와 같은 화면을 연다 */
export type DetailTab = (typeof MAIN_TABS)[number][0] | (typeof MORE_TABS)[number][0] | 'loss'

