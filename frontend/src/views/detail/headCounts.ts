import { useState } from 'react'
import { api, type RunSummary } from '../../api'
import { confirmAllComply } from '../../components/bulk'
import { num } from '../../components/format'
import { useLoad } from '../../components/useLoad'
import { useSession } from '../../shell/useSession'
import { useToast } from '../../ui'
import type { DetailTab } from './tabs'

// SCR-08 검토 상세 머리글·탭 수·아래 행동 줄이 같이 쓰는 건수와 "준수 모두 확정" (update-detail-header)

/** 머리글·탭 수·아래 줄이 같이 쓰는 건수. tick이 바뀌면(판정을 고치면) 다시 센다 */
export function useHeadCounts(run: RunSummary, tick: number) {
  const id = run.run_id
  const ready = run.stage !== 'PROCESSING'
  return useLoad(async () => {
    if (!ready) return null
    const [counts, sheets, losses, risks, reads, costs, points] = await Promise.all([
      api.judgmentCounts(id), api.datasheets(id), api.losses(id), api.risks(id), api.readChecks(id), api.costConditions(id), api.proposals(id),
    ])
    const n = (r: string) => counts.by_result[r] ?? 0
    const lossKnown = losses.length > 0 && losses.every((l) => l.total_usd !== null)
    return {
      counts,
      deviations: n('DEVIATION_CANDIDATE'), queries: n('QUERY_CANDIDATE'), review: n('NEEDS_REVIEW'), comply: n('COMPLY'),
      must: n('DEVIATION_CANDIDATE') + n('QUERY_CANDIDATE') + n('NEEDS_REVIEW'),
      emptyCells: sheets.reduce((s, d) => s + d.empty, 0), cells: sheets.reduce((s, d) => s + d.rows, 0),
      loss: losses.length === 0 ? null : lossKnown ? `$${num(Math.round(losses.reduce((s, l) => s + (l.total_usd ?? 0), 0)))}` : '—',
      risks: risks.filter((r) => r.status === 'CANDIDATE').length,
      reads: reads.filter((r) => !r.checked_at).length,
      strengths: points.filter((p) => p.status !== 'DISCARDED').length,
      unsent: costs.conditions.filter((c) => c.request_status === 'TODO').length,
    }
  }, [id, ready, tick])
}
export type HeadCounts = NonNullable<ReturnType<typeof useHeadCounts>['data']>

/** 탭 이름 옆 수: 판정 = 꼭 볼 것, 강점 제안 = 버리지 않은 강점, 위험 조건 = 확인 안 한 후보, 문서 읽기 점검 = 확인 안 한 곳, 상업 조건 = 안 보낸 요청 */
export const tabCounts = (h: HeadCounts | null | undefined): Partial<Record<DetailTab, number>> =>
  h ? { judge: h.must, bid: h.strengths, risk: h.risks, read: h.reads, comm: h.unsent } : {}

/** 확정하지 않은 준수 판정을 모두 확정 (머리글 "묶어서 확정"과 아래 줄 "모두 확정"). 담당자 확인 단계의 엔지니어만 */
export function useComplyAll(run: RunSummary, head: HeadCounts | null, onChanged: () => void) {
  const { user } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const can = run.stage === 'ENGINEER_REVIEW' && user?.role === 'ENGINEER' && (head?.counts.unconfirmed_comply ?? 0) > 0
  const go = async () => {
    if (!user) return
    setBusy(true)
    try { toast.done(await confirmAllComply(run.run_id, user.user_id)); onChanged() } catch (e) { toast.show((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return { run: can ? go : null, busy }
}

