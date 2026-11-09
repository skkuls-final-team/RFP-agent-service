import { expect, test, type Page } from '@playwright/test'

// 명세 review-workspace "검토 상세 머리글과 탭"·"검토 상세 아래 행동 줄"·"판정 탭 한꺼번에 확정"·"목록 초안 내려받기와 문장 고치기"
// Scenario (change update-detail-header). 검토 하나의 API 응답을 테스트가 정한 값으로 바꿔 머리글만 본다(백엔드·RFP 원문 없이).

const ID = 9101
type Opt = { stage?: string; due?: string | null; business?: boolean; comply?: number }

function today(add: number): string {
  const d = new Date(); d.setDate(d.getDate() + add)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function mock(page: Page, o: Opt = {}) {
  const stage = o.stage ?? 'ENGINEER_REVIEW'
  let comply = o.comply ?? 45
  const now = new Date().toISOString()
  const run = {
    run_id: ID, review_no: 'RV-TEST-HD', review_name: '115·230 kV GIS', project_name: 'Thai Binh 변전소', customer_name: '고객사 가', country: '베트남',
    due_date: o.due === undefined ? today(6) : o.due, engineer_id: 1, engineer_name: '시험 엔지니어',
    business_id: o.business ? 77 : null, business_no: o.business ? 'PJ-TEST-77' : null, stage, dict_version: 'v', llm_model: null,
    step: 'assign', step_detail: null, step_updated_at: now, failed_step: null, error_message: null, cancel_requested_at: null, retries: 0, retryable: false,
    started_at: now, finished_at: now, documents: 1, requirements: 57, risks: 1, judgments: 57, deviation_candidates: 2, output_items: 2, check_violations: 0, proposals: 0,
  }
  const json: Record<string, unknown> = {
    [`/api/runs/${ID}`]: run,
    '/api/users': [{ user_id: 1, user_name: '시험 엔지니어', role: 'ENGINEER' }, { user_id: 2, user_name: '시험 승인자', role: 'APPROVER' }],
    [`/api/runs/${ID}/approval`]: { stage, approval: null, reasons: [], preview: [], review_ratio: { review: 8, total: 57, threshold: 0.2, hand_fill: 0 }, submission_check: null, read_unchecked: 0 },
    [`/api/runs/${ID}/documents`]: [{ document_id: 1, file_no: 91, file_name: 'synthetic.docx', bundle: 'A', doc_kind: 'TS', language: 'en', standard_system: 'IEC', judge_target: true, readable: true, classify_by: 'RULE', needs_review: false, line_basis: 'paragraph', requirements: 57 }],
    [`/api/runs/${ID}/datasheets`]: [{ table_id: 1, table_name: 'Schedule A', file_name: 'synthetic.docx', rows: 12, empty: 5 }],
    [`/api/runs/${ID}/losses`]: [],
    [`/api/runs/${ID}/risks`]: [],
    [`/api/runs/${ID}/read-checks`]: [],
    [`/api/runs/${ID}/cost-conditions`]: { conditions: [], impacts: [] },
    [`/api/runs/${ID}/outputs`]: [{ item_id: 1, list_kind: 'DEVIATION', status: 'CANDIDATE' }],
    '/api/businesses/77': { business_id: 77, business_no: 'PJ-TEST-77', business_name: 'Thai Binh 변전소', customer_name: '고객사 가', country: '베트남', tender_no: 'NPT-TB-07', order_mode: null, business_due_date: null, due_date: null, days_left: null, sales_id: 3, sales_name: '시험 영업', created_by: 1, created_by_name: '시험 엔지니어', created_at: now, submitted_at: null, my_role: null, ranges: [], people: [], schedule: [], documents: [] },
  }
  await page.route('**/api/**', async (r) => {
    const url = new URL(r.request().url())
    const path = url.pathname
    if (path === `/api/runs/${ID}/judgment-counts`) {
      return r.fulfill({ json: { by_result: { DEVIATION_CANDIDATE: 2, QUERY_CANDIDATE: 2, NEEDS_REVIEW: 8, COMPLY: 45 }, total: 57, unconfirmed: 12 + comply, unconfirmed_comply: comply, past_seen: 0, past_differs: 0 } })
    }
    if (path === `/api/runs/${ID}/judgments`) {
      const ids = url.searchParams.get('result') === 'COMPLY' && url.searchParams.get('unconfirmed') === 'true' ? comply : 0
      return r.fulfill({ json: Array.from({ length: ids }, (_, i) => ({ judgment_id: 1000 + i })), headers: { 'X-Total-Count': String(ids) } })
    }
    if (path === `/api/runs/${ID}/actions/bulk`) {
      const n = (r.request().postDataJSON() as { ids: number[] }).ids.length
      comply = 0
      return r.fulfill({ json: { confirmed: n, skipped: [], submission_check: null } })
    }
    if (path in json) return r.fulfill({ json: json[path] })
    return r.fulfill({ json: [] })
  })
  await page.addInitScript(() => localStorage.setItem('s2w.user', '1'))
  await page.goto(`/#/reviews/${ID}`)
}

test('요약 칸', async ({ page }) => {
  await mock(page)
  for (const name of ['검토', '사업', '판정 진행']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  const k = page.locator('.hf-k')
  for (const t of ['꼭 볼 것', '준수', '작성할 칸5칸', '12칸 중 빈칸']) await expect(k).toContainText(t)
  await expect(page.locator('.kpis')).toHaveCount(0)
  await expect(page.getByText('확인 필요 비율')).toHaveCount(0)
})

test('꼭 볼 것', async ({ page }) => {
  await mock(page)
  const k = page.locator('.hf-k')
  await expect(k).toContainText('꼭 볼 것12건')
  await expect(k).toContainText('일탈 2 · 질의 2 · 확인 8')
  await expect(k).toContainText('준수45건')
  await expect(page.getByRole('tab', { name: /^판정/ })).toContainText('12')
})

test('사업 묶음', async ({ page }) => {
  await mock(page, { business: true })
  const biz = page.locator('.hf', { has: page.getByRole('heading', { name: '사업' }) })
  await expect(biz).toContainText('NPT-TB-07')
  await expect(biz).toContainText('시험 영업')
})

test('상신 권장일', async ({ page }) => {
  await mock(page, { due: today(6) })
  const want = today(4).slice(5)
  await expect(page.locator('.hf', { has: page.getByRole('heading', { name: '검토' }) })).toContainText(`상신 권장${want}`)
})

test('내보내기 묶음', async ({ page }) => {
  await mock(page)
  await page.getByRole('button', { name: '내보내기' }).click()
  const menu = page.getByRole('menu')
  for (const name of ['일탈 목록 초안 (Word)', '질의서 초안 (Word)', 'TBE 준수표', '데이터시트 채우기']) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible()
  }
})

test('더 보기 탭', async ({ page }) => {
  await mock(page)
  await page.getByRole('button', { name: '더 보기' }).click()
  await page.getByRole('menuitem', { name: '지난 RFP 비교' }).click()
  await expect(page.getByRole('tab', { name: '지난 RFP 비교' })).toHaveAttribute('aria-selected', 'true')
})

test('아래 행동 줄로 한꺼번에 확정', async ({ page }) => {
  await mock(page, { comply: 45 })
  const bar = page.locator('.ftb')
  await expect(bar).toContainText('준수 45건은')
  await bar.getByRole('button', { name: '모두 확정' }).click()
  await expect(page.locator('.uisnk')).toContainText('판정 45건을 일괄 확정했습니다.')
  await expect(bar.getByRole('button', { name: '모두 확정' })).toHaveCount(0)
})

test('단계별 아래 줄', async ({ page }) => {
  await mock(page, { stage: 'APPROVED' })
  const bar = page.locator('.ftb')
  await expect(bar).toContainText('승인됨')
  await expect(bar.getByRole('button', { name: '결재 상신' })).toHaveCount(0)
  await expect(bar.getByRole('button', { name: '모두 확정' })).toHaveCount(0)
})
