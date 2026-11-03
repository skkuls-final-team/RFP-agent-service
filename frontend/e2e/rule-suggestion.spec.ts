import { expect, test } from '@playwright/test'
import { ENGINEER, as, riskRun } from './helpers'

// 명세 review-workspace "사전 추가 제안 화면"의 Scenario (change add-rule-suggestion).
// 합성 사양서(tests/docx_factory.build_gis_spec)에 있지만 위험 표현 사전에는 없는 표현을 쓴다.
// 반영하면 공용 DB 사전에 들어가므로, 끝나면 그 규칙을 지워 다음 실행에서도 다시 제안할 수 있게 한다.
const PHRASE = "corresponding to the Employer's Requirement"

async function dropRule(request: import('@playwright/test').APIRequestContext) {
  const rules = await (await request.get('/api/rules/risk-expressions')).json() as { expr_id: number; expression: string }[]
  for (const r of rules.filter((x) => x.expression.toLowerCase() === PHRASE.toLowerCase())) {
    await request.delete(`/api/rules/risk-expressions/${r.expr_id}`, { data: { reason: 'e2e 정리', actor_id: ENGINEER } })
  }
  // 앞선 실행이 남긴 확인 대기 제안도 반려해 둔다(같은 표현은 한 번만 대기)
  const pending = await (await request.get('/api/rule-suggestions?status=PENDING')).json() as { suggestion_id: number; expression: string }[]
  for (const s of pending.filter((x) => x.expression.toLowerCase() === PHRASE.toLowerCase())) {
    await request.post(`/api/rule-suggestions/${s.suggestion_id}/decline`, { data: { reason: 'e2e 정리', actor_id: ENGINEER } })
  }
}

test.afterAll(async ({ request }) => { await dropRule(request) })

// 명세 review-workspace "위험 조건 처리 알림"의 Scenario (change update-risk-action-toasts)
test('사전 추가 제안 알림', async ({ page }) => {
  await dropRule(page.request)
  const run = await riskRun(page.request, `제안 알림 ${Date.now()}`)
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${run.run_id}`)
  await page.getByRole('tab', { name: '위험 조건' }).click()
  const box = page.locator('#risk .rk')
  await box.getByLabel('놓친 위험 표현').fill(PHRASE)
  await box.getByRole('button', { name: '위험 표현 사전에 추가 제안' }).click()
  const toast = page.locator('.uisnk').filter({ hasText: `“${PHRASE}”: 위험 표현 사전에 추가를 제안했습니다` })
  await expect(toast).toContainText('다음 검토부터 잡힙니다')
  await expect(toast.getByRole('link', { name: '판정 규칙 보기' })).toHaveAttribute('href', /#\/rules/)
  await expect(box.getByTestId('suggestion').filter({ hasText: PHRASE })).toBeVisible()
})

test('제안하고 반영하기', async ({ page }) => {
  await dropRule(page.request)
  const run = await riskRun(page.request, `사전 제안 ${Date.now()}`)
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${run.run_id}`)
  await page.getByRole('tab', { name: '위험 조건' }).click()
  const box = page.locator('#risk .rk')
  await expect(box.getByRole('note')).toHaveCount(0)               // 예시 띠 없음
  await box.getByLabel('놓친 위험 표현').fill(PHRASE)
  await box.getByLabel('제안 메모').fill('범위가 고객 요구에 묶임')
  await box.getByRole('button', { name: '위험 표현 사전에 추가 제안' }).click()
  const mine = box.getByTestId('suggestion').filter({ hasText: PHRASE })
  await expect(mine).toContainText('확인 대기')
  await expect(mine).toContainText('행')                          // 찾은 곳(원문 위치)
  await expect(mine).toContainText('범위가 고객 요구에 묶임')

  await page.goto('/#/rules')
  const row = page.getByTestId('rule-suggestion').filter({ hasText: PHRASE }).first()
  await expect(row).toContainText(run.review_no)
  await row.getByRole('button', { name: '반영' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('제안 반영')
  await expect(dialog.getByLabel('표현 (원문)')).toHaveValue(PHRASE)
  await dialog.getByLabel('위험 종류').selectOption('OPEN_SCOPE')
  await dialog.getByLabel('추가 사유').fill('검토에서 찾은 범위 표현')
  await dialog.getByRole('button', { name: '저장' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row).toContainText('반영')
  await expect(row.getByRole('button', { name: '반영' })).toHaveCount(0)

  await page.getByRole('tab', { name: /위험 표현/ }).click()
  await page.getByRole('search').getByRole('textbox').fill('Employer')
  await expect(page.locator('table tbody')).toContainText(PHRASE)

  await page.goto(`/#/reviews/${run.run_id}`)
  await page.getByRole('tab', { name: '위험 조건' }).click()
  await expect(page.locator('#risk .rk').getByTestId('suggestion').filter({ hasText: PHRASE })).toContainText('반영')
})

// 명세 review-workspace "사전 추가 제안 화면" (change update-suggestion-list-layout)
test('제안 목록 칸 맞춤', async ({ page }) => {
  const base = { note: null, run_id: 3, review_no: 'RV-2026-003', requirement_id: 1, suggested_by: 1, suggested_by_name: '엔지니어',
    suggested_at: '2026-11-02T03:00:00Z', edit_id: null, locations: [{ file_no: 91, section_no: '1', section_title: 'GENERAL', table_name: null, item_no: null, line_start: 10, line_end: 10 }] }
  await page.route('**/api/rule-suggestions*', (route) => route.fulfill({ json: [
    { ...base, suggestion_id: 1, expression: 'to the satisfaction of the Owner', status: 'PENDING', decided_by: null, decided_by_name: null, decided_at: null, decision_reason: null },
    { ...base, suggestion_id: 2, expression: "corresponding to the Employer's Requirement", status: 'ACCEPTED', decided_by: 1, decided_by_name: '엔지니어', decided_at: '2026-11-03T03:00:00Z', decision_reason: '범위 표현' },
  ] }))
  await as(page, ENGINEER)
  await page.goto('/#/rules')
  const box = page.locator('section.rkp').first()
  const head = box.locator('.sg-h')
  for (const name of ['제안일', '제안한 표현', '제안한 곳', '상태', '처리']) await expect(head).toContainText(name)
  const rows = box.getByTestId('rule-suggestion')
  await expect(rows).toHaveCount(2)
  const x = async (i: number) => (await rows.nth(i).getByTestId('suggestion-status').boundingBox())!.x
  const hx = (await head.locator('span').nth(3).boundingBox())!.x
  expect(await x(0)).toBe(await x(1))                                     // 확인 대기·반영 줄의 상태 칸이 같은 자리
  expect(await x(0)).toBe(hx)                                             // 칸 이름과도 같은 자리
  await expect(rows.nth(0).getByRole('button', { name: '반영' })).toBeVisible()
  await expect(rows.nth(1)).toContainText('11-03 · 엔지니어')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

// 명세 review-workspace "사전 추가 제안 화면" (change add-suggestion-source)
test('제안 줄 펼쳐 원문 보기', async ({ page }) => {
  const loc = { file_no: 91, section_no: '1.5', section_title: '현장작업', table_name: null, item_no: null, line_start: 40, line_end: 41 }
  await page.route('**/api/rule-suggestions*', (route) => route.fulfill({ json: [{
    suggestion_id: 1, expression: 'anchor bolts, nuts and embedded materials for', note: '범위 모호', run_id: 3, review_no: 'RV-2026-003',
    requirement_id: 1, status: 'PENDING', suggested_by: 1, suggested_by_name: '엔지니어', suggested_at: '2026-11-02T03:00:00Z',
    decided_by: null, decided_by_name: null, decided_at: null, decision_reason: null, edit_id: null, locations: [loc],
  }] }))
  let asked = ''
  await page.route('**/api/runs/3/documents/91/lines*', (route) => {
    asked = route.request().url()
    return route.fulfill({ json: { file_no: 91, file_name: 'spec.docx', line_from: 40, line_to: 41, partial: false, lines: [
      { line_no: 40, text: '3) The Contractor shall supply all cables, piping, anchor bolts, nuts and' },
      { line_no: 41, text: 'embedded materials for installation of each equipment.' },
    ] } })
  })
  await as(page, ENGINEER)
  await page.goto('/#/rules')
  const row = page.getByTestId('rule-suggestion')
  const src = row.getByTestId('suggestion-source')
  await row.getByRole('button', { name: '반영' }).click()                  // 단추는 펼치지 않는다
  await page.getByRole('dialog').getByRole('button', { name: '닫기' }).first().click()
  await expect(src).toHaveCount(0)
  await row.click({ position: { x: 600, y: 12 } })                         // 줄을 누르면 펼침
  await expect(src).toContainText('3) The Contractor shall supply all cables, piping, anchor bolts, nuts and embedded materials for installation of each equipment.')
  await expect(src.locator('mark')).toHaveText('anchor bolts, nuts and embedded materials for')   // 줄 바꿈을 넘어 강조
  await expect(src).toContainText('spec.docx')
  await expect(src).toContainText('범위 모호')
  expect(asked).toContain('from=40&to=41')
  await expect(row.getByRole('button', { name: /anchor bolts/ })).toHaveAttribute('aria-expanded', 'true')
  await row.getByRole('button', { name: /anchor bolts/ }).click()          // 다시 누르면 접힘
  await expect(src).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
