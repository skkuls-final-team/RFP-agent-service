import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { as, ENGINEER } from './helpers'

// SCR-16 제품표, SCR-17 판정 규칙 (add-reference-views). 판정 규칙 고치기는 add-rule-editing.
type Product = { product_code: string; family: string; used: number }

test('제품 상세', async ({ page, request }) => {
  // v4.96: 줄을 누르면 빠른 보기, [상세 화면]으로 제품 상세 화면 (change add-product-view)
  const list = (await (await request.get('/api/products?family=GIS&limit=100')).json()) as Product[]
  const p = list[0]
  const detail = await (await request.get(`/api/products/${p.product_code}`)).json() as { used_runs: number }
  await page.goto('/#/products')
  await page.getByRole('button', { name: /^GIS/ }).click()
  await page.locator('tbody tr', { hasText: p.product_code }).first().locator('td').nth(3).click()
  const panel = page.getByRole('complementary', { name: '제품 빠른 보기' })
  await expect(panel.getByRole('heading', { name: p.product_code })).toBeVisible()
  await expect(panel.locator('.qv-t')).toContainText('정격 전압')
  await expect(panel.locator('h4', { hasText: '지금 쓰이는 검토' })).toContainText(String(detail.used_runs))
  await panel.getByRole('link', { name: '상세 화면' }).click()
  await expect(page).toHaveURL(new RegExp(`#/products/${p.product_code}$`))
  await expect(page.getByRole('tab', { name: '정격' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.pinfo')).toContainText('정격 전압')
})

// Scenario: 제품표 내보내기
test('제품표 엑셀 내보내기', async ({ page }) => {
  // 명세 review-workspace "제품표 화면"의 Scenario "제품표 내보내기" (change add-product-export)
  await page.goto('/#/products')
  await page.getByRole('button', { name: /^GIS/ }).click()
  const wait = page.waitForEvent('download')
  await page.getByRole('button', { name: '내보내기' }).click()
  const file = await wait
  // 헤드리스 Chromium은 한글 파일 이름을 "download"로 줄 때가 있어 이름은 알림으로 확인한다
  expect(readFileSync(await file.path()).subarray(0, 2).toString()).toBe('PK')
  await expect(page.getByRole('status')).toHaveText('제품표_GIS.xlsx 를 내려받았습니다.')
})

test('제품 상세에 계열 사진', async ({ page }) => {
  // 명세 review-workspace "제품표 상세의 제품 사진" (change add-product-photos)
  const list = (await (await page.request.get('/api/products?family=GIS&limit=100')).json()) as Product[]
  await page.goto(`/#/products/${list[0].product_code}`)
  const photo = page.getByRole('figure', { name: '제품 사진' })
  await expect(photo.getByRole('img', { name: 'GIS 대표 사진' })).toBeVisible()
  await expect(photo).toContainText('이 모델만의 사진은 아님')
  await expect(photo.getByRole('link', { name: 'LS ELECTRIC 공식 사이트' })).toHaveAttribute('href', /ls-electric\.com/)
  expect(await photo.getByRole('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
})

test('제품 상세 문서 탭', async ({ page }) => {
  // 명세 review-workspace "제품표 상세의 관련 문서" (change add-product-docs)
  await page.goto('/#/products/GIS-145-40')
  const panel = page.locator('.pml')
  const catalog = panel.getByLabel('카탈로그', { exact: true })
  await expect(catalog).toContainText('[GIS] Total Solution')
  await expect(catalog).toContainText('제품표 값의 출처')
  await expect(catalog.getByRole('link').first()).toHaveAttribute('href', /^https:\/\/www\.ls-electric\.com\/ko\/cat\//)
  const tests = panel.getByLabel('시험 성적서', { exact: true })
  await expect(tests).toContainText('GIS_TypeTest')
  await tests.getByRole('button', { name: /더 보기/ }).click()
  expect(await tests.getByRole('link').count()).toBeGreaterThan(5)
})

test('공식 자료실에 없는 문서 종류', async ({ page }) => {
  // 명세 review-workspace "제품표 상세의 관련 문서": GSH-20V는 시험 성적서가 공식 자료실에 없다
  await page.goto('/#/products/SWGR-GSH20V-24')
  const panel = page.locator('.pml')
  await expect(panel.getByLabel('카탈로그', { exact: true })).toContainText('[GSH-20V]_국문')
  await expect(panel.getByLabel('시험 성적서', { exact: true })).toContainText('공식 자료실에 없음')
})

test('사진이 없는 카탈로그', async ({ page }) => {
  // 명세 review-workspace "제품표 상세의 제품 사진". 실제 제품표는 7개 카탈로그 모두 사진이 있어 응답을 바꿔 확인한다.
  await page.route(/\/api\/products\/(?!families)[^/?]+$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({ response: res, json: { ...body, source_doc: 'CAT-C99999-01 p.1' } })
  })
  await page.goto('/#/products/GIS-145-40')
  await expect(page.getByLabel('제품 사진')).toHaveText('공식 사진 없음')
})

test('두 제품 비교', async ({ page, request }) => {
  const list = (await (await request.get('/api/products?family=GIS&limit=100')).json()) as Product[]
  const [a, b] = list
  await page.goto('/#/products')
  await page.getByRole('button', { name: /^GIS/ }).click()
  await page.getByLabel(`${a.product_code} 비교에 넣기`).check()
  await page.getByLabel(`${b.product_code} 비교에 넣기`).check()
  await page.getByRole('button', { name: /선택한 2개 비교/ }).click()
  await expect(page.getByRole('heading', { name: /제품 비교/ })).toContainText(`${a.product_code} · ${b.product_code}`)
  const table = page.locator('table.tbl')
  await expect(table.locator('thead')).toContainText(a.product_code)
  await expect(table.locator('thead')).toContainText(b.product_code)
  await expect(table).toContainText('정격 전압')
})

test('규칙 검색', async ({ page }) => {
  await page.goto('/#/rules')
  const tabs = page.getByRole('tablist', { name: '규칙 종류' })
  await expect(tabs.getByRole('tab', { name: /비교 방향\s*39/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('규칙 검색').fill('정격 전류')
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toContainText('정격 전류')
  for (const t of await rows.allInnerTexts()) expect(t).toContain('정격 전류')
  await rows.first().click()
  await expect(page.locator('tr.rx')).toContainText('rated_current')
  await page.getByLabel('규칙 검색').fill('없는 규칙 이름')
  await expect(page.getByText('조건에 맞는 규칙이 없습니다.')).toBeVisible()
  await page.getByRole('button', { name: '검색 지우기' }).click()
  await tabs.getByRole('tab', { name: /위험 표현/ }).click()
  await page.getByLabel('규칙 검색').fill('including')
  await expect(page.locator('tbody tr').first()).toContainText('including but not limited to')
})

test('문서 종류 규칙 탭', async ({ page }) => {
  // 명세 review-workspace "판정 규칙 화면" (change update-doc-kind-rules)
  await page.goto('/#/rules')
  const tabs = page.getByRole('tablist', { name: '규칙 종류' })
  await tabs.getByRole('tab', { name: /문서 종류\s*7/ }).click()     // 물량표(BOQ)·합성 RFP 줄 포함 (add-boq-processor, add-synthetic-risk-rfp)
  await expect(page.locator('thead')).toContainText('파일 이름에서 찾는 표현')
  await page.getByLabel('규칙 검색').fill('bidding')
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('입찰 양식')
  await expect(rows.first()).toContainText('bidding forms')
  await expect(rows.first()).toContainText('파일 이름만 봄')
  await expect(rows.first().locator('td').nth(3)).toHaveText('1')
  await expect(rows.first().locator('td').nth(4)).toHaveText(/^\d+개$/)
})

// 명세 review-workspace "판정 규칙 화면" (change add-rule-editing). 고친 규칙은 끝에 되돌린다 (고침 이력은 남는다).
type Edit = { edit_id: number; action: string }
const PHRASE = `to the satisfaction of the Engineer e2e ${Date.now()}`

async function riskTab(page: import('@playwright/test').Page) {
  await page.goto('/#/rules')
  await page.getByRole('tablist', { name: '규칙 종류' }).getByRole('tab', { name: /위험 표현/ }).click()
}

test('화면에서 규칙 추가', async ({ page }) => {
  await as(page, ENGINEER)
  await riskTab(page)
  await page.getByRole('button', { name: '규칙 추가' }).click()
  const dlg = page.getByRole('dialog', { name: '규칙 추가' })
  await dlg.getByLabel(/표현 \(원문\)/).fill(PHRASE)
  await dlg.getByLabel('위험 종류').selectOption('OPEN_SCOPE')
  await dlg.getByLabel('위험으로 보는 조건').fill('공급 범위 조항 안에 있을 때')
  await expect(dlg.getByRole('button', { name: '저장' })).toBeDisabled()        // 사유 필수
  await dlg.getByLabel('추가 사유').fill('현업 멘토 사례')
  await dlg.getByRole('button', { name: '저장' }).click()
  await expect(dlg).toBeHidden()
  await page.getByLabel('규칙 검색').fill(PHRASE)
  await expect(page.locator('tbody tr').first()).toContainText('범위 모호')
  await expect(page.locator('.rhead')).toContainText(/마지막 수정 기본 엔지니어 · .+ · 추가/)
})

test('화면에서 규칙 삭제', async ({ page }) => {
  await as(page, ENGINEER)
  await riskTab(page)
  await page.getByLabel('규칙 검색').fill(PHRASE)
  const row = page.locator('tbody tr').first()
  await expect(row).toContainText(PHRASE)
  await row.click()
  await page.locator('tr.rx').getByRole('button', { name: '삭제' }).click()
  const dlg = page.getByRole('dialog', { name: '규칙 삭제' })
  await expect(dlg).toContainText(PHRASE)
  await dlg.getByLabel('삭제 사유').fill('e2e 정리')
  await dlg.getByRole('button', { name: '삭제' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByText('조건에 맞는 규칙이 없습니다.')).toBeVisible()
})

test('화면에서 규칙 수정과 이력', async ({ page, request }) => {
  await as(page, ENGINEER)
  await page.goto('/#/rules')
  await page.getByRole('tablist', { name: '규칙 종류' }).getByRole('tab', { name: /문서 종류/ }).click()
  await page.getByLabel('규칙 검색').fill('시험 사양서')
  const row = page.locator('tbody tr').first()
  const before = (await row.locator('td').nth(1).innerText()).trim()
  const after = `${before}|test spec`
  const edit = async (from: string, to: string, reason: string) => {
    if (!(await page.locator('tr.rx').count())) await page.locator('tbody tr').first().click()   // 펼친 줄은 저장 뒤에도 펼쳐져 있다
    await page.locator('tr.rx').getByRole('button', { name: '수정' }).click()
    const dlg = page.getByRole('dialog', { name: '규칙 수정' })
    await expect(dlg.getByLabel(/파일 이름에서 찾는 표현/)).toHaveValue(from)
    await dlg.getByLabel(/파일 이름에서 찾는 표현/).fill(to)
    await dlg.getByLabel('수정 사유').fill(reason)
    await dlg.getByRole('button', { name: '저장' }).click()
    await expect(dlg).toBeHidden()
  }
  await edit(before, after, '고객사 파일 이름')
  await expect(page.locator('tbody tr').first().locator('td').nth(1)).toHaveText(after)
  const history = page.locator('tr.rx .rhist li').first()
  await expect(history).toContainText('수정 고객사 파일 이름')
  await expect(history).toContainText('기본 엔지니어')
  await expect(history).toContainText(`파일 이름 표현: ${before} → ${after}`)
  await edit(after, before, 'e2e 되돌림')
  const edits = (await (await request.get('/api/rules/edits?dictionary=doc-kinds')).json()) as Edit[]
  expect(edits.slice(0, 2).map((e) => e.action)).toEqual(['EDIT', 'EDIT'])
})

test('고칠 수 없는 역할', async ({ page, request }) => {
  const users = (await (await request.get('/api/users')).json()) as { user_id: number; role: string }[]
  await as(page, users.find((u) => u.role === 'COST')!.user_id)
  await riskTab(page)
  await expect(page.getByRole('button', { name: '규칙 추가' })).toBeDisabled()
  await expect(page.getByText('엔지니어·승인자만 고칠 수 있습니다').first()).toBeVisible()
  await page.locator('tbody tr').first().click()
  await expect(page.locator('tr.rx').getByRole('button', { name: '수정' })).toBeDisabled()
  await expect(page.locator('tr.rx').getByRole('button', { name: '삭제' })).toBeDisabled()
})

// 명세 review-workspace "판정 규칙 표 쪽 높이 유지" (change update-rule-page-height)
test('마지막 쪽도 표 높이 유지', async ({ page }) => {
  await page.goto('/#/rules')
  const tabs = page.getByRole('tablist', { name: '규칙 종류' })
  await tabs.getByRole('tab', { name: /비교 방향/ }).click()          // 39줄 → 10줄씩 4쪽, 마지막 쪽 9줄
  const table = page.getByTestId('rule-table')
  const pager = page.locator('.pager')
  await expect(page.locator('tbody tr')).toHaveCount(10)
  const h1 = (await table.boundingBox())!.height
  const top = () => pager.evaluate((e) => e.getBoundingClientRect().top + window.scrollY)   // 문서 기준 (스크롤과 상관없이)
  const y1 = await top()
  const pages = page.getByRole('navigation', { name: '페이지' })
  await pages.getByRole('button', { name: '다음 페이지' }).click()
  await pages.getByRole('button', { name: '다음 페이지' }).click()
  await pages.getByRole('button', { name: '다음 페이지' }).click()
  await expect(page.locator('tbody tr')).not.toHaveCount(10)
  expect(Math.abs((await table.boundingBox())!.height - h1)).toBeLessThan(2)
  expect(Math.abs((await top()) - y1)).toBeLessThan(2)
  await tabs.getByRole('tab', { name: /문서 종류/ }).click()          // 7줄 한 쪽 → 줄 수만큼
  await expect(page.locator('tbody tr')).toHaveCount(7)
  expect((await table.boundingBox())!.height).toBeLessThan(h1)
})

// 명세 review-workspace "판정 규칙 빈 안내 한 줄" (change update-rule-empty-text)
test('빈 안내는 한 줄로', async ({ page }) => {
  await page.route('**/api/item-candidates', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/rule-suggestions', (route) => route.fulfill({ json: [] }))
  await page.goto('/#/rules')
  await page.getByRole('tablist', { name: '규칙 종류' }).getByRole('tab', { name: /항목 이름/ }).click()
  for (const text of ['연결 후보가 없습니다.', '제안한 표현이 없습니다.']) {
    const line = page.getByText(text, { exact: false })
    await expect(line).toBeVisible()
    const box = (await line.boundingBox())!
    expect(box.width).toBeGreaterThan(200)                 // 첫 칸(54px)에 갇히지 않음
    expect(box.height).toBeLessThan(40)                    // 낱말마다 줄이 바뀌지 않음
  }
})
