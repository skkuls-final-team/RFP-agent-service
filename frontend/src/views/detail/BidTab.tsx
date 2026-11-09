import { useState, type ReactNode } from 'react'
import { api, type Judgment, type Proposal, type RunSummary } from '../../api'
import { itemName, locShort } from '../../components/judgment'
import { POINT_KIND_NAMES, STATUS_NAMES } from '../../components/labels'
import { useLoad } from '../../components/useLoad'
import { useSession } from '../../shell/useSession'

// SCR-08-5 강점 제안 탭 (예전 이름: 입찰 영향) (목업 v4.57 Detail #bid). docs/screens/SCR-08-5-입찰영향.md
// 강점 제안(제안 포인트, FR-14·15)을 맨 위에, 손실 환산(children)을 그 아래, 보완이 필요한 점은 일탈 후보·질의 후보 판정을 접어서 맨 아래에 둔다. 채택한 포인트만 영업·견적에 전달된다(AR-08).

const TONES: Record<string, string> = { CANDIDATE: 'st c-grey', ADOPTED: 'st c-green', EDITED: 'st c-green', DISCARDED: 'st c-grey' }
// 불리한 점의 대응 문장 (목업 cons)
// 채택한 포인트를 받는 담당 (백엔드 assignments.POINT_ROLES와 같은 표, FR-11)
const POINT_TO: Record<string, string> = { LOSS: '영업·견적 담당', MARGIN: '영업 담당', FIELD: '영업 담당' }
/** 채택·버림을 누른 뒤 그 포인트에 남기는 알림 (update-proposal-actions) */
type Acted = { action: 'ADOPT' | 'DISCARD'; reason?: string }

const CONS: Record<string, [string, string]> = {
  DEVIATION_CANDIDATE: [' 미달', '일탈 목록에 올리고 대체 정격의 운전 조건을 설명'],
  QUERY_CANDIDATE: [' 값 불명확', '서면 질의로 적용 값을 확인한 뒤 판정'],
}

export function BidTab({ run, tick, onChanged, onGoJudge, children }: {
  run: RunSummary; tick: number; onChanged: () => void; onGoJudge: () => void; children?: ReactNode
}) {
  const { user } = useSession()
  const id = run.run_id
  const points = useLoad(() => api.proposals(id), [id, tick])
  const cons = useLoad(() => Promise.all(['DEVIATION_CANDIDATE', 'QUERY_CANDIDATE'].map((result) =>
    api.judgmentPage(id, { result, limit: 100 }).then((p) => p.items))).then((r) => r.flat()), [id, tick])
  const docs = useLoad(() => api.documents(id), [id])
  const canEdit = run.stage === 'ENGINEER_REVIEW' && user?.role === 'ENGINEER'
  const lock = run.stage !== 'ENGINEER_REVIEW' ? '담당자 확인 단계에서만 고칠 수 있습니다' : !canEdit ? '엔지니어만 고칠 수 있습니다' : undefined
  const tip = '설명 문장은 AI가 작성합니다. 채택한 항목만 영업과 견적 담당에 협조 요청으로 보냅니다.'
  const [acted, setActed] = useState<Record<number, Acted>>({})

  const consN = cons.data?.length ?? 0
  return (
    <>
    <section className="sec" id="bid">
      <div className="sech"><h2>강점 제안<span className="hint" tabIndex={0} role="img" aria-label={tip} title={tip}><span className="ms" aria-hidden="true">info</span></span>
        <span className="note">RFP 요구값보다 우리 제품이 앞서는 지점을 원문 근거와 함께 보여 줍니다</span></h2></div>
      {points.error && <p role="alert">{points.error}</p>}
      {points.data?.length === 0 && <p style={{ color: 'var(--c-muted)', margin: '10px 0' }}>내세울 강점 후보가 없습니다.</p>}
      {points.data?.map((p) => <Point key={p.point_id} runId={id} p={p} canEdit={canEdit} lock={lock} acted={acted[p.point_id]}
        onDone={(a) => { setActed((m) => ({ ...m, [p.point_id]: a })); onChanged() }}
        where={locShort(p, docs.data ?? [])} />)}
    </section>
    {children}
    <section className="sec" id="bid-cons">
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--c-red)' }}>
          보완이 필요한 점 (일탈·질의 {consN}건)</summary>
        {cons.error && <p role="alert">{cons.error}</p>}
        {cons.data?.map((j: Judgment) => (
          <div key={j.judgment_id} className="li">
            <span className="ms c-red" aria-hidden="true">trending_down</span>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <b style={{ fontWeight: 600 }}>{itemName(j)}{CONS[j.result][0]}</b>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-3)', marginTop: 2 }}>대응: {CONS[j.result][1]}</div>
              <div className="en">{locShort(j, docs.data ?? [])}</div>
            </div>
          </div>
        ))}
        {consN === 0 && !cons.error && <p style={{ color: 'var(--c-muted)', margin: '10px 0' }}>보완이 필요한 점이 없습니다.</p>}
        <button type="button" className="lnk" onClick={onGoJudge}>자세히는 판정 탭에서 보기 →</button>
      </details>
    </section>
    </>
  )
}

function Point({ runId, p, where, canEdit, lock, acted, onDone }: {
  runId: number; p: Proposal; where: string; canEdit: boolean; lock?: string; acted?: Acted; onDone: (a: Acted) => void
}) {
  const { user } = useSession()
  const [dropping, setDropping] = useState(false)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = (action: 'ADOPT' | 'DISCARD') => {
    setBusy(true)
    setError(null)
    api.act(runId, { target: 'proposal_point', target_id: p.point_id, action, reason: action === 'DISCARD' ? why.trim() : undefined, actor_id: user!.user_id })
      .then(() => { onDone({ action, reason: action === 'DISCARD' ? why.trim() : undefined }); setDropping(false); setWhy('') })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }
  const adopted = p.status === 'ADOPTED' || p.status === 'EDITED'
  const rowCls = adopted ? 'li pt-adopted' : p.status === 'DISCARDED' ? 'li pt-dropped' : 'li'
  return (
    <div className={rowCls}>
      <span className="ms c-green" aria-hidden="true">trending_up</span>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <b style={{ fontWeight: 600 }}>{p.basis}</b><span className={TONES[p.status] ?? 'st c-grey'}>{STATUS_NAMES[p.status] ?? p.status}</span>
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-3)', marginTop: 2 }}>{p.text_draft}</div>
        <div className="en">
          {POINT_KIND_NAMES[p.point_kind] ?? p.point_kind} · {where}
          {p.is_assumed && <span className="st c-ora" style={{ marginLeft: 6 }}>팀 가정</span>}
          {p.number_check === 'MISMATCH' && <span className="st c-red" style={{ marginLeft: 6 }}>숫자 불일치: {p.number_detail}</span>}
        </div>
        {dropping
          ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              <input className="fi" aria-label="제외 사유" placeholder="제외 사유" value={why} autoFocus onChange={(e) => setWhy(e.target.value)} style={{ flex: 1, height: 32 }} />
              <button type="button" className="bp" disabled={busy || !why.trim()} onClick={() => act('DISCARD')}>제외하기</button>
              <button type="button" className="bo" onClick={() => { setDropping(false); setWhy('') }}>취소</button>
            </div>
          : <div className="pt-acts" title={lock}>
              <button type="button" className="bp" disabled={!canEdit || busy || adopted} onClick={() => act('ADOPT')}>
                <span className="ms" aria-hidden="true">check</span>{adopted ? '채택함' : '채택'}</button>
              <button type="button" className="bo" disabled={!canEdit || busy || p.status === 'DISCARDED'} onClick={() => setDropping(true)}>
                <span className="ms" aria-hidden="true">close</span>제외</button>
            </div>}
        {acted && <p className={`pt-note ${acted.action === 'ADOPT' ? 'ok' : ''}`} role="status">
          <span className="ms" aria-hidden="true">{acted.action === 'ADOPT' ? 'check_circle' : 'do_not_disturb_on'}</span>
          {acted.action === 'ADOPT'
            ? `채택했습니다. ${POINT_TO[p.point_kind] ?? '영업 담당'}에게 협조 요청으로 전달합니다.`
            : `제외했습니다. 사유: ${acted.reason}`}</p>}
        {error && <p className="aphint" role="alert">{error}</p>}
      </div>
    </div>
  )
}
