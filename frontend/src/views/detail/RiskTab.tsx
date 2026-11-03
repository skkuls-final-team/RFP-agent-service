import { Fragment, useRef, useState } from 'react'
import { api, type LogEntry, type Risk, type RunDocument, type RunSummary } from '../../api'
import { stamp } from '../../components/format'
import { locName, locShort, markSplit } from '../../components/judgment'
import { RISK_NAMES, STATUS_NAMES } from '../../components/labels'
import { useLoad } from '../../components/useLoad'
import { usePage } from '../../components/usePage'
import { href } from '../../shell/router'
import { useSession } from '../../shell/useSession'
import { useToast } from '../../ui'
import { OutputEditor } from './OutputEditor'

// SCR-08-3 위험 조건 탭 (목업 v4.57 Detail #risk). docs/screens/SCR-08-3-위험조건.md
// 위험 조건 표와 "사람이 찾은 특이 요구"(사전 추가 제안, add-rule-suggestion) 모두 실제 데이터.

const KINDS = ['BLANKET', 'VALUE_MISMATCH', 'OPEN_SCOPE'] as const
const TONES: Record<string, string> = { CANDIDATE: 'c-ora', CONFIRMED: 'c-red', CLOSED_OK: 'c-grey' }
// 언어 모델 설명이 없을 때 쓰는 종류별 한 줄
// 근거 대조에서 AI 설명을 버린 이유 (update-ai-answer-checks)
const DROP_REASONS: Record<string, string> = {
  UNKNOWN_EVIDENCE: '근거 위치 불일치',
  QUOTE_NOT_FOUND: '근거에 없는 인용',
  NUMBER_NOT_ALLOWED: '근거에 없는 숫자',
  FORMAT_ERROR: '형식 오류',
}

const KIND_NOTES: Record<string, string> = {
  BLANKET: '책임 범위를 정하지 않고 넓히는 표현',
  VALUE_MISMATCH: '같은 항목의 값이 문서 안에서 다름',
  OPEN_SCOPE: '대상 범위가 열려 있는 표현',
}

/** 제안 표현은 100자까지만 받는다. 더 길면 낱말 중간에서 끊지 않도록 그 안의 마지막 띄어쓰기에서 자르고 끝 문장부호를 뗀다 */
function cutWords(text: string, max: number) {
  const t = text.trim()
  if (t.length <= max) return t
  const head = t.slice(0, max + 1)
  const at = head.lastIndexOf(' ')
  return (at > 0 ? head.slice(0, at) : t.slice(0, max)).replace(/[\s,;:·(（「“"']+$/u, '')
}

function title(r: Risk): string {
  if (r.risk_kind === 'VALUE_MISMATCH') {
    const values = r.members.map((m) => m.value_raw).filter(Boolean).join(' / ')
    return `${r.item_name ?? RISK_NAMES[r.risk_kind]}${values ? ` ${values}` : ''}`
  }
  return r.expression ? `“${r.expression}”` : RISK_NAMES[r.risk_kind] ?? r.risk_kind
}

function where(r: Risk, docs: RunDocument[]): string {
  return locShort({ locations: r.members.flatMap((m) => m.locations) }, docs)
}

/** 알림에 넣는 이름: 값 불일치는 항목 이름, 나머지는 표현 */
function name(r: Risk): string {
  return r.risk_kind === 'VALUE_MISMATCH' ? r.item_name ?? RISK_NAMES[r.risk_kind] : r.expression ? `“${r.expression}”` : RISK_NAMES[r.risk_kind] ?? r.risk_kind
}

/** 마지막 확정·닫기 기록 (누가, 언제, 사유) */
function decided(r: Risk, log: LogEntry[]): LogEntry | null {
  const mine = log.filter((l) => l.target_table === 'risk_flag' && l.target_id === r.risk_id
    && (l.action === 'CONFIRM' || l.action === 'REJECT'))
  return mine.length ? mine[mine.length - 1] : null
}

export function RiskTab({ run, tick, onChanged }: { run: RunSummary; tick: number; onChanged: () => void }) {
  const { user } = useSession()
  const id = run.run_id
  const risks = useLoad(() => api.risks(id), [id, tick])
  const log = useLoad(() => api.history(id), [id, tick])
  const docs = useLoad(() => api.documents(id), [id])
  const items = useLoad(() => api.outputs(id), [id, tick])
  const [open, setOpen] = useState<number | null>(null)
  const [closing, setClosing] = useState<number | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const say = (m: string) => toast.done(m)
  const canEdit = run.stage === 'ENGINEER_REVIEW' && user?.role === 'ENGINEER'
  const lock = run.stage !== 'ENGINEER_REVIEW' ? '담당자 확인 단계에서만 고칠 수 있습니다' : !canEdit ? '엔지니어만 고칠 수 있습니다' : undefined

  const all = risks.data ?? []
  const live = all.filter((r) => r.status !== 'CLOSED_OK')
  const rows = [...live, ...all.filter((r) => r.status === 'CLOSED_OK')]
  const { shown, pager } = usePage(rows)
  const note = KINDS.map((k) => `${RISK_NAMES[k]} ${live.filter((r) => r.risk_kind === k).length}`).join(' · ')

  const act = (r: Risk, action: 'CONFIRM' | 'REJECT') => {
    setBusy(true)
    setError(null)
    api.act(id, { target: 'risk_flag', target_id: r.risk_id, action, reason: action === 'REJECT' ? why.trim() : undefined, actor_id: user!.user_id })
      .then(() => {
        setClosing(null); setWhy(''); onChanged()
        // 한 일 + 바뀌는 것 (update-risk-action-toasts). 닫은 위험 조건은 질의 후보를 만들지 않고 결재 확인 사유에서도 빠진다
        toast.done(action === 'CONFIRM'
          ? `${name(r)}: 위험으로 확정했습니다. 질의 후보와 결재 확인 사유에 남습니다.`
          : `${name(r)}: 문제 없음으로 닫았습니다. 이 조건에서 만든 질의 후보는 목록에서 빠집니다.`)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <section className="sec" id="risk">
      <div className="sech"><h2>위험 조건<span className="note">{note}</span></h2></div>
      <Found run={run} docs={docs.data ?? []} />
      {risks.error && <p role="alert">{risks.error} <button type="button" className="lnk" onClick={risks.reload}>다시 불러오기</button></p>}
      {risks.data?.length === 0 && <p style={{ color: 'var(--c-muted)' }}>위험 조건 후보가 없습니다.</p>}
      {rows.length > 0 && (
        // 칸 폭 고정: 긴 파일 이름이 설명 칸을 눌러 한 낱말씩 줄이 바뀌지 않게 (위치는 줄을 바꿔 보인다)
        <table className="mini rkt"><colgroup><col className="c-s" /><col /><col className="c-w" /><col className="c-a" /></colgroup><tbody>
          {shown.map((r) => {
            const d = decided(r, log.data ?? [])
            const closed = r.status === 'CLOSED_OK'
            return (
              <Fragment key={r.risk_id}>
                <tr className={closed ? 'dis' : undefined}>
                  <td style={{ width: 92 }}><span className={`st ${TONES[r.status] ?? 'c-grey'}`}>{STATUS_NAMES[r.status] ?? r.status}</span></td>
                  <td>
                    <b style={{ fontWeight: 600 }}>{title(r)}</b>
                    <div className="en">{RISK_NAMES[r.risk_kind]} · {closed && d?.reason ? d.reason : r.explanation_ai ?? (r.explanation_drop_reason ? <span className="c-ora" title="AI가 쓴 설명이 근거와 맞지 않아 저장하지 않았습니다">AI 설명 버림 · {DROP_REASONS[r.explanation_drop_reason]}</span> : KIND_NOTES[r.risk_kind])}{!closed && r.explanation_ai && r.explanation_check === 'NEEDS_REVIEW' && <span className="tag chk warn" style={{ marginLeft: 6 }} title="다른 질문으로 다시 물었을 때 인용이 이 설명을 받쳐 준다고 답하지 않았습니다. 원문을 확인하세요">AI 검증: 확인 필요</span>}</div>
                  </td>
                  <td className="loc">
                    <button type="button" className="lnk" aria-expanded={open === r.risk_id} style={{ fontSize: 'inherit', fontWeight: 400, color: 'inherit', textAlign: 'left' }}
                      onClick={() => setOpen(open === r.risk_id ? null : r.risk_id)}>{where(r, docs.data ?? [])}</button>
                  </td>
                  <td className="loc">
                    {r.status === 'CANDIDATE'
                      ? closing === r.risk_id
                        ? <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="fi" aria-label="문제 없음 사유" placeholder="닫는 사유" value={why} autoFocus
                              onChange={(e) => setWhy(e.target.value)} style={{ width: 200, height: 32 }} />
                            <button type="button" className="bp" disabled={busy || !why.trim()} onClick={() => act(r, 'REJECT')}>닫기</button>
                            <button type="button" className="bo" onClick={() => { setClosing(null); setWhy('') }}>취소</button>
                          </span>
                        : <span style={{ display: 'flex', gap: 6 }} title={lock}>
                            <button type="button" className="bo" disabled={!canEdit || busy} onClick={() => act(r, 'CONFIRM')}>위험으로 확정</button>
                            <button type="button" className="bo" disabled={!canEdit || busy} onClick={() => { setClosing(r.risk_id); setWhy('') }}>문제 없음</button>
                          </span>
                      : d ? `${d.actor} · ${stamp(d.acted_at)}` : '—'}
                  </td>
                </tr>
                {open === r.risk_id && (
                  <tr><td /><td colSpan={3}>
                    {r.members.map((m) => {
                      const [a, k, b] = markSplit(m.text_raw, r.risk_kind === 'VALUE_MISMATCH' ? m.value_raw : r.expression)
                      return (
                        <div key={m.requirement_id} className="pl hitl" style={{ margin: '4px 0' }}>
                          <span className="lno">{m.locations[0]?.line_start ?? ''}</span>
                          <span className="ltx">{a}{k && <mark>{k}</mark>}{b}<div className="en">{m.locations.map((l) => locName(l, docs.data ?? [])).join(' · ')}</div></span>
                        </div>
                      )
                    })}
                    {(items.data ?? []).filter((i) => i.sources.some((s) => s.risk_id === r.risk_id)).map((i) => (
                      <div key={i.item_id} style={{ marginTop: 10, maxWidth: 640 }}>
                        <OutputEditor key={`${i.item_id}-${i.text_draft}-${i.status}`} runId={id} item={i} id={`risk-draft-${i.item_id}`} canEdit={canEdit} onDone={onChanged} onSaved={say} />
                      </div>
                    ))}
                  </td></tr>
                )}
              </Fragment>
            )
          })}
        </tbody></table>
      )}
      {pager}
      {error && <p className="aphint" role="alert">{error}</p>}
    </section>
  )
}

const SUGGEST_TONES: Record<string, [string, string]> = {
  PENDING: ['c-blue', '제안함 · 규칙 담당 확인 대기'], ACCEPTED: ['c-green', '반영'], DECLINED: ['c-grey', '반려'],
}

/** 사람이 찾은 특이 요구: 놓친 표현을 위험 표현 사전에 추가 제안 (add-rule-suggestion, FR-06 ④).
 * 표현은 이 검토 문서에 있어야 하고, 처음 나온 문장의 위치를 근거로 붙인다(CR-02). 반영은 판정 규칙 화면에서 한다. */
function Found({ run, docs }: { run: RunSummary; docs: RunDocument[] }) {
  const { user } = useSession()
  const toast = useToast()
  const list = useLoad(() => api.runSuggestions(run.run_id), [run.run_id])
  const near = useLoad(() => api.riskMeaning(run.run_id), [run.run_id])   // 사전 추가 후보 (add-meaning-search)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [flash, setFlash] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // 후보가 많으면 제안 칸이 화면 밖이라, 채운 뒤 그 칸으로 옮기고 커서를 둔다 (update-suggest-fill-focus)
  const fill = (raw: string, memo: string) => {
    const sentence = cutWords(raw, 100)
    setText(sentence); setNote(memo); setFlash(true)
    requestAnimationFrame(() => {
      input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      input.current?.focus({ preventScroll: true })
      input.current?.select()
    })
    setTimeout(() => setFlash(false), 1500)
    toast.done(`제안 칸에 문장을 채웠습니다.${sentence.length < raw.trim().length ? ' 100자가 넘어 낱말 경계에서 줄였습니다.' : ''} 위험한 표현만 남기고 줄인 뒤 [위험 표현 사전에 추가 제안]을 누르세요.`)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSuggest = user?.role === 'ENGINEER'
  const send = () => {
    if (!user || !text.trim()) return
    setBusy(true)
    setError(null)
    api.suggestRule(run.run_id, text.trim(), note.trim(), user.user_id)
      .then(() => {
        toast.done(`“${text.trim()}”: 위험 표현 사전에 추가를 제안했습니다. 규칙 담당이 판정 규칙 화면에서 반영하면 다음 검토부터 잡힙니다.`,
          { href: href('/rules'), label: '판정 규칙 보기' })
        setText(''); setNote(''); list.reload()
      }, (e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <div className="rk">
      <div className="rk-h"><b>사람이 찾은 특이 요구</b><span>시스템이 위험 조건으로 잡지 못한 표현을 찾았다면 위험 표현 사전에 추가를 제안합니다. 규칙 담당이 판정 규칙 화면에서 반영하면 다음 검토부터 잡힙니다.</span></div>
      {(list.data ?? []).map((s) => {
        const [tone, label] = SUGGEST_TONES[s.status]
        return (
          <div key={s.suggestion_id} className="rk-r" data-testid="suggestion">
            <div><b>“{s.expression}”</b>
              <span>{locShort(s, docs)}{s.note ? ` · ${s.note}` : ''} · {s.suggested_by_name}{s.status === 'DECLINED' && s.decision_reason ? ` · 반려 사유: ${s.decision_reason}` : ''}</span></div>
            <span className={`st ${tone}`}>{label}</span>
          </div>
        )
      })}
      {list.data?.length === 0 && <div className="rk-r"><div><span>아직 제안한 표현이 없습니다.</span></div></div>}
      <div className="rk-h" data-testid="meaning-head"><b>사전 추가 후보 {near.data?.items.length ?? 0}</b>
        <span>{near.data?.status === 'NO_AI' ? 'AI 없이 분석해 유사 문장 검색을 하지 않았습니다.'
          : near.data?.status === 'SKIPPED' ? '유사 문장 검색에 실패해 건너뛰었습니다. 사전 기반 위험 조건 탐지 결과는 그대로입니다.'
          : near.data?.status == null ? '유사 문장 검색 기능 도입 전에 분석한 검토입니다.'
          : '사전에 걸리지 않은 문장 중 위에서 잡힌 문장·사전 표현과 뜻이 가까운 문장입니다. 위험 조건이 아니라 사전에 넣을지 볼 후보입니다.'}</span></div>
      {(near.data?.items ?? []).map((c) => (
        <div key={c.candidate_id} className="rk-r" data-testid="meaning-candidate">
          <div><b>“{c.text_raw}”</b>
            <span>{locShort(c, docs)} · 유사 {c.target ? `${RISK_NAMES[c.target] ?? c.target} ` : ''}“{c.near_text}” · 유사도 {c.score.toFixed(2)}</span></div>
          <button type="button" className="bo" disabled={!canSuggest || busy}
            title={canSuggest ? '아래 제안 칸에 이 문장을 채웁니다. 표현만 남기고 줄여서 제안하세요.' : '엔지니어만 제안할 수 있습니다'}
            onClick={() => fill(c.text_raw, `유사 문장 (유사도 ${c.score.toFixed(2)})`)}>사전 추가 제안</button>
        </div>
      ))}
      <div className={'rk-f' + (flash ? ' on' : '')}>
        <input ref={input} className="fi" value={text} onChange={(e) => setText(e.target.value)} disabled={!canSuggest || busy}
          placeholder="놓친 표현을 원문 그대로 붙여 넣기 (예: shall be capable of ...)" aria-label="놓친 위험 표현" />
        <input className="fi" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canSuggest || busy}
          placeholder="메모 (선택: 왜 위험한지)" aria-label="제안 메모" />
        <span title={canSuggest ? undefined : '엔지니어만 제안할 수 있습니다'}>
          <button type="button" className="bo" disabled={!canSuggest || busy || !text.trim()} onClick={send}>위험 표현 사전에 추가 제안</button></span>
      </div>
      {(error || list.error) && <p className="aphint" role="alert">{error ?? list.error}</p>}
    </div>
  )
}
