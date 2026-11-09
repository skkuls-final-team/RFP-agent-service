import { expect, test, type Page, type Route } from '@playwright/test'
import { as, deviationRun, ENGINEER, openTab } from './helpers'

// 명세 review-workspace "입찰 영향 탭"·"머리글 비교 제품 고르기"의 Scenario (change update-review-screens).
// 언어 모델 키와 강점 여유가 있는 제품값이 없으면 로컬에서 제안 포인트가 생기지 않아, 포인트 목록과
// 후보가 둘인 설비 묶음은 응답을 바꿔 끼운다. 채택·버림·제품 바꾸기 요청 내용은 그대로 확인한다.

const POINT = {
  point_id: 9001, point_kind: 'MARGIN', requirement_id: 1, product_code: 'GIS-145-40',
  text_draft: '정격 단시간 견딤 전류 요구 40 kA(1초)에 대해 GIS-145-40은 40 kA 3 s를 견뎌 시간 기준 3배 여유가 있습니다.',
  basis: '요구 40 kA (1초) · 제품 GIS-145-40 40 kA 3 s · 여유 시간 3배', number_check: 'OK', number_detail: null,
  drafted_by: 'CODE', is_assumed: false, status: 'CANDIDATE', locations: [],
}

async function fakePoints(page: Page, actions: unknown[], kind = 'MARGIN') {
  let status = 'CANDIDATE'
  await page.route(/\/api\/runs\/\d+\/proposals$/, (r: Route) => r.fulfill({ json: [{ ...POINT, point_kind: kind, status }] }))
  await page.route(/\/api\/runs\/\d+\/actions$/, (r: Route) => {
    const body = r.request().postDataJSON()
    actions.push(body)
    if (body.target === 'proposal_point') status = body.action === 'ADOPT' ? 'ADOPTED' : 'DISCARDED'
    return r.fulfill({ json: { before: {}, after: {} } })
  })
}

async function openBid(page: Page, name: string) {
  const run = await deviationRun(page.request, `${name} ${Date.now()}`)
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${run.run_id}`)
  await openTab(page, '강점 제안')
  return run
}

test('제안 포인트 채택', async ({ page }) => {
  const actions: { target: string; target_id: number; action: string }[] = []
  await fakePoints(page, actions)
  await openBid(page, '채택')
  const point = page.locator('#bid .li', { hasText: '여유 시간 3배' })
  await expect(point.locator('.st')).toHaveText('후보')
  await point.getByRole('button', { name: '채택' }).click()
  await expect(point.locator('.st')).toHaveText('채택')
  expect(actions).toContainEqual(expect.objectContaining({ target: 'proposal_point', target_id: 9001, action: 'ADOPT', actor_id: ENGINEER }))
})

test('사유 없이 버리기', async ({ page }) => {
  const actions: { reason?: string }[] = []
  await fakePoints(page, actions)
  await openBid(page, '버림')
  const point = page.locator('#bid .li', { hasText: '여유 시간 3배' })
  await point.getByRole('button', { name: '제외' }).click()
  await expect(point.getByRole('button', { name: '제외하기' })).toBeDisabled()
  await point.getByLabel('제외 사유').fill('이번 입찰에서는 내세우지 않음')
  await point.getByRole('button', { name: '제외하기' }).click()
  await expect(point.locator('.st')).toHaveText('제외')
  expect(actions).toContainEqual(expect.objectContaining({ action: 'DISCARD', reason: '이번 입찰에서는 내세우지 않음' }))
})

test('보완이 필요한 점 목록', async ({ page }) => {
  const run = await openBid(page, '불리한 점')
  const cons = page.locator('#bid-cons')
  await cons.locator('summary').click()
  await expect(cons.locator('.li', { hasText: '미달' })).toHaveCount(run.deviations)
  await expect(cons.locator('.li', { hasText: '미달' }).first()).toContainText('대응: 일탈 목록에 올리고')
  await expect(cons.locator('.li', { hasText: '값 불명확' }).first()).toContainText('대응: 서면 질의로')
})

test('비교 제품 보기', async ({ page }) => {
  await openBid(page, '비교 제품')
  const seg = page.getByRole('group', { name: 'TS-115-GIS 비교 제품' })
  await expect(page.locator('details.pseg')).toContainText('TS-115-GIS')
  await expect(seg.locator('button[aria-pressed="true"]')).toHaveCount(1)
})

test('비교 제품 바꾸기', async ({ page }) => {
  let chosen: string | null = null
  const puts: unknown[] = []
  await page.route(/\/api\/runs\/\d+\/equipment$/, (r: Route) => r.fulfill({ json: [{
    equipment_group: 'T7|', label: '파일 91 TS-115-GIS', family: 'GIS', products: ['GIS-145-40'], selected_by: chosen ? 'ENGINEER' : 'AUTO',
    chosen_product: chosen, candidates: ['GIS-145-40', 'GIS-145-40-P7'], judgments: 11, deviations: 0, ambiguous: 0,
  }] }))
  await page.route(/\/api\/runs\/\d+\/equipment\/.+\/product$/, (r: Route) => {
    const body = r.request().postDataJSON()
    puts.push({ url: decodeURIComponent(r.request().url()), body })
    chosen = body.product_code
    return r.fulfill({ json: { judgments: 11 } })
  })
  await openBid(page, '제품 바꾸기')
  const seg = page.getByRole('group', { name: 'TS-115-GIS 비교 제품' })
  await expect(seg.getByRole('button', { name: 'GIS-145-40', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await seg.getByRole('button', { name: 'GIS-145-40-P7' }).click()
  await expect(seg.getByRole('button', { name: 'GIS-145-40-P7' })).toHaveAttribute('aria-pressed', 'true')
  expect(puts).toEqual([expect.objectContaining({ url: expect.stringContaining('/equipment/T7|/product'), body: { product_code: 'GIS-145-40-P7' } })])
  await expect(page.getByRole('tab', { name: /^강점 제안/ })).toHaveAttribute('aria-selected', 'true')
})

// change update-proposal-actions: 채택·버림 단추와 알림
test('채택 알림', async ({ page }) => {
  await fakePoints(page, [], 'LOSS')
  await openBid(page, '채택 알림')
  const point = page.locator('#bid .li', { hasText: '여유 시간 3배' })
  await point.getByRole('button', { name: '채택' }).click()
  await expect(point.getByRole('status')).toContainText('채택했습니다. 영업·견적 담당에게 협조 요청으로 전달합니다.')
  await expect(point).toHaveClass(/pt-adopted/)
  await expect(point.getByRole('button', { name: '채택함' })).toBeDisabled()
})

test('버림 알림', async ({ page }) => {
  await fakePoints(page, [])
  await openBid(page, '버림 알림')
  const point = page.locator('#bid .li', { hasText: '여유 시간 3배' })
  await point.getByRole('button', { name: '제외' }).click()
  await point.getByLabel('제외 사유').fill('이번 입찰에서는 내세우지 않음')
  await point.getByRole('button', { name: '제외하기' }).click()
  await expect(point.getByRole('status')).toContainText('제외했습니다. 사유: 이번 입찰에서는 내세우지 않음')
  await expect(point).toHaveClass(/pt-dropped/)
})
