import { expect, test, type Page } from '@playwright/test'
import { as, ENGINEER, lossRun, openTab, riskRun } from './helpers'

// 명세 review-workspace "손실 환산 탭"의 Scenario (change update-review-screens).

async function openLoss(page: Page, runId: number) {
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${runId}`)
  await openTab(page, '강점 제안')
  return page.locator('#loss table.mini tbody tr')
}

test('손실 환산 표', async ({ page }) => {
  const run = await lossRun(page.request, `손실 표 ${Date.now()}`)
  const rows = await openLoss(page, run.run_id)
  test.skip(await page.getByText('손실 환산 조항이 없어').isVisible(), '합성 데이터시트가 문서 목록(묶음 A)에 없습니다')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0)).toContainText('무부하 손실4,500 $/kW ×')
  await expect(rows.nth(1)).toContainText('부하 손실3,200 $/kW ×')
  await expect(rows.nth(2)).toContainText('보조 손실1,300 $/kW ×')
  await expect(page.getByLabel('무부하 손실 손실값 (kW)', { exact: true })).toHaveValue('')
  await expect(rows.nth(0)).toContainText('입력 필요')
  await expect(rows.nth(3)).toHaveText(/가산액\s*—/)
  await expect(page.locator('#loss .sech .note')).toContainText(/단가 \d+~\d+행/)
})

// Scenario: 손실 환산 결과
test('손실값 넣어 다시 계산', async ({ page }) => {
  const run = await lossRun(page.request, `손실 계산 ${Date.now()}`)
  const rows = await openLoss(page, run.run_id)
  test.skip(await page.getByText('손실 환산 조항이 없어').isVisible(), '합성 데이터시트가 문서 목록(묶음 A)에 없습니다')
  await page.getByLabel('무부하 손실 손실값 (kW)', { exact: true }).fill('60')
  await page.getByLabel('부하 손실 손실값 (kW)', { exact: true }).fill('300')
  await page.getByLabel('보조 손실 손실값 (kW)', { exact: true }).fill('8')
  await page.getByLabel('보조 손실 손실값 (kW)', { exact: true }).press('Enter')
  await expect(rows.nth(0)).toContainText('$270,000')
  await expect(rows.nth(1)).toContainText('$960,000')
  await expect(rows.nth(2)).toContainText('$10,400')
  await expect(rows.nth(3)).toContainText('$1,240,400')
  await expect(page.locator('#loss')).toContainText('팀 가정')
  await expect(page.locator('.hf-k')).toContainText('$1,240,400')
})

test('조항 없는 RFP', async ({ page }) => {
  const run = await riskRun(page.request, `조항 없음 ${Date.now()}`)
  await openLoss(page, run.run_id)
  await expect(page.getByText('이 RFP에는 손실 환산 조항이 없어 계산하지 않았습니다.', { exact: false })).toBeVisible()
  await expect(page.locator('#loss table.mini')).toHaveCount(0)
})

test('견적 협조 요청 단추는 같은 탭의 강점 제안으로 옮긴다', async ({ page }) => {
  const run = await riskRun(page.request, `협조 요청 링크 ${Date.now()}`)
  await openLoss(page, run.run_id)
  await page.getByRole('button', { name: '견적 담당에 협조 요청' }).click()
  await expect(page.getByRole('tab', { name: /^강점 제안/ })).toHaveAttribute('aria-selected', 'true')
})

// 명세 review-workspace "손실 환산 탭" (change update-loss-tab-group). 합성 데이터시트는 단가 표가 하나라
// 손실 목록 응답을 같은 조건 세 표로 늘리고, 저장 요청이 세 표 모두에 가는지 본다.
test('같은 조건 손실 환산 표 묶기', async ({ page }) => {
  const run = await lossRun(page.request, `손실 묶기 ${Date.now()}`)
  const puts: string[] = []
  await page.route(`**/api/runs/${run.run_id}/losses`, async (route) => {
    const res = await route.fetch()
    const [l] = (await res.json()) as Record<string, unknown>[]
    if (!l) return route.fulfill({ response: res })
    const at = (n: number) => ({ ...l, loss_calc_id: Number(l.loss_calc_id) * 10 + n,
      locations: (l.locations as Record<string, unknown>[]).map((x) => ({ ...x, line_start: 7000 + n, line_end: 7000 + n })) })
    await route.fulfill({ response: res, json: [at(1), at(2), at(3)] })
  })
  await page.route(`**/api/runs/${run.run_id}/losses/*`, async (route) => {
    puts.push(new URL(route.request().url()).pathname.split('/').pop()!)
    await route.fulfill({ json: { loss_calc_id: 0, total_usd: null } })
  })
  const rows = await openLoss(page, run.run_id)
  test.skip(await page.getByText('손실 환산 조항이 없어').isVisible(), '합성 데이터시트가 문서 목록(묶음 A)에 없습니다')
  await expect(page.locator('#loss table.mini')).toHaveCount(1)
  await expect(rows).toHaveCount(4)
  const head = page.locator('#loss .en').first()
  await expect(head).toContainText('같은 조건 3곳')
  await expect(head).toContainText('7001행')
  await expect(head).toContainText('7003행')
  await page.getByLabel('무부하 손실 손실값 (kW)', { exact: true }).fill('60')
  await page.getByLabel('무부하 손실 손실값 (kW)', { exact: true }).press('Enter')
  await expect.poll(() => puts.length).toBe(3)
  await page.unrouteAll({ behavior: 'ignoreErrors' })   // 저장 뒤 다시 불러오기가 끝나기 전에 닫혀도 오류로 보지 않는다
})
