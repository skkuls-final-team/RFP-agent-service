import { TypeFix } from '../components/TypeFix'
import { useEffect, useState } from 'react'
import { api, type Assignment, type User } from '../api'
import { Pager } from '../components/Pager'
import { saveFile } from '../components/download'
import { Button, Spinner, useToast } from '../ui'
import { stamp } from '../components/format'
import { locShort } from '../components/judgment'
import { POINT_KIND_NAMES } from '../components/labels'
import { useLoad } from '../components/useLoad'
import { href } from '../shell/router'
import { usePageCss } from '../shell/pageCss'
import { useSession } from '../shell/useSession'
import { ExampleBand } from './detail/ExampleTab'
import './detail.css'

// SCR-13 협조 요청 현황 (목업 v4.96 Todo). docs/screens/SCR-13-협조요청.md
// 요청 항목은 FR-11이 유형별로 보낸 할 일이다. 메일은 시스템이 부서 주소로 보내고(판정 확정 때, 또는 엔지니어의 [보내기]),
// 회신이 오면 엔지니어가 "회신 받음"을 표시한다(update-role-handoff-mail). 회신 대기 요청은 엔지니어가 [재요청]으로 다시 보낸다.
// 세 부서 요청을 한 번에 받아 화면에서 거른다: 검색 영역·요약 줄·담당별/RFP별, 내보내기는 거른 요청 전부 (update-todo-search).
// 요청하기는 예시 창이다 (SCR-13_공유.md).

const DEPTS = [['COST', '견적 담당'], ['QUALITY', '품질 담당'], ['SALES', '영업 담당'], ['NONE', '미분류']] as const
type Dept = typeof DEPTS[number][0]
type St = 'unsent' | 'wait' | 'late' | 'done'
const ST: Record<St, [string, string]> = {
  unsent: ['미발송', 'c-grey'], wait: ['회신 대기', 'c-blue'], late: ['24시간 넘게 회신 없음', 'c-ora'], done: ['회신 완료', 'c-green'],
}
const DAY = 86_400_000

/** 할 일 상태 → 화면 상태. 안 보냄(TODO) → 메일 보냄(DOING, 24시간 넘으면 회신 없음) → 회신 받음(DONE) */
function stOf(a: Assignment, now: number): St {
  if (a.status === 'DONE') return 'done'
  if (a.status === 'TODO') return 'unsent'
  return a.mail_sent_at && now - new Date(a.mail_sent_at).getTime() > DAY ? 'late' : 'wait'
}

function md(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 회신 기한: 메일 보낸 날 + 3일 (목업 규칙). 안 보냈으면 없음 */
const dueOf = (a: Assignment) => (a.mail_sent_at ? new Date(new Date(a.mail_sent_at).getTime() + 3 * DAY) : null)

function title(a: Assignment): string {
  const t = a.text.replace(/\s+/g, ' ').trim()
  return t.length > 80 ? `${t.slice(0, 80)}…` : t
}

function desc(a: Assignment): string {
  if (a.point_kind) return `${POINT_KIND_NAMES[a.point_kind] ?? a.point_kind} 제안 포인트 · 채택한 문장`
  if (a.repeat_count > 1) return `같은 조건 ${a.repeat_count}곳을 한 건으로 묶음`
  return a.type_name ?? ''
}

/** 원문 위치: 파일 번호 대신 파일 이름 */
const where = (a: Assignment) => (a.file_name ? locShort(a).replace(/^파일 \d+/, a.file_name) : locShort(a))

const tag = (a: Assignment) => (a.point_kind ? '제안 포인트' : a.repeat_count > 1 ? a.type_name : null)

/** 받는 주소: 보낸 주소, 아직 안 보냈으면 지금 설정된 부서 주소 */
const address = (a: Assignment) => a.mail_to ?? a.dept_address

/** 발송 실패·주소 없음 꼬리표 */
const failTag = (a: Assignment) => (a.status === 'TODO' && a.mail_error ? a.mail_error === '주소 없음' ? '주소 없음' : '발송 실패' : null)

function defaultDept(user: User | null): Dept {
  return user && (user.role === 'COST' || user.role === 'QUALITY' || user.role === 'SALES') ? user.role : 'COST'
}

/** 검색 영역 조건. 회신: wait 회신 대기(기한 안), over 회신 기한 지남, done 회신 받음 */
type Filter = { pj: string; rv: string; rp: '' | 'wait' | 'over' | 'done'; by: string; q: string }
const NO_FILTER: Filter = { pj: '', rv: '', rp: '', by: '', q: '' }
const RP_LABEL = { wait: '회신 대기', over: '회신 기한 지남', done: '회신 완료' } as const
const SIZES = [5, 10, 20]

/** 회신 상태 (안 보냄은 없음) */
function rpOf(a: Assignment, now: number): Filter['rp'] {
  if (a.status === 'DONE') return 'done'
  if (a.status !== 'DOING') return ''
  const due = dueOf(a)
  return due && due.getTime() < now ? 'over' : 'wait'
}

function hm(d: Date): string {
  return `${md(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 상태 칸 아래 회신 줄: 회신 시각 또는 회신 기한(지나면 빨강) */
function replyLine(a: Assignment, now: number): [string, string] | null {
  const rp = rpOf(a, now)
  const due = dueOf(a)
  if (rp === 'done') return ['rpl ok', a.replied_at ? `회신 ${hm(new Date(a.replied_at))}` : '회신 완료']
  if (rp === 'over' && due) return ['rpl od', `회신 기한 ${md(due)} 지남`]
  if (rp === 'wait' && due) return ['rpl wt', `회신 기한 ${md(due)}`]
  return null
}

const projectOf = (a: Assignment) => a.project_name || '사업 없음'
const reviewLabel = (a: Assignment) => `${a.review_no}${a.review_name ? ` ${a.review_name}` : ''}`

function hay(a: Assignment): string {
  return [a.text, desc(a), where(a), address(a), a.review_no, a.review_name, a.project_name, a.type_name]
    .filter(Boolean).join(' ').toLowerCase()
}

function passes(a: Assignment, f: Filter, now: number): boolean {
  if (f.pj && projectOf(a) !== f.pj) return false
  if (f.rv && String(a.run_id) !== f.rv) return false
  if (f.rp && rpOf(a, now) !== f.rp) return false
  if (f.by && (address(a) ?? '') !== f.by) return false
  return !f.q.trim() || hay(a).includes(f.q.trim().toLowerCase())
}

/** 제목에서 검색어 첫 자리를 표시 (목업 mark.mk) */
function Title({ a, q }: { a: Assignment; q: string }) {
  const t = title(a)
  const i = q.trim() ? t.toLowerCase().indexOf(q.trim().toLowerCase()) : -1
  if (i < 0) return <span style={{ fontWeight: 600 }}>{t}</span>
  const n = q.trim().length
  return <span style={{ fontWeight: 600 }}>{t.slice(0, i)}<mark className="mk">{t.slice(i, i + n)}</mark>{t.slice(i + n)}</span>
}

const uniq = (xs: string[]) => [...new Set(xs)].sort((x, y) => x.localeCompare(y, 'ko'))

export function Todo() {
  usePageCss('Todo')
  usePageCss('TodoV496')
  const { user, users } = useSession()
  const [chosen, setDept] = useState<Dept | null>(null)
  const dept = chosen ?? defaultDept(user)          // 고르기 전에는 담당자 자기 부서, 그 밖에는 견적 담당
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(5)
  const [rsize, setRsize] = useState(10)                   // RFP별 쪽 크기 (update-todo-rfp-paging)
  const [open, setOpen] = useState<number | null>(null)
  const [writing, setWriting] = useState(false)
  const toast = useToast()
  const [draft, setDraft] = useState<Filter>(NO_FILTER)      // 검색 영역에 고르는 중인 조건
  const [applied, setApplied] = useState<Filter>(NO_FILTER)  // 검색을 눌러 걸린 조건
  const [sum, setSum] = useState<St | null>(null)           // 요약 줄로 거른 상태
  const [view, setView] = useState<'dept' | 'rfp'>('dept')
  const [closed, setClosed] = useState<number[]>([])        // RFP별에서 접은 검토
  const [exporting, setExporting] = useState(false)
  const list = useLoad(() => api.assignments(), [])        // 세 부서 요청을 한 번에 받아 화면에서 거른다

  const [now, setNow] = useState(() => Date.now())   // 화면을 연 시각 기준으로 24시간·회신 기한을 센다
  const engineer = user?.role === 'ENGINEER'        // 보내기·재요청·회신 기록은 엔지니어만 (견적·품질·영업은 읽기만)
  const [sending, setSending] = useState<number | null>(null)
  const send = (a: Assignment, resend = false) => {
    if (!user) return
    setSending(a.assignment_id)
    api.sendRequests(a.run_id, [a.assignment_id], user.user_id, resend)
      .then((r) => r.sent ? toast.done(resend ? '다시 보냈습니다' : `${address(a)}(으)로 메일을 보냈습니다`)
        : toast.show(r.no_address ? '부서 주소가 설정되지 않아 보내지 않았습니다' : '메일을 보내지 못했습니다. 잠시 뒤 다시 보내 주세요', 'error'),
      (e: Error) => toast.show(e.message, 'error'))
      .finally(() => { setSending(null); setNow(Date.now()); list.reload() })
  }
  const all = list.data ?? []
  const inTab = (a: Assignment) => a.assignee_role === dept
  const tabCount = (k: Dept) => all.filter((a) => a.assignee_role === k).length
  const base = view === 'rfp' ? all : all.filter(inTab)                       // RFP별은 부서 탭과 상관없이
  const found = base.filter((a) => passes(a, applied, now))
  const rows = sum ? found.filter((a) => stOf(a, now) === sum) : found
  const count = (k: St) => found.filter((a) => stOf(a, now) === k).length
  // RFP별: 검토마다 묶음 (첫 요청 순서 = 최근 검토 먼저). 쪽은 묶음 순서로 늘어놓은 요청 줄로 자른다
  const groups = [...rows.reduce((m, a) => m.set(a.run_id, [...(m.get(a.run_id) ?? []), a]), new Map<number, Assignment[]>()).entries()]
  const listed = view === 'rfp' ? groups.flatMap(([, items]) => items) : rows
  const per = view === 'rfp' ? rsize : size
  const pages = Math.max(1, Math.ceil(listed.length / per))
  const cur = Math.min(page, pages)
  const shown = listed.slice((cur - 1) * per, cur * per)
  const pageGroups = [...shown.reduce((m, a) => m.set(a.run_id, [...(m.get(a.run_id) ?? []), a]), new Map<number, Assignment[]>()).entries()]
  const label = view === 'rfp' ? '전체 담당' : DEPTS.find(([k]) => k === dept)![1]
  const picked = all.find((a) => a.assignment_id === open) ?? null
  const anyF = JSON.stringify(applied) !== JSON.stringify(NO_FILTER) || sum !== null

  // 검색 영역 고르기 목록: 사업 → 그 사업의 RFP 검토, 수신자는 지금 보기의 주소
  const projects = uniq(all.map(projectOf))
  const runs = [...new Map(all.filter((a) => !draft.pj || projectOf(a) === draft.pj)
    .map((a) => [String(a.run_id), reviewLabel(a)])).entries()]
  const tos = uniq(base.map((a) => address(a)).filter((x): x is string => !!x))
  const runName = (id: string) => { const a = all.find((x) => String(x.run_id) === id); return a ? a.review_no : id }
  const chips: { t: string; drop: Partial<Filter> }[] = [
    ...(applied.pj ? [{ t: `사업: ${applied.pj}`, drop: { pj: '', rv: '' } }] : []),
    ...(applied.rv ? [{ t: `RFP 검토: ${runName(applied.rv)}`, drop: { rv: '' } }] : []),
    ...(applied.rp ? [{ t: `회신: ${RP_LABEL[applied.rp]}`, drop: { rp: '' as const } }] : []),
    ...(applied.by ? [{ t: `수신자: ${applied.by}`, drop: { by: '' } }] : []),
    ...(applied.q.trim() ? [{ t: `검색어: "${applied.q.trim()}"`, drop: { q: '' } }] : []),
  ]
  const apply = (f: Filter) => { setDraft(f); setApplied(f); setPage(1) }
  const reset = () => { apply(NO_FILTER); setSum(null) }
  const runCount = new Set(rows.map((a) => a.run_id)).size
  const resText = view === 'rfp' ? `전체 담당 ${rows.length}건 · RFP 검토 ${runCount}개` : `${rows.length}건`

  const exportXlsx = () => {
    if (exporting || !rows.length) return
    setExporting(true)
    api.exportAssignments(view === 'rfp' ? null : dept, rows.map((a) => a.assignment_id))
      .then(({ name, blob }) => { saveFile(name, blob); toast.done(`${name}를 만들었습니다.`) }, (e: Error) => toast.show(e.message, 'error'))
      .finally(() => setExporting(false))
  }

  const cells = (a: Assignment, withDept: boolean) => {
    const st = stOf(a, now)
    const t = tag(a)
    const fail = failTag(a)
    const rp = replyLine(a, now)
    return (
      <tr key={a.assignment_id} className={st === 'done' ? 'dis' : undefined} onClick={() => setOpen(a.assignment_id)} style={{ cursor: 'pointer' }}>
        <td><span className={`st ${ST[st][1]}`}>{ST[st][0]}</span>{rp && <span className={rp[0]}>{rp[1]}</span>}
          {fail && <div><span className="st c-red" style={{ marginTop: 4 }} title={a.mail_error ?? ''}>{fail}</span></div>}</td>
        <td>{t && <span className="tag" style={{ margin: '0 6px 0 0' }}>{t}</span>}<Title a={a} q={applied.q} />
          {a.is_assumed && <span className="tag">팀 가정</span>}
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-3)', marginTop: 4 }}>{desc(a)}</div>
          <div className="cond meta">{!withDept && <><a href={href(`/reviews/${a.run_id}`)} onClick={(e) => e.stopPropagation()}>{a.review_no}</a>
            {a.review_name && <span>{a.review_name}</span>}</>}<span>{where(a)}</span></div>
        </td>
        {withDept && <td><span className="dpt">{DEPTS.find(([k]) => k === a.assignee_role)?.[1] ?? a.assignee_role}</span></td>}
        <td style={{ whiteSpace: 'nowrap' }}>{address(a) ?? <span className="c-red">주소 없음</span>}</td>
        <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{a.mail_sent_at ? stamp(a.mail_sent_at) : '—'}</td>
        <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          {engineer && a.status === 'TODO' && <button type="button" className="lnk" disabled={sending !== null}
            aria-busy={sending === a.assignment_id || undefined}
            onClick={() => send(a)}>{sending === a.assignment_id ? <><Spinner />보내는 중…</> : a.mail_error ? '다시 보내기' : '보내기'}</button>}
          {engineer && a.status === 'DOING' && <button type="button" className="lnk" disabled={sending !== null}
            aria-busy={sending === a.assignment_id || undefined}
            onClick={() => send(a, true)}>{sending === a.assignment_id ? <><Spinner />보내는 중…</> : '재요청'}</button>}</td>
      </tr>
    )
  }

  return (
    <main className="main">
      <nav className="pgtabs" aria-label="수신 부서" style={view === 'rfp' ? { opacity: 0.5 } : undefined}>
        {DEPTS.map(([k, l]) => (
          <button key={k} type="button" className={view === 'dept' && dept === k ? 'on' : ''} aria-current={view === 'dept' && dept === k ? 'page' : 'false'}
            onClick={() => { setDept(k); setView('dept'); setPage(1) }}><span>{l}</span><span className="c">{tabCount(k)}</span></button>
        ))}
      </nav>
      <div className="ttl">
        <h1>{label}</h1>
        <Button icon="download" onClick={exportXlsx} busy={exporting}
          disabledReason={list.data !== null && !rows.length ? '내보낼 요청이 없습니다' : null}>{exporting ? '만드는 중…' : '내보내기'}</Button>
      </div>

      <form className="fbar" role="search" aria-label="협조 요청 찾기" onSubmit={(e) => { e.preventDefault(); apply(draft) }}>
        <label className="ff">사업<select className="fi" value={draft.pj} onChange={(e) => setDraft({ ...draft, pj: e.target.value, rv: '' })}>
          <option value="">전체</option>{projects.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="ff w">RFP 검토<select className="fi" value={draft.rv} onChange={(e) => setDraft({ ...draft, rv: e.target.value })}>
          <option value="">전체</option>{runs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="ff">회신<select className="fi" value={draft.rp} onChange={(e) => setDraft({ ...draft, rp: e.target.value as Filter['rp'] })}>
          <option value="">전체</option><option value="wait">회신 대기</option><option value="over">회신 기한 지남</option><option value="done">회신 완료</option></select></label>
        <label className="ff">수신자<select className="fi" value={draft.by} onChange={(e) => setDraft({ ...draft, by: e.target.value })}>
          <option value="">전체</option>{tos.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <div className="fbar2"><input className="fi" type="search" placeholder="요청 제목, 내용, 원문 위치, 수신자로 찾기 (예: 지체상금, Type Test)"
          aria-label="검색어" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
          <button type="button" className="bo" onClick={reset} disabled={!anyF && JSON.stringify(draft) === JSON.stringify(NO_FILTER)}>초기화</button>
          <button type="submit" className="bp"><span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>search</span>검색</button></div>
      </form>
      {(chips.length > 0 || sum) && <div className="fchips"><span>{resText}</span>
        {chips.map((c) => <button key={c.t} type="button" className="fchip" aria-label={`${c.t} 조건 풀기`}
          onClick={() => apply({ ...applied, ...c.drop })}>{c.t}<span className="ms" aria-hidden="true">close</span></button>)}
        {sum && <button type="button" className="fchip" aria-label={`상태: ${ST[sum][0]} 조건 풀기`} onClick={() => setSum(null)}>
          상태: {ST[sum][0]}<span className="ms" aria-hidden="true">close</span></button>}</div>}

      <div className="sumline" role="group" aria-label="상태로 거르기">
        {(['unsent', 'wait', 'late', 'done'] as St[]).map((k) => (
          <button key={k} type="button" className={sum === k ? 'on' : ''} aria-pressed={sum === k}
            onClick={() => { setSum(sum === k ? null : k); setPage(1) }}>{ST[k][0]}<b className={k === 'unsent' ? undefined : ST[k][1]}>{count(k)}</b></button>
        ))}
      </div>

      <section className="sec">
        <div className="sech"><h2>요청 항목 <span style={{ fontWeight: 400, color: 'var(--c-muted)' }}>{rows.length}</span></h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="seg" role="group" aria-label="보기 방식">
              <button type="button" className={view === 'dept' ? 'on' : ''} aria-pressed={view === 'dept'} onClick={() => { setView('dept'); setPage(1) }}>담당별</button>
              <button type="button" className={view === 'rfp' ? 'on' : ''} aria-pressed={view === 'rfp'} onClick={() => { setView('rfp'); setPage(1) }}>RFP별</button>
            </div>
            <button type="button" className="bp" onClick={() => setWriting(true)}>
              <span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>add</span>요청하기</button>
          </div></div>
        {list.error && <p role="alert">{list.error} <button type="button" className="lnk" onClick={list.reload}>다시 불러오기</button></p>}
        {view === 'dept' && (rows.length > 0 || list.data === null) && <div className="tw">
          <table className="tbl">
            <thead><tr><th style={{ width: 150 }}>상태</th><th style={{ width: '46%' }}>요구사항</th><th>보낸 주소</th><th>보낸 일시</th><th /></tr></thead>
            <tbody>
              {list.data === null && !list.error && <tr><td colSpan={5} className="dimv">불러오는 중…</td></tr>}
              {shown.map((a) => cells(a, false))}
            </tbody>
          </table>
          {rows.length > 0 && <Pager total={rows.length} page={cur} size={size} shown={shown.length} onPage={setPage} sizes={SIZES}
            onSize={(n) => { setSize(n); setPage(1) }} />}
        </div>}
        {view === 'rfp' && rows.length > 0 && <div className="rgs">
          {pageGroups.map(([runId, onPage]) => {
            const items = groups.find(([id]) => id === runId)![1]   // 머리 숫자는 그 검토의 거른 요청 전체
            const a = items[0]
            const isOpen = !closed.includes(runId)
            const done = items.filter((x) => x.status === 'DONE').length
            const over = items.filter((x) => rpOf(x, now) === 'over').length
            const depts = DEPTS.filter(([k]) => items.some((x) => x.assignee_role === k))
            return (
              <section key={runId} className={`rg${isOpen ? ' open' : ''}`} aria-label={`${a.review_no} 협조 요청`}>
                <div className="rg-h">
                  <button type="button" className="rg-tg" aria-expanded={isOpen} aria-label={`${a.review_no} ${isOpen ? '접기' : '펼치기'}`}
                    onClick={() => setClosed(isOpen ? [...closed, runId] : closed.filter((x) => x !== runId))}>
                    <span className="ms" aria-hidden="true">expand_more</span></button>
                  <div className="rg-t"><div className="l1"><a href={href(`/reviews/${runId}`)}>{a.review_no}</a><b>{a.review_name ?? ''}</b></div>
                    <div className="l2">{projectOf(a)}</div></div>
                  <div className="rg-s">
                    <span className="rg-dp">{depts.map(([k, l]) => {
                      const mine = items.filter((x) => x.assignee_role === k)
                      const od = mine.some((x) => rpOf(x, now) === 'over')
                      return <span key={k} className={od ? 'od' : undefined} title={`${l} ${mine.length}건`}>{l.replace(' 담당', '')} {mine.length}</span>
                    })}</span>
                    <span className="rg-bar" aria-hidden="true"><i style={{ width: `${Math.round((done / items.length) * 100)}%` }} /></span>
                    <span>회신 <b>{done}</b> / {items.length}</span>
                    {over > 0 && <span className="rg-od">기한 지남 {over}</span>}
                    {done === items.length && <span className="rg-ok">협조 완료</span>}
                  </div>
                  <button type="button" className="bo" onClick={() => setWriting(true)}>
                    <span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>add</span>이 검토에 요청</button>
                </div>
                {isOpen && <div className="tw"><table className="tbl">
                  <thead><tr><th style={{ width: 150 }}>상태</th><th style={{ width: '42%' }}>요구사항</th><th>담당</th><th>보낸 주소</th><th>보낸 일시</th><th /></tr></thead>
                  <tbody>{onPage.map((x) => cells(x, true))}</tbody>
                </table></div>}
              </section>
            )
          })}
          <Pager total={listed.length} page={cur} size={rsize} shown={shown.length} onPage={setPage} sizes={SIZES}
            onSize={(n) => { setRsize(n); setPage(1) }} />
        </div>}
        {list.data !== null && rows.length === 0 && <div className="emp">
          <div>{anyF ? '조건에 맞는 요청이 없습니다.'
            : view === 'rfp' ? '협조 요청이 없습니다.' : '이 담당에게 요청 항목이 없습니다.'}</div>
        </div>}
      </section>
      {picked && <Detail a={picked} now={now} dept={DEPTS.find(([k]) => k === picked.assignee_role)?.[1] ?? label} user={user}
        sending={sending !== null} sendingMe={sending === picked.assignment_id} onSend={send} onClose={() => setOpen(null)}
        onChanged={(msg) => { toast.done(msg); list.reload() }} />}
      {writing && <NewRequest dept={dept} rows={all.filter(inTab)} users={users} onClose={() => setWriting(false)}
        onSent={() => { setWriting(false); toast.done('예시 화면이라 보내지 않았습니다.') }} />}
    </main>
  )
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

/** 요청 상세 창: 요청 내용, 원문, 회신, 진행(만듦 → 메일 보냄 → 회신 받음). 엔지니어는 여기서 보내기·회신 받음을 표시한다 */
function Detail({ a, now, dept, user, sending, sendingMe, onSend, onClose, onChanged }: {
  a: Assignment; now: number; dept: string; user: User | null; sending: boolean; sendingMe: boolean; onSend: (a: Assignment, resend?: boolean) => void
  onClose: () => void; onChanged: (msg: string) => void
}) {
  useEsc(onClose)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const st = stOf(a, now)
  const to = address(a)
  const due = dueOf(a)
  const done = a.status === 'DONE'
  const engineer = user?.role === 'ENGINEER'
  const fail = failTag(a)
  const steps: { k: string; t: string; cls: string }[] = [{ k: '생성', t: stamp(a.sent_at), cls: 'done' }]
  if (a.mail_sent_at) steps.push({ k: '메일 발송', t: `${stamp(a.mail_sent_at)} · ${a.sent_by_name ?? '시스템'} → ${a.mail_to ?? ''}`, cls: 'done' })
  else steps.push(fail ? { k: fail, t: a.mail_error ?? '', cls: 'warn' } : { k: '메일 보내기 전', t: '판정을 확정하면 보냅니다', cls: 'wait' })
  if (st === 'late') steps.push({ k: '24시간 넘게 회신 없음', t: '재요청 필요', cls: 'warn' })
  if (done) steps.push({ k: '회신 완료', t: `${a.replied_at ? `${stamp(a.replied_at)} · ` : ''}${a.replied_by_name ?? ''}`, cls: 'done' })
  else if (a.mail_sent_at) steps.push({ k: '회신 대기', t: due ? `기한 ${md(due)}` : '', cls: 'wait' })

  const set = (status: 'DOING' | 'DONE') => {
    setBusy(true)
    setError(null)
    api.setTaskStatus(a.assignment_id, status, user!.user_id, status === 'DONE' ? note : undefined)
      .then(() => onChanged(status === 'DONE' ? '회신 완료로 처리했습니다' : '회신 완료를 취소했습니다'), (e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <div className="pmo" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pmw cw" role="dialog" aria-modal="true" aria-labelledby="dmTitle">
        <div className="pmh">
          <span className={`st ${ST[st][1]}`}>{ST[st][0]}</span>
          <h2 id="dmTitle">{title(a)}</h2>
          <span className="pmsrc">{dept} · {to ?? '주소 없음'}</span>
          <button type="button" className="ib" onClick={onClose} aria-label="닫기" title="닫기 (Esc)" autoFocus><span className="ms" aria-hidden="true">close</span></button>
        </div>
        <div className="cwb">
          <section className="cwl">
            <div className="lbl">요청 내용</div>
            <p className="req">{[desc(a), `${dept}에서 원문을 확인하고 회신해 주세요.`].filter(Boolean).join(' · ')}</p>
            {a.is_assumed && <p className="cwn"><span className="tag" style={{ margin: '0 6px 0 0' }}>팀 가정</span>팀 가정 값으로 계산했습니다. 확정 값으로 바꿔 회신해 주세요.</p>}
            <div className="lbl">{a.point_kind ? '제안 포인트 문장' : 'RFP 원문'}</div>
            <div className="orig"><div className="ol">{where(a)}</div><span>{a.text}</span></div>
            {a.requirement_id && <TypeFix runId={a.run_id} requirementId={a.requirement_id} current={a.type_code ?? null} />}
            {a.ask_text && <>
              <div className="lbl">메일에 넣은 확인할 점</div>
              <p className="cwn" data-testid="ask-text"><span className="tag" style={{ margin: '0 6px 0 0' }}>{a.ask_by === 'AI' ? 'AI 작성' : '기본 문장'}</span>{a.ask_text}
                <span className="dimv"> · 참고 문장이고 판단은 원문 기준</span></p>
            </>}
            <div className="lbl">회신</div>
            {done && <p className="cwn">{a.reply_note ? `회신 요지: ${a.reply_note}` : '회신 요지를 적지 않았습니다.'}{a.replied_at ? ` (${stamp(a.replied_at)} · ${a.replied_by_name ?? ''})` : ''}</p>}
            {!done && !a.mail_sent_at && <p className="cwn">아직 메일을 보내지 않았습니다.{fail ? ` ${fail}: ${a.mail_error}` : ''}</p>}
            {!done && a.mail_sent_at && (engineer
              ? <label className="fl">회신 요지 (한 줄)<input className="fi" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 성적서 3종 11-05까지 보냄" maxLength={200} /></label>
              : <p className="cwn">아직 회신 완료로 처리되지 않았습니다. 회신 기한 {due ? md(due) : '—'}</p>)}
          </section>
          <aside className="cwr">
            <dl className="basis">
              <div><dt>관련 검토</dt><dd><a href={href(`/reviews/${a.run_id}`)}>{a.review_no}</a></dd></div>
              <div><dt>수신 부서</dt><dd>{dept}</dd></div>
              <div><dt>받는 주소</dt><dd>{to ?? <span className="c-red">주소 없음</span>}</dd></div>
              <div><dt>보낸 사람</dt><dd>{a.sent_by_name ?? a.engineer_name ?? '검토 담당'}</dd></div>
              <div><dt>회신 기한</dt><dd>{due ? <span className={!done && due.getTime() < now ? 'c-red' : ''}>{md(due)}</span> : '—'}</dd></div>
            </dl>
            <div className="lbl" style={{ marginTop: 18 }}>진행</div>
            <ol className="tl2">{steps.map((sp) => <li key={sp.k} className={sp.cls}><b>{sp.k}</b><span>{sp.t}</span></li>)}</ol>
          </aside>
        </div>
        <div className="pmf">
          {error && <span className="aphint" role="alert" style={{ marginRight: 'auto' }}>{error}</span>}
          <span className="mdf-n">Esc로 닫기</span>
          <a className="bo" href={href(`/reviews/${a.run_id}`)}>검토 상세 열기</a>
          {engineer && a.status === 'TODO' && <button type="button" className="bp" disabled={sending} aria-busy={sendingMe || undefined} onClick={() => onSend(a)}>
            {sendingMe ? <><Spinner />보내는 중…</> : <><span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>send</span>{a.mail_error ? '다시 보내기' : '보내기'}</>}</button>}
          {engineer && a.status === 'DOING' && <button type="button" className="bo" disabled={sending} aria-busy={sendingMe || undefined} onClick={() => onSend(a, true)}>
            {sendingMe ? <><Spinner />보내는 중…</> : <><span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>notifications_active</span>재요청</>}</button>}
          {engineer && a.status === 'DOING' && <button type="button" className="bp" disabled={busy} onClick={() => set('DONE')}>
            <span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>mark_email_read</span>회신 완료 처리</button>}
          {engineer && done && <button type="button" className="bo" disabled={busy} onClick={() => set('DOING')}>회신 완료 취소</button>}
        </div>
      </div>
    </div>
  )
}

/** 협조 요청하기: 직접 요청을 만드는 API가 없어 예시 창이다. 보내도 저장하지 않는다 (_공통규칙.md 6장) */
function NewRequest({ dept, rows, users, onClose, onSent }: {
  dept: Dept; rows: Assignment[]; users: User[]; onClose: () => void; onSent: () => void
}) {
  useEsc(onClose)
  const [to, setTo] = useState<string>(dept === 'NONE' ? 'COST' : dept)
  const [what, setWhat] = useState('')
  const [body, setBody] = useState('')
  const [tried, setTried] = useState(false)
  const [due] = useState(() => new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10))
  const runs = [...new Map(rows.map((a) => [a.run_id, a.review_no])).entries()]
  const people = users.filter((u) => u.role === to)
  const send = () => {
    setTried(true)
    if (what.trim() && body.trim()) onSent()
  }
  return (
    <div className="pmo" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pmw nwd" role="dialog" aria-modal="true" aria-labelledby="nwTitle">
        <div className="pmh"><h2 id="nwTitle">협조 요청하기</h2><button type="button" className="ib" onClick={onClose} aria-label="닫기" title="닫기 (Esc)"><span className="ms" aria-hidden="true">close</span></button></div>
        <div className="nwb">
          <ExampleBand />
          <div className="g2">
            <label className="fl">관련 검토<select className="fi">{runs.length ? runs.map(([id, no]) => <option key={id} value={id}>{no}</option>) : <option>예시 검토</option>}</select></label>
            <label className="fl">원문 위치<input className="fi" placeholder="예: TS-115-GIS 19, 8.7절" /></label>
          </div>
          <label className="fl">요구사항<input className={`fi${tried && !what.trim() ? ' bad' : ''}`} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="예: SF6 가스 누설률 카탈로그 값" /></label>
          {tried && !what.trim() && <div className="ferr2">요구사항을 입력해 주세요.</div>}
          <div className="g2">
            <label className="fl">수신 부서<select className="fi" value={to} onChange={(e) => setTo(e.target.value)}>
              {DEPTS.filter(([k]) => k !== 'NONE').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="fl">수신자<select className="fi">{people.length ? people.map((u) => <option key={u.user_id}>{u.user_name}</option>) : <option>미지정</option>}</select></label>
          </div>
          <label className="fl">요청 내용<textarea className={`fi${tried && !body.trim() ? ' bad' : ''}`} rows={4} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="무엇을, 왜, 어떤 형식으로 회신받을지 적어 주세요." /></label>
          {tried && !body.trim() && <div className="ferr2">요청 내용을 입력해 주세요.</div>}
          <div className="g2">
            <label className="fl">회신 기한<input className="fi" type="date" defaultValue={due} /></label>
            <label className="ck2"><input type="checkbox" defaultChecked />원문 발췌를 함께 보냄</label>
          </div>
        </div>
        <div className="pmf">
          <button type="button" className="bo" onClick={onClose}>취소</button>
          <button type="button" className="bp" onClick={send}><span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>send</span>요청 보내기</button>
        </div>
      </div>
    </div>
  )
}
