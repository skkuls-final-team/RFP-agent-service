import { useState } from 'react'
import { api, type CompareRule, type Location, type DocKindRule, type ItemKey, type MeaningCandidate, type RiskExpression, type RuleDictionary, type RuleEdit, type RuleSuggestion, type RuleValue } from '../api'
import { ErrorText } from '../components/common'
import { Pager } from '../components/Pager'
import { useKeepHeight } from '../components/useKeepHeight'
import { useLoad } from '../components/useLoad'
import { usePageCss } from '../shell/pageCss'
import { currentPath, pathQuery } from '../shell/router'
import { useSession } from '../shell/useSession'
import { RuleDialog, type RuleTarget } from './RuleDialog'
import { ErrorBox, Loading } from '../ui'
import { DIRECTION_NAMES, DOC_KIND_NAMES, EDITOR_ROLES, locationText, RISK_NAMES, RULE_FIELD_NAMES } from '../components/labels'

// SCR-17 판정 규칙 (목업 v4.57 Rules). docs/screens/SCR-17-판정규칙.md
// 비교 방향·항목 이름·위험 표현·문서 종류 사전 네 가지와 쓴 횟수 (단위 탭은 단위 환산 금지 CR-10으로 뺐다).
// 엔지니어·승인자는 규칙을 추가·수정·삭제하고, 줄마다 수정 이력을 본다 (add-rule-editing).

type TabKey = 'dir' | 'name' | 'risk' | 'kind'
type Cell = { v: string; cls?: string; right?: boolean }
// id: 고치기 API의 줄 번호, rkey: 다시 적재해도 같은 줄을 찾는 키(수정 이력 맞추기), value: 고치기 창 시작값
type Row = { key: string; search: string; cells: Cell[]; detail: [string, string][]; id: string; title: string
  rkey: Record<string, unknown>; value: RuleValue }
type Tab = { label: string; ph: string; cols: [string, boolean][]; rows: Row[]; used: number; dict: RuleDictionary }

const DICTS: Record<TabKey, RuleDictionary> = { dir: 'compare', risk: 'risk-expressions', name: 'items', kind: 'doc-kinds' }
const ACTIONS: Record<RuleEdit['action'], string> = { ADD: '추가', EDIT: '수정', DELETE: '삭제' }
const when = (t: string) => new Date(t).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const sameKey = (a: Record<string, unknown> | null, b: Record<string, unknown>) =>
  !!a && Object.keys(b).every((k) => (a[k] ?? null) === (b[k] ?? null))
/** 그 줄의 고침: 고치기 전 키나 고친 뒤 키가 지금 줄 키와 같은 것 (새것부터) */
const historyOf = (edits: RuleEdit[], dict: RuleDictionary, rkey: Record<string, unknown>) =>
  edits.filter((e) => e.dictionary === dict && (sameKey(e.row_key, rkey) || sameKey(e.after_key, rkey)))
const changed = (e: RuleEdit) => {
  if (e.action !== 'EDIT' || !e.before_value || !e.after_value) return ''
  const keys = Object.keys(e.after_value).filter((k) => JSON.stringify(e.before_value![k]) !== JSON.stringify(e.after_value![k]))
  return keys.map((k) => `${RULE_FIELD_NAMES[k] ?? k}: ${fmt(e.before_value![k])} → ${fmt(e.after_value![k])}`).join(', ')
}
const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join('; ') : String(v))
const SUGGEST_STATUS: Record<string, [string, string]> = { PENDING: ['st c-blue', '확인 대기'], ACCEPTED: ['st c-green', '반영'], DECLINED: ['st c-grey', '반려'] }
const day = (t: string) => new Date(t).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\. ?/g, '-').replace(/-$/, '')

const strength = (s: string | null) => (s === 'HIGHER' ? '클수록 강점' : s === 'LOWER' ? '작을수록 강점' : '강점 아님')
const dir = (d: string | null) => (d ? DIRECTION_NAMES[d] ?? d : '—')
const usedCell = (n: number): Cell => ({ v: `${n}건`, right: true, cls: n ? '' : 'c-grey' })

function dirTab(rules: CompareRule[]): Tab {
  return {
    label: '비교 방향', ph: '항목, 표, 방향', dict: 'compare',
    cols: [['항목', false], ['표 · 번호', false], ['방향', false], ['시간 조건', false], ['강점 방향', false], ['쓴 판정', true]],
    used: rules.reduce((a, r) => a + r.used, 0),
    rows: rules.map((r) => {
      const name = r.name_ko ?? r.item_key ?? '표준 항목 없음'
      const where = `${r.table_name ?? '—'}${r.item_no ? ` · ${r.item_no}번` : ''}`
      return {
        key: `dir:${r.compare_rule_id}`, search: [name, r.item_key, where, dir(r.direction), r.process_note].join(' '),
        cells: [{ v: name, cls: r.item_key ? '' : 'c-grey' }, { v: where, cls: 'mono' }, { v: dir(r.direction), cls: r.direction === 'AI' ? 'c-ora' : '' },
          { v: r.time_condition ? '시간도 비교' : '—' }, { v: strength(r.strength_direction) }, usedCell(r.used)],
        detail: [['표준 항목', r.item_key ?? '—'], ['처리', r.process_note ?? '—']],
        id: String(r.compare_rule_id), title: `${name} · ${where}`,
        rkey: { table_name: r.table_name, item_no: r.item_no, item_key: r.item_key },
        value: { table_name: r.table_name, item_no: r.item_no, item_key: r.item_key, direction: r.direction,
          time_condition: r.time_condition, strength_direction: r.own_strength_direction, process_note: r.process_note },
      }
    }),
  }
}

function nameTab(items: ItemKey[]): Tab {
  return {
    label: '항목 이름', ph: 'RFP 표기, 표준 항목', dict: 'items',
    cols: [['표준 항목', false], ['RFP에 나오는 표기', false], ['제품표 칸', false], ['기본 방향', false], ['쓴 판정', true]],
    used: items.reduce((a, r) => a + r.used, 0),
    rows: items.map((r) => ({
      key: `name:${r.item_key}`, search: [r.name_ko, r.item_key, ...r.aliases].join(' '),
      cells: [{ v: r.name_ko }, { v: r.aliases.length ? r.aliases.join(', ') : '동의어 없음', cls: r.aliases.length ? '' : 'c-grey' },
        { v: r.pm_column ?? (r.fixed_key ? `고정값 ${r.fixed_key}` : '—'), cls: 'mono' }, { v: dir(r.default_direction) }, usedCell(r.used)],
      detail: [['표준 항목 키', r.item_key], ['강점 방향', strength(r.strength_direction)], ['메모', r.note ?? '—']],
      id: r.item_key, title: r.name_ko, rkey: { item_key: r.item_key },
      value: { item_key: r.item_key, name_ko: r.name_ko, aliases: r.aliases, default_direction: r.default_direction,
        strength_direction: r.strength_direction, note: r.note },
    })),
  }
}

function riskTab(exprs: RiskExpression[]): Tab {
  return {
    label: '위험 표현', ph: '영문 표현, 위험 종류', dict: 'risk-expressions',
    cols: [['표현 (원문)', false], ['위험 종류', false], ['언어', false], ['위험으로 보는 조건', false], ['쓴 횟수', true]],
    used: exprs.reduce((a, r) => a + r.used, 0),
    rows: exprs.map((r) => ({
      key: `risk:${r.expr_id}`, search: [r.expression, RISK_NAMES[r.risk_kind] ?? r.risk_kind, r.context_rule].join(' '),
      cells: [{ v: r.expression }, { v: RISK_NAMES[r.risk_kind] ?? r.risk_kind }, { v: r.language, cls: 'mono' },
        { v: r.context_rule, cls: r.context_rule.includes('미정') ? 'c-ora' : '' }, usedCell(r.used)],
      detail: [['위험 조건 후보 수', `${r.used}건 (이 표현으로 찾은 후보, 확정은 사람)`]],
      id: String(r.expr_id), title: r.expression, rkey: { expression: r.expression },
      value: { expression: r.expression, language: r.language, risk_kind: r.risk_kind, context_rule: r.context_rule },
    })),
  }
}

function kindTab(rules: DocKindRule[]): Tab {
  return {
    label: '문서 종류', ph: '문서 종류, 찾는 표현', dict: 'doc-kinds',
    cols: [['문서 종류', false], ['파일 이름에서 찾는 표현', false], ['첫 장에서 찾는 표현', false], ['순서', true], ['분류한 문서', true]],
    used: rules.reduce((a, r) => a + r.used, 0),
    rows: rules.map((r) => ({
      key: `kind:${r.doc_kind_rule_id}`, search: [DOC_KIND_NAMES[r.doc_kind], r.doc_kind, r.name_pattern, r.page_pattern, r.note].join(' '),
      cells: [{ v: DOC_KIND_NAMES[r.doc_kind] ?? r.doc_kind }, { v: r.name_pattern, cls: 'mono' },
        { v: r.page_pattern ?? '파일 이름만 봄', cls: r.page_pattern ? 'mono' : 'c-grey' }, { v: String(r.priority), right: true },
        { v: `${r.used}개`, right: true, cls: r.used ? '' : 'c-grey' }],
      detail: [['메모', r.note ?? '—'], ['찾는 순서', '모든 줄의 파일 이름 표현을 위에서부터 본 뒤, 맞는 것이 없으면 첫 장 표현을 본다. 아무것도 안 맞으면 "종류 모름"(확인 필요)'],
        ['분류한 문서', `${r.used}개 (규칙이 이 종류로 정한 문서. AI·사람이 정한 문서는 빼고 셈)`]],
      id: String(r.doc_kind_rule_id), title: `${DOC_KIND_NAMES[r.doc_kind] ?? r.doc_kind} · ${r.priority}번`, rkey: { priority: r.priority },
      value: { priority: r.priority, doc_kind: r.doc_kind, name_pattern: r.name_pattern, page_pattern: r.page_pattern, note: r.note },
    })),
  }
}

export function Rules() {
  usePageCss('Rules')
  const [tab, setTab] = useState<TabKey>('dir')
  // 판정 상세의 "판정 규칙 보기"는 #/rules?q=<항목>으로 비교 방향 탭을 그 항목으로 걸러 연다 (add-judgment-view)
  const [q, setQ] = useState(() => pathQuery(currentPath()).get('q') ?? '')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [target, setTarget] = useState<RuleTarget | null>(null)
  const { user } = useSession()
  const canEdit = !!user && EDITOR_ROLES.includes(user.role)
  const lockText = '규칙은 엔지니어·승인자만 고칠 수 있습니다 (머리글에서 사용자 바꾸기)'
  const data = useLoad(() => Promise.all([api.compareRules(), api.ruleItems(), api.riskExpressions(), api.docKindRules(), api.ruleEdits()]), [])
  const suggestions = useLoad(() => api.ruleSuggestions(), [])
  const links = useLoad(() => api.itemCandidates(), [])     // 항목 연결 후보 (add-meaning-search)
  const edits = data.data?.[4] ?? []
  const last = edits.find((e) => e.dictionary === DICTS[tab] && !e.discarded_at)
  const itemKeys: [string, string][] = (data.data?.[1] ?? []).map((r) => [r.item_key, `${r.name_ko} (${r.item_key})`])

  const tabs: Record<TabKey, Tab> | null = data.data
    ? { dir: dirTab(data.data[0]), name: nameTab(data.data[1]), risk: riskTab(data.data[2]), kind: kindTab(data.data[3]) }
    : null
  const T = tabs?.[tab]
  const needle = q.trim().toLowerCase()
  const found = T ? T.rows.filter((r) => !needle || r.search.toLowerCase().includes(needle)) : []
  const rows = found.slice((page - 1) * size, page * size)
  // 꽉 찬 쪽의 표 높이를 마지막 쪽에도 유지 (update-rule-page-height)
  const { ref: tableRef, minHeight: keptHeight } = useKeepHeight<HTMLDivElement>(found.length > size && rows.length === size && !rows.some((r) => open[r.key]), `${tab}|${needle}|${size}`, page)

  return (
    <main className="main">
      <div className="ttl">
        <h1>판정 규칙</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span title="수정 요청 보내기는 아직 없습니다"><button type="button" className="bo" disabled><span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>edit_note</span>수정 요청</button></span>
          <span title={canEdit ? `${T?.label ?? ''} 규칙 추가` : lockText}><button type="button" className="bp" disabled={!canEdit || !T}
            onClick={() => setTarget({ mode: 'add', dictionary: DICTS[tab] })}>
            <span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>{canEdit ? 'add' : 'lock'}</span>규칙 추가</button></span>
        </div>
      </div>
      <Suggestions items={suggestions.data ?? []} error={suggestions.error} canEdit={canEdit} lockText={lockText}
        onAccept={(x) => setTarget({ mode: 'add', dictionary: 'risk-expressions', suggestionId: x.suggestion_id, title: `${x.review_no} 제안`,
          value: { expression: x.expression, language: /[가-힣]/.test(x.expression) ? 'ko' : 'en', risk_kind: 'BLANKET', context_rule: null } })}
        onDeclined={suggestions.reload} />
      <div className="rtabs" role="tablist" aria-label="규칙 종류">
        {(['dir', 'risk', 'name', 'kind'] as TabKey[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''}
            onClick={() => { setTab(k); setQ(''); setOpen({}); setPage(1) }}>
            {tabs?.[k].label ?? { dir: '비교 방향', name: '항목 이름', risk: '위험 표현', kind: '문서 종류' }[k]}<span className="n">{tabs?.[k].rows.length ?? '…'}</span>
          </button>
        ))}
      </div>
      {tab === 'name' && <ItemLinks items={links.data ?? []} error={links.error} canEdit={canEdit} lockText={lockText}
        onDone={() => { links.reload(); data.reload() }} />}
      <section className="sec" style={{ marginTop: 16 }}>
        <ErrorText error={data.error} />
        <div className="rhead"><span>마지막 수정 <b>{last ? `${last.actor_name} · ${when(last.edited_at)} · ${ACTIONS[last.action]}` : '기록 없음'}</b></span>{!canEdit && <span className="c-ora">규칙은 엔지니어·승인자만 고칠 수 있습니다</span>}<span>{tab === 'kind' ? '규칙이 분류한 문서' : '지금 판정에 쓰임'} <b>{T ? `${T.used.toLocaleString('en-US')}${tab === 'kind' ? '개' : '회'}` : '…'}</b></span></div>
        <div className="filters" role="search" style={{ marginTop: 0 }}>
          <label htmlFor="rq" className="sr">규칙 검색</label>
          <input className="fi" id="rq" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder={T?.ph} style={{ flex: '1 1 260px', maxWidth: 340 }} />
          {q && <button type="button" className="bo" onClick={() => { setQ(''); setPage(1) }}>검색 지우기</button>}
        </div>
        <div className="tw" ref={tableRef} style={{ minHeight: keptHeight, boxSizing: 'border-box' }} data-testid="rule-table">
          <table className="tbl">
            <thead><tr>{T?.cols.map(([label, right]) => <th key={label} style={right ? { textAlign: 'right' } : undefined}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.flatMap((r) => {
                const op = !!open[r.key]
                const toggle = () => setOpen({ ...open, [r.key]: !op })
                const out = [
                  <tr key={r.key} className={op ? 'on' : ''} onClick={toggle} style={{ cursor: 'pointer' }}
                    tabIndex={0} aria-expanded={op} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
                    {r.cells.map((c, k) => (
                      <td key={k} style={{ ...(c.right ? { textAlign: 'right' } : {}), ...(k === 0 ? { fontWeight: 600, whiteSpace: 'nowrap' } : {}) }}>
                        {k === 0 && <span className="ms caret" aria-hidden="true">{op ? 'expand_more' : 'chevron_right'}</span>}
                        <span className={c.cls}>{c.v}</span>
                      </td>
                    ))}
                  </tr>,
                ]
                if (op) out.push(
                  <tr key={`${r.key}:x`} className="rx"><td colSpan={T?.cols.length}><div className="rxin">
                    <div><h4>이 규칙의 내용</h4><ul>{r.detail.map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul></div>
                    <div><h4>수정 이력</h4><RowHistory edits={historyOf(edits, T!.dict, r.rkey)} />
                      <div className="rxact">
                        <span title={canEdit ? undefined : lockText}><button type="button" className="bo" disabled={!canEdit}
                          onClick={() => setTarget({ mode: 'edit', dictionary: T!.dict, id: r.id, value: r.value, title: r.title })}>
                          <span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>edit</span>수정</button></span>
                        <span title={canEdit ? undefined : lockText}><button type="button" className="bo" disabled={!canEdit}
                          onClick={() => setTarget({ mode: 'delete', dictionary: T!.dict, id: r.id, value: r.value, title: r.title })}>
                          <span className="ms" aria-hidden="true" style={{ fontSize: 'var(--ic-s)' }}>delete</span>삭제</button></span>
                      </div>
                    </div>
                  </div></td></tr>,
                )
                return out
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && <Pager total={found.length} page={page} size={size} shown={rows.length} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />}
        {T && rows.length === 0 && <p style={{ margin: 0, padding: '16px 12px', color: 'var(--c-muted)' }}>조건에 맞는 규칙이 없습니다.</p>}
      </section>
      {target && <RuleDialog target={target} itemKeys={itemKeys} onClose={() => setTarget(null)}
        onDone={() => { setTarget(null); if (target.mode === 'delete') setOpen({}); data.reload(); suggestions.reload() }} />}
    </main>
  )
}

function RowHistory({ edits }: { edits: RuleEdit[] }) {
  if (!edits.length) return <ul><li>수정 이력 없음 (초기 규칙)</li></ul>
  return (
    <ul className="rhist">
      {edits.map((e) => (
        <li key={e.edit_id} className={e.discarded_at ? 'rdis' : ''}>
          <b>{ACTIONS[e.action]}</b> {e.reason} <span className="rwho">· {e.actor_name} · {when(e.edited_at)}{e.discarded_at ? ' · 제외' : ''}</span>
          {changed(e) && <div className="rwho mono">{changed(e)}</div>}
        </li>
      ))}
    </ul>
  )
}

/** 위험 표현 사전 · 사람이 제안한 표현 (add-rule-suggestion). 확인 대기 먼저. 반영은 규칙 추가 창, 반려는 사유를 받는다 */
/** 항목 연결 후보 (add-meaning-search, B3): 사전에 없는 표 항목 이름을 항목 표현과 뜻으로 비교한 후보.
 * [같은 뜻 표현으로 추가]하면 그 항목의 표현에 들어가고(고침 이력) 다음 분석부터 판정에 쓰인다. 후보만으로 판정하지 않는다. */
function ItemLinks({ items, error, canEdit, lockText, onDone }: {
  items: MeaningCandidate[]; error: string | null; canEdit: boolean; lockText: string; onDone: () => void
}) {
  const { user } = useSession()
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const act = (x: MeaningCandidate, accept: boolean) => {
    if (!user) return
    setBusy(true)
    setFail(null)
    ;(accept ? api.acceptItem(x.candidate_id, user.user_id) : api.hideItem(x.candidate_id, user.user_id))
      .then(() => { setDone(accept ? `“${x.text_raw}”을(를) ${x.target}의 동의어로 추가했습니다. 다음 분석부터 판정에 쓰입니다.` : `“${x.text_raw}” 후보를 숨겼습니다.`); onDone() },
        (e: Error) => setFail(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <section className="rkp" aria-labelledby="ilT" style={{ marginTop: 16 }}>
      <div className="rkp-h"><h2 id="ilT">항목 이름 · 연결 후보{items.length > 0 && <span className="st c-blue" style={{ marginLeft: 8 }}>{items.length}</span>}</h2>
        <span>판정 대상 데이터시트에서 사전에 없어 판정하지 못한 항목 이름을, 항목 표현과 뜻으로 비교했습니다. 가장 가까운 항목이 0.85 이상이고 둘째보다 0.03 앞설 때만 보입니다.</span></div>
      {items.length === 0 && <div className="rkp-r rkp-e"><span className="c-grey">연결 후보가 없습니다. AI를 사용한 분석에서만 만들어집니다.</span></div>}
      {items.map((x) => (
        <div key={x.candidate_id} className="rkp-r sg" data-testid="item-link">
          <span className="mono">{x.score.toFixed(2)}</span>
          <b>“{x.text_raw}”</b>
          <span>→ <b className="mono">{x.target}</b> (가까운 표현 “{x.near_text}”{x.second_target ? ` · 둘째 ${x.second_target} ${x.second_score?.toFixed(2)}` : ''}) · <a href={`#/reviews/${x.run_id}`}>{x.review_no}</a> · {locationText(x.locations[0])}</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }} title={canEdit ? undefined : lockText}>
            <button type="button" className="bo" disabled={!canEdit || busy} onClick={() => act(x, true)}>동의어로 추가</button>
            <button type="button" className="bo" disabled={!canEdit || busy} onClick={() => act(x, false)}>숨기기</button>
          </span>
        </div>
      ))}
      {(fail || error) && <p className="aphint" role="alert">{fail ?? error}</p>}
      {done && <p className="aphint" role="status">{done}</p>}
    </section>
  )
}

/** 표현을 문장에서 찾는다. 저장된 표현은 띄어쓰기를 하나로 줄였으므로 띄어쓰기 차이·대소문자를 무시한다 [앞, 강조, 뒤] */
function markLoose(text: string, expr: string): [string, string, string] {
  const words = expr.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const m = words.length ? new RegExp(words.join('\\s+'), 'i').exec(text) : null
  return m ? [text.slice(0, m.index), m[0], text.slice(m.index + m[0].length)] : [text, '', '']
}

/** 제안 줄을 펼치면: 표현이 나온 원래 문장 전체(표현 강조), 원문 위치 모두, 메모·반려 사유 (add-suggestion-source) */
function SuggestionSource({ s }: { s: RuleSuggestion }) {
  const loc: Location = s.locations[0]
  const from = loc.line_start ?? 1
  const to = Math.min(from + 39, loc.line_end ?? from)
  const lines = useLoad(() => api.documentLines(s.run_id, loc.file_no, from, to), [s.run_id, loc.file_no, from, to])
  const text = lines.data?.lines.map((l) => l.text).join(' ') ?? ''
  const [a, m, b] = markLoose(text, s.expression)
  return (
    <div className="sg-src" data-testid="suggestion-source">
      <b className="sg-lbl">원래 문장</b>
      {lines.error ? <ErrorBox error={lines.error} onRetry={lines.reload} />
        : !lines.data ? <Loading label="원문 불러오는 중" />
        : <p className="sg-txt">{a}{m && <mark>{m}</mark>}{b}</p>}
      {lines.data?.partial && <p className="sg-note" role="note">원문 파일이 없어 추출된 문장만 표시합니다.</p>}
      {lines.data && !m && <p className="sg-note">제안한 표현을 이 문장에서 찾지 못해 강조하지 않았습니다.</p>}
      <b className="sg-lbl">원문 위치</b>
      <ul>{s.locations.map((l, i) => <li key={i}>{lines.data && i === 0 ? `${lines.data.file_name} · ` : ''}{locationText(l)}</li>)}</ul>
      {s.note && <><b className="sg-lbl">메모</b><p>{s.note}</p></>}
      {s.decision_reason && <><b className="sg-lbl">{s.status === 'DECLINED' ? '반려 사유' : '반영 사유'}</b><p>{s.decision_reason}</p></>}
    </div>
  )
}

function Suggestions({ items, error, canEdit, lockText, onAccept, onDeclined }: {
  items: RuleSuggestion[]; error: string | null; canEdit: boolean; lockText: string
  onAccept: (s: RuleSuggestion) => void; onDeclined: () => void
}) {
  const { user } = useSession()
  const [declining, setDeclining] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const decline = (id: number) => {
    if (!user) return
    setBusy(true)
    setFail(null)
    api.declineSuggestion(id, why.trim(), user.user_id)
      .then(() => { setDeclining(null); setWhy(''); onDeclined() }, (e: Error) => setFail(e.message))
      .finally(() => setBusy(false))
  }
  const waiting = items.filter((s) => s.status === 'PENDING').length
  const toggle = (id: number) => setOpen(open === id ? null : id)
  return (
    <section className="rkp" aria-labelledby="rkpT">
      <div className="rkp-h"><h2 id="rkpT">위험 표현 사전 · 사람이 제안한 표현{waiting > 0 && <span className="st c-blue" style={{ marginLeft: 8 }}>확인 대기 {waiting}</span>}</h2>
        <span>검토 중 엔지니어가 찾은 특이 요구입니다. 규칙 담당이 반영하면 사전에 들어가 다음 검토부터 위험 조건으로 잡힙니다.</span></div>
      {items.length === 0 && <div className="rkp-r rkp-e"><span className="c-grey">제안한 표현이 없습니다. 검토 상세 위험 조건 탭에서 제안합니다.</span></div>}
      {items.length > 0 && (
        <div className="rkp-r sg sg-h" aria-hidden="true">
          <span>제안일</span><span>제안한 표현</span><span>제안한 곳</span><span>상태</span><span>처리</span>
        </div>
      )}
      {items.map((x) => {
        const [cls, st] = SUGGEST_STATUS[x.status]
        const where = x.locations[0] ? locationText(x.locations[0]) : '—'
        return (
          <div key={x.suggestion_id} className={'rkp-r sg' + (open === x.suggestion_id ? ' on' : '')} data-testid="rule-suggestion"
            onClick={(e) => { if (!(e.target as HTMLElement).closest('a,input,button:not(.sg-x)')) toggle(x.suggestion_id) }}>
            <span className="mono">{day(x.suggested_at)}</span>
            <button type="button" className="sg-x" aria-expanded={open === x.suggestion_id} title="눌러서 원래 문장 보기">
              <span className="ms" aria-hidden="true">{open === x.suggestion_id ? 'expand_less' : 'expand_more'}</span><b>“{x.expression}”</b></button>
            <span><a href={`#/reviews/${x.run_id}`} title="위험 조건 탭에서 제안했습니다">{x.review_no}</a> · {where} · {x.suggested_by_name}{x.note ? ` · ${x.note}` : ''}</span>
            {x.status === 'PENDING' && declining === x.suggestion_id ? (
              <span className="sg-why">
                <input className="fi" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="반려 사유" placeholder="반려 사유" />
                <button type="button" className="bo" disabled={busy || !why.trim()} onClick={() => decline(x.suggestion_id)}>반려</button>
                <button type="button" className="lnk" onClick={() => setDeclining(null)}>취소</button>
              </span>
            ) : (
              <>
                <span data-testid="suggestion-status"><span className={cls} title={x.decision_reason ?? undefined}>{st}</span></span>
                {x.status === 'PENDING' ? (
                  <span className="sg-act" title={canEdit ? undefined : lockText}>
                    <button type="button" className="bo" disabled={!canEdit} onClick={() => onAccept(x)}>반영</button>
                    <button type="button" className="bo" disabled={!canEdit} onClick={() => { setDeclining(x.suggestion_id); setWhy('') }}>반려</button>
                  </span>
                ) : (
                  <span className="sg-done" title={x.decision_reason ?? undefined}>{x.decided_at ? day(x.decided_at) : '—'}{x.decided_by_name ? ` · ${x.decided_by_name}` : ''}</span>
                )}
              </>
            )}
            {open === x.suggestion_id && <SuggestionSource s={x} />}
          </div>
        )
      })}
      {(fail || error) && <p className="aphint" role="alert">{fail ?? error}</p>}
      <div className="rkp-f"><a href="#/eval">반영 후 점수 변화는 정답지·채점에서 봅니다<span className="ms" aria-hidden="true">chevron_right</span></a></div>
    </section>
  )
}
