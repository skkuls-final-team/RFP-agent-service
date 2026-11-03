import { expect, test } from '@playwright/test'
import { ENGINEER, as, riskRun } from './helpers'

// 명세 review-workspace "뜻 찾기 표시"의 Scenario (change add-meaning-search).
// 뜻 찾기 후보는 문장 벡터(언어 모델)가 있어야 생겨서, 응답을 넣어 화면만 본다. 후보 계산은 백엔드 tests/test_meaning_search.py.

const LOC = { file_no: 91, section_no: null, section_title: null, table_name: 'TS-230-GIS', item_no: '4', line_start: 12, line_end: 12 }

test('사전 추가 후보 보기', async ({ page }) => {
  const run = await riskRun(page.request, `뜻 찾기 ${Date.now()}`)
  const sentence = 'Any item not listed shall be considered as fully complied with by the Vendor.'
  await page.route(`**/api/runs/${run.run_id}/meaning-candidates`, (route) => route.fulfill({ json: { status: 'DONE', items: [{
    candidate_id: 5, run_id: run.run_id, review_no: run.review_no, kind: 'RISK_SENTENCE', requirement_id: 1, text_raw: sentence,
    near_text: 'Any item not listed shall be deemed to be accepted by the Vendor.', target: 'BLANKET', score: 0.793,
    second_target: null, second_score: null, status: 'OPEN', locations: [LOC],
  }] } }))
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${run.run_id}`)
  await page.getByRole('tab', { name: '위험 조건' }).click()
  const cand = page.getByTestId('meaning-candidate')
  await expect(page.getByTestId('meaning-head')).toContainText('사전 추가 후보 1')
  await expect(cand).toContainText(sentence)
  await expect(cand).toContainText('유사도 0.79')
  await expect(cand).toContainText('deemed to be accepted')
  await cand.getByRole('button', { name: '사전 추가 제안' }).click()
  await expect(page.getByLabel('놓친 위험 표현')).toHaveValue(sentence)
  await expect(page.getByLabel('제안 메모')).toHaveValue('유사 문장 (유사도 0.79)')
})

// 명세 review-workspace "사전 추가 후보에서 제안 칸으로" (change update-suggest-fill-focus)
test('사전 추가 제안 칸으로 옮김', async ({ page }) => {
  const run = await riskRun(page.request, `제안 칸 ${Date.now()}`)
  // 긴 후보 20개로 제안 칸을 화면 밖으로 민다
  const long = (i: number) => `Candidate sentence ${i}: the Contractor shall provide all items necessary for complete operation of the plant, ` + 'including accessories and works not specifically mentioned herein. '.repeat(3)
  await page.route(`**/api/runs/${run.run_id}/meaning-candidates`, (route) => route.fulfill({ json: { status: 'DONE', items: Array.from({ length: 20 }, (_, i) => ({
    candidate_id: 100 + i, run_id: run.run_id, review_no: run.review_no, kind: 'RISK_SENTENCE', requirement_id: 1, text_raw: long(i),
    near_text: 'Any item not listed shall be deemed to be accepted by the Vendor.', target: 'BLANKET', score: 0.8,
    second_target: null, second_score: null, status: 'OPEN', locations: [LOC],
  })) } }))
  await page.setViewportSize({ width: 1280, height: 800 })
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${run.run_id}`)
  await page.getByRole('tab', { name: '위험 조건' }).click()
  const field = page.getByLabel('놓친 위험 표현')
  await expect(field).not.toBeInViewport()
  const before = await page.getByTestId('suggestion').count()
  await page.getByTestId('meaning-candidate').first().getByRole('button', { name: '사전 추가 제안' }).click()
  await expect(field).toBeInViewport()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(long(0).slice(0, 101).replace(/\s\S*$/, '').replace(/[,;:]+$/, ''))
  await expect(page.locator('.uisnk')).toContainText('제안 칸에 문장을 채웠습니다')
  await expect(page.getByTestId('suggestion')).toHaveCount(before)            // 바로 보내지 않는다
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

// 명세 review-workspace "사전 추가 후보에서 제안 칸으로" (change update-suggestion-list-layout)
test('긴 문장은 낱말 경계에서 자름', async ({ page }) => {
  const run = await riskRun(page.request, `낱말 경계 ${Date.now()}`)
  // 100자 자리가 낱말 "installation" 가운데에 오는 문장
  const sentence = '3) The Contractor shall supply all cables, piping, anchor bolts, nuts and embedded materials for installation of each equipment.'
  await page.route(`**/api/runs/${run.run_id}/meaning-candidates`, (route) => route.fulfill({ json: { status: 'DONE', items: [{
    candidate_id: 7, run_id: run.run_id, review_no: run.review_no, kind: 'RISK_SENTENCE', requirement_id: 1, text_raw: sentence,
    near_text: 'Any item not listed shall be deemed to be accepted by the Vendor.', target: 'BLANKET', score: 0.8,
    second_target: null, second_score: null, status: 'OPEN', locations: [LOC],
  }] } }))
  await as(page, ENGINEER)
  await page.goto(`/#/reviews/${run.run_id}`)
  await page.getByRole('tab', { name: '위험 조건' }).click()
  await page.getByTestId('meaning-candidate').getByRole('button', { name: '사전 추가 제안' }).click()
  const field = page.getByLabel('놓친 위험 표현')
  await expect(field).toHaveValue('3) The Contractor shall supply all cables, piping, anchor bolts, nuts and embedded materials for')
  const v = await field.inputValue()
  expect(v.length).toBeLessThanOrEqual(100)
  expect(sentence.startsWith(v + ' ')).toBe(true)                          // 낱말 중간에서 끊기지 않음
  await expect(page.locator('.uisnk')).toContainText('100자가 넘어 낱말 경계에서 줄였습니다')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('항목 연결 후보 받아들이기', async ({ page }) => {
  let accepted = false
  const cand = { candidate_id: 9, run_id: 3, review_no: 'RV-2026-003', kind: 'ITEM_LINK', requirement_id: 2, text_raw: 'Busbar ampacity',
    near_text: 'Rated normal current', target: 'rated_current', score: 0.912, second_target: 'rated_frequency', second_score: 0.71,
    status: 'OPEN', locations: [LOC] }
  await page.route('**/api/item-candidates', (route) => route.fulfill({ json: accepted ? [] : [cand] }))
  await page.route('**/api/item-candidates/9/accept', (route) => {
    accepted = true
    return route.fulfill({ json: { edit_id: 1, dictionary: 'items', row_key: { item_key: 'rated_current' }, action: 'EDIT', before_value: {}, after_value: {},
      reason: '뜻으로 찾은 연결 후보', actor_id: 1, actor_name: '엔지니어', edited_at: '2026-11-01T03:00:00Z', discarded_at: null, after_key: { item_key: 'rated_current' } } })
  })
  await as(page, ENGINEER)
  await page.goto('/#/rules')
  await page.getByRole('tab', { name: /항목 이름/ }).click()
  const row = page.getByTestId('item-link')
  await expect(row).toContainText('Busbar ampacity')
  await expect(row).toContainText('rated_current')
  await row.getByRole('button', { name: '동의어로 추가' }).click()
  await expect(page.getByRole('status')).toContainText('rated_current의 동의어로 추가했습니다')
  await expect(page.getByTestId('item-link')).toHaveCount(0)
})
