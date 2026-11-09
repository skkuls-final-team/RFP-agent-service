import { expect, test } from '@playwright/test'
import { ENGINEER, as, backFromJudgment, openTab } from './helpers'

// 파일 1(입찰 양식)을 검토 등록 화면에서 올려 처리 → 판정 탭 → 손실 환산 탭까지 지금 화면으로 확인한다.
// 명세 review-workspace의 Scenario: 처리 중, 적합성 표의 비교 제품, 손실 환산 결과.
// 결재 상신·승인 화면은 approval-flow.spec.ts가 합성 데이터시트로 확인한다.
// 파일 1만 올리면 같은 사업의 다른 문서가 없어 비교 제품을 못 고르는 줄이 있다(손실 환산 포함).
// 그래서 판정 줄은 API에서 고르고, 손실 환산은 엔지니어가 손실값을 넣는 흐름으로 본다.
const FILE_1 = '1. Bidding Forms_Draft'

type Judgment = {
  item_name_raw: string | null; product_code: string | null
  margin_value: string | null; margin_direction: string | null
}

test('파일 1을 올려 판정·손실 환산까지', async ({ page }) => {
  test.setTimeout(600_000)
  await as(page, ENGINEER)
  await page.goto('/#/register')
  const more = page.getByRole('button', { name: '서버에 둔 RFP에서 고르기' })
  await more.waitFor({ timeout: 10_000 }).catch(() => undefined)
  test.skip(!(await more.isVisible()), '서버에 둔 RFP 원문이 없음')
  await more.click()
  const library = page.getByRole('table', { name: '서버에 둔 RFP' })
  const file = (await library.locator('td:nth-child(2)').allTextContents()).find((f) => f.includes(FILE_1))
  test.skip(!file, '서버에 파일 1 원문이 없음')
  await library.getByRole('checkbox', { name: file! }).check()
  await page.getByRole('button', { name: /다음/ }).click()
  await page.getByLabel('제출 마감일').fill('2026-12-31')
  await page.getByRole('button', { name: /다음/ }).click()
  await page.getByRole('button', { name: /등록하고 분석 시작/ }).click()
  const reviewNo = (await page.getByRole('status').filter({ hasText: /RV-\d{4}-\d{3}/ }).textContent())!.match(/RV-\d{4}-\d{3}/)![0]
  await page.goto('/#/reviews')
  await page.getByRole('button', { name: '팀 전체' }).click()
  await page.locator('tr', { hasText: reviewNo }).getByRole('link').first().click()
  const runId = Number(page.url().match(/reviews\/(\d+)/)![1])

  // Scenario: 처리 중 — 실행이 시작되고 현재 단계가 보인다 (같은 파일을 처리한 적이 있으면 바로 판정 탭이 보인다)
  const bar = page.getByRole('progressbar', { name: 'RFP 분석' })
  const judgeTab = page.getByRole('tab', { name: '판정' })
  await expect(bar.or(judgeTab)).toBeVisible()
  if (await bar.isVisible()) await expect(page.locator('.ldtx').first()).not.toBeEmpty()
  await expect(judgeTab).toBeVisible({ timeout: 480_000 })

  // Scenario: 적합성 표의 비교 제품 — 각 판정의 비교 제품, 제품값, 여유, 비교 제품 바꿔 보기
  const judgments = async (result: string) => (await (await page.request.get(
    `/api/runs/${runId}/judgments?result=${result}&limit=500`)).json()) as Judgment[]
  const rows = page.locator('#judge .tw tbody tr')
  const search = page.getByLabel('판정 검색')

  const deviation = (await judgments('DEVIATION_CANDIDATE')).find((j) => j.product_code && j.item_name_raw)
  expect(deviation, '비교 제품이 있는 일탈 후보').toBeTruthy()
  await page.locator('.fbar .chip', { hasText: '일탈 후보' }).click()
  await search.fill(deviation!.item_name_raw!)
  await expect(rows.filter({ hasText: deviation!.product_code! }).first()).toContainText('일탈 후보')

  const margin = (await judgments('COMPLY')).find((j) => j.product_code && j.item_name_raw
    && j.margin_direction !== 'NOT_CALC' && Number(j.margin_value) > 0)
  expect(margin, '여유가 있는 준수 판정').toBeTruthy()
  await page.locator('.fbar .chip', { hasText: '준수' }).click()
  await search.fill(margin!.item_name_raw!)
  const row = rows.filter({ hasText: margin!.product_code! }).filter({ hasText: '여유' }).first()
  await expect(row).toContainText('준수')
  await row.click()                                                       // 판정 상세 화면 (SCR-08-12, add-judgment-view)
  await expect(page.locator('.jv .basis')).toContainText(`${margin!.product_code} · 제품표`)
  await backFromJudgment(page)

  // 설비 묶음이 4개보다 많으면 요약 줄만 보이므로 펼친다
  const box = page.locator('details.pseg')
  await expect(box).toContainText('GIS-145-40')
  await box.locator('summary').click()
  const seg = box.getByRole('group', { name: /TS-115-GIS.*비교 제품/ }).first()
  await expect(seg.locator('button[aria-pressed="true"]')).toHaveText('GIS-145-40')  // 지금 비교 제품, 누르면 바꿔 본다

  // Scenario: 손실 환산 결과 — 계산식(단가 × 손실값), 합계, 팀 가정
  await openTab(page, '강점 제안')                                  // 손실 환산은 강점 제안 탭 안
  const table = page.locator('#loss table.mini').first()
  const loss = table.locator('tbody tr')
  await expect(loss.nth(0)).toContainText('4,500 $/kW ×')
  await table.getByLabel('무부하 손실 손실값 (kW)', { exact: true }).fill('60')
  await table.getByLabel('부하 손실 손실값 (kW)', { exact: true }).fill('300')
  await table.getByLabel('보조 손실 손실값 (kW)', { exact: true }).fill('8')
  await table.getByLabel('보조 손실 손실값 (kW)', { exact: true }).press('Enter')
  await expect(loss.nth(0)).toContainText('$270,000')
  await expect(loss.last()).toContainText('$1,240,400')
  await expect(page.locator('#loss')).toContainText('팀 가정')
})
