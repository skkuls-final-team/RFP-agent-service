// 화면 상태 3종 (_공통규칙.md 1장): 로딩 중 · 데이터 없음 · 오류. 권한 없음은 Button의 disabledReason.
export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return <div className="uiload" role="status" aria-label={label}><i /><i /><i /></div>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="uiempty">{children}</p>
}

/** 오류 문장(API detail 그대로) + 다시 불러오기 */
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="uierr" role="alert">
      <span className="ms" aria-hidden="true">error</span><span>{error}</span>
      {onRetry && <button type="button" className="bo" onClick={onRetry}>다시 불러오기</button>}
    </div>
  )
}

/** 진행 중 표시 (update-send-progress). 단추 글자 앞에 붙인다. 화면 읽기 도구에는 단추의 aria-busy로 알린다 */
export function Spinner() {
  return <span className="uispin" aria-hidden="true" data-testid="spinner" />
}
