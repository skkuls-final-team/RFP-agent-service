import { useState } from 'react'
import { api, type RunDocument, type RunSummary } from '../../api'
import { judgedBundles } from '../../components/documents'
import { dday, dueText, num, reviewTitle, submitBy } from '../../components/format'
import { STAGE_NAMES, STAGE_TONES } from '../../components/labels'
import { useLoad } from '../../components/useLoad'
import { href } from '../../shell/router'
import { useSession } from '../../shell/useSession'
import { Button } from '../../ui'
import type { HeadCounts } from './headCounts'
import type { DetailTab } from './tabs'

// SCR-08 검토 상세 머리글 (목업 v4.96 Detail): 제목 줄, 정보 3묶음(검토·사업·판정 진행), 아래 행동 줄 (update-detail-header).
// 요약 상자(add-screen-summary)와 개정 표시(add-revision-notice)는 그 change에서 더한다.

/** 내보내기 ▾ (목업 .exw): 일탈 목록·질의서 Word는 판정 탭 위 단추를 옮긴 것, TBE·데이터시트는 화면 이동 */
function ExportMenu({ run, onWord }: { run: RunSummary; onWord: (kind: 'DEVIATION' | 'QUERY', n: number) => void }) {
  const [open, setOpen] = useState(false)
  const outputs = useLoad(() => (open ? api.outputs(run.run_id) : Promise.resolve(null)), [run.run_id, open])
  // Word 파일에 들어갈 줄 수 (목록에서 뺀 줄은 들어가지 않는다). 0이면 내려받기를 막는다
  const listed = (kind: string) => outputs.data?.filter((i) => i.list_kind === kind && i.status !== 'REMOVED').length ?? 0
  const word = (kind: 'DEVIATION' | 'QUERY', label: string, none: string) => (
    <button type="button" role="menuitem" disabled={!outputs.data || !listed(kind)} title={outputs.data && !listed(kind) ? none : undefined}
      onClick={() => { setOpen(false); onWord(kind, listed(kind)) }}>{label}</button>
  )
  return (
    <div className="exw">
      <button type="button" className="bo" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        내보내기<span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>expand_more</span></button>
      {open && (
        <div className="mm" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
          {word('DEVIATION', '일탈 목록 초안 (Word)', '일탈 목록에 들어갈 항목이 없습니다')}
          {word('QUERY', '질의서 초안 (Word)', '질의서에 들어갈 항목이 없습니다')}
          <a role="menuitem" href={href(`/reviews/${run.run_id}/tbe`)}>TBE 준수표</a>
          <a role="menuitem" href={href(`/reviews/${run.run_id}/datasheet`)}>데이터시트 채우기</a>
        </div>
      )}
    </div>
  )
}

/** 제목 줄: "사업명 · 검토명" + 단계 배지, "기술 검토 RV-…", 오른쪽 단추 */
export function TitleRow({ run, onRefresh, onAddDoc, onAsk, asking, onEdit, onWord }: {
  run: RunSummary; onRefresh: () => void; onAddDoc: (() => void) | null; onAsk: (() => void) | null; asking: boolean
  onEdit: () => void; onWord: (kind: 'DEVIATION' | 'QUERY', n: number) => void
}) {
  const ready = run.stage !== 'PROCESSING'
  return (
    <div className="ttl">
      <div style={{ minWidth: 0 }}>
        <div className="ttl1"><h1>{reviewTitle(run)}</h1><span className={`st ${STAGE_TONES[run.stage]}`}>{STAGE_NAMES[run.stage]}</span>
          {run.revision && <span className="st c-blue" title={`문서 추가 ${run.revision.files.join(', ')}`}>개정 {run.revision.no} 반영</span>}</div>
        <div className="ttl2">기술 검토 {run.review_no}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        {ready && <Button icon="refresh" onClick={onRefresh} title="판정·건수를 다시 불러옵니다">결과 새로 고침</Button>}
        {onAddDoc && <Button icon="note_add" onClick={onAddDoc}>문서 추가</Button>}
        {ready && <ExportMenu run={run} onWord={onWord} />}
        {onAsk && <Button icon="forum" onClick={onAsk} aria-expanded={asking} title="이 검토의 요구사항·판정을 묻기 (읽기 전용)">검토 도우미</Button>}
        <Button icon="edit" onClick={onEdit}>검토 정보 수정</Button>
      </div>
    </div>
  )
}

/** 정보 3묶음 (목업 .hc > .hf): 검토, 사업, 판정 진행 */
export function InfoBox({ run, docs, approver, head, onDocs, onTab, onComply, complying }: {
  run: RunSummary; docs: RunDocument[] | null; approver: string | null; head: HeadCounts | null
  onDocs: () => void; onTab: (t: DetailTab) => void; onComply: (() => void) | null; complying: boolean
}) {
  const { user } = useSession()
  const biz = useLoad(() => (run.business_id ? api.business(run.business_id, user?.user_id ?? null) : Promise.resolve(null)),
    [run.business_id, user?.user_id])
  const due = run.due_date ? dday(run.due_date) : null
  const by = submitBy(run.due_date)
  const ready = run.stage !== 'PROCESSING'
  const bundles = docs ? judgedBundles(docs) : null
  const systems = Array.from(new Set((docs ?? []).filter((d) => d.judge_target).map((d) => d.standard_system).filter(Boolean)))
  const none = '—'
  return (
    <div className="hc">
      <section className="hf" aria-labelledby="hfR">
        <h3 id="hfR">검토</h3>
        <dl>
          <div><dt>제출 마감</dt><dd>{run.due_date && due ? <>{dueText(run.due_date)} <b className={due.cls}>{due.text}</b></> : none}</dd></div>
          <div><dt>상신 권장</dt><dd>{by ? <span className={by.late ? 'c-red' : undefined} title="제출 마감 2일 전">{by.text}</span> : none}</dd></div>
          <div><dt>문서</dt><dd>
            {docs ? <button type="button" className="lnk" onClick={onDocs} title="문서 종류·묶음 보기">문서 {run.documents}개</button> : <span>문서 {run.documents}개</span>}
            {ready && bundles && (bundles.length
              ? <> · 묶음 {bundles.join('·')}</>
              : <> · <span className="c-red" title="묶음 A·B 문서가 없어 판정하지 않았습니다">판정 문서 없음</span></>)}
            {systems.length > 0 && <> · {systems.join('·')}</>}
          </dd></div>
          <div><dt>담당 · 결재</dt><dd>{run.engineer_name ?? '담당 없음'} · {approver ?? '결재 전'}</dd></div>
        </dl>
      </section>
      <section className="hf" aria-labelledby="hfP">
        <h3 id="hfP">사업</h3>
        <dl>
          <div><dt>사업명</dt><dd>{run.business_no
            ? <a href={href(`/projects/${run.business_no}`)} title="사업 상세 보기">{run.project_name ?? run.business_no}</a>
            : run.project_name ?? none}</dd></div>
          <div><dt>고객사</dt><dd>{run.customer_name ?? none}</dd></div>
          <div><dt>국가</dt><dd>{run.country ?? none}</dd></div>
          <div><dt>고객 입찰 번호</dt><dd>{biz.data?.tender_no ?? none}</dd></div>
          <div><dt>영업</dt><dd>{biz.data?.sales_name ?? (run.business_id ? none : <span title="검토 정보 수정에서 사업을 연결하면 보입니다">{none} · 사업 연결 안 됨</span>)}</dd></div>
        </dl>
      </section>
      {ready && (
        <section className="hf hf-k" aria-labelledby="hfK">
          <h3 id="hfK">판정 진행</h3>
          <div className="hc-kv">
            <button type="button" onClick={() => onTab('judge')}>
              <span className="l">꼭 볼 것</span><b className={head?.must ? 'c-ora' : undefined}>{head?.must ?? none}<small>건</small></b>
              {head && <span className="s" title={`일탈 ${head.deviations} · 질의 ${head.queries} · 확인 필요 ${head.review}`}>일탈 {head.deviations} · 질의 {head.queries} · 확인 {head.review}</span>}
            </button>
            <button type="button" onClick={onComply ?? (() => onTab('judge'))} disabled={complying}
              title={onComply ? `확정하지 않은 준수 ${head?.counts.unconfirmed_comply ?? 0}건을 일괄 확정합니다` : undefined}>
              <span className="l">준수</span><b className="c-green">{head?.comply ?? none}<small>건</small></b>
              <span className="s">{complying ? '확정하는 중…' : onComply ? '묶어서 확정' : '판정 탭에서 보기'}</span>
            </button>
            <a href={href(`/reviews/${run.run_id}/datasheet`)}>
              <span className="l">작성할 칸</span><b className={head?.emptyCells ? 'c-blue' : undefined}>{head?.emptyCells ?? none}<small>칸</small></b>
              <span className="s">{head ? `${head.cells}칸 중 빈칸` : ''}</span>
            </a>
            <button type="button" onClick={() => onTab('bid')} title="경쟁사와 차별화할 기술 강점 (성능 여유·손실 환산)">
              <span className="l">강점 제안</span><b className={head?.strengths ? 'c-green' : undefined}>{head?.strengths ?? none}<small>건</small></b>
              <span className="s">성능 여유 · 손실 환산</span>
            </button>
            {head?.loss != null && (
              <button type="button" onClick={() => onTab('loss')}>
                <span className="l">손실 환산</span><b>{head.loss}</b><span className="s">참고값</span>
              </button>
            )}
          </div>
          {head && head.must + head.comply + head.emptyCells > 0 && (
            <div className="dpb" aria-hidden="true">
              {head.must > 0 && <i style={{ flex: `${head.must} 1 0`, background: 'var(--c-orange)' }} />}
              {head.comply > 0 && <i style={{ flex: `${head.comply} 1 0`, background: 'var(--c-green)' }} />}
              {head.emptyCells > 0 && <i style={{ flex: `${head.emptyCells} 1 0`, background: 'var(--c-blue)' }} />}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** 아래 행동 줄 (목업 .ftb): 담당자 확인 단계의 엔지니어만 확정·상신. 다른 경우는 단계 안내 한 줄 */
export function ActionBar({ run, head, approver, onSubmit, onComply, complying }: {
  run: RunSummary; head: HeadCounts | null; approver: string | null; onSubmit: () => void; onComply: (() => void) | null; complying: boolean
}) {
  const { user } = useSession()
  const engineer = user?.role === 'ENGINEER'
  if (run.stage !== 'ENGINEER_REVIEW') {
    const who = approver ? ` · 결재자 ${approver}` : ''
    // 승인된 실행은 승인 시점 판정이 제출본 v1이다 (SCR-08-8, 목업 apBtnLabel)
    const label = run.stage === 'APPROVED' ? '제출본 v1 확정' : run.stage === 'REJECTED' ? '반려됨' : null
    return (
      <div className="ftb">
        <span role="status">{STAGE_NAMES[run.stage]}{who}</span><span style={{ flex: '1 1 0' }} />
        {label && <Button kind="secondary" disabledReason="이 단계에서는 판정을 고치거나 상신할 수 없습니다">{label}</Button>}
      </div>
    )
  }
  const c = head?.counts
  return (
    <div className="ftb">
      <span>확정 안 한 판정 <b>{c ? `${num(c.unconfirmed)}건` : '—'}</b></span>
      {onComply && c && (
        <span>준수 {num(c.unconfirmed_comply)}건은 <button type="button" className="lnk" disabled={complying} onClick={onComply}>{complying ? '확정하는 중…' : '모두 확정'}</button></span>
      )}
      {head && head.emptyCells > 0 && (
        <span>비어 있는 작성 칸 <b>{num(head.emptyCells)}칸</b> <a className="lnk" href={href(`/reviews/${run.run_id}/datasheet`)}>데이터시트 채우기</a></span>
      )}
      <span style={{ flex: '1 1 0' }} />
      <Button kind="primary" onClick={onSubmit} disabledReason={engineer ? null : '기술 검토 엔지니어만 상신할 수 있습니다'}>결재 상신</Button>
    </div>
  )
}
