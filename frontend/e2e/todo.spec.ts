import { expect, test, type Page } from '@playwright/test'
import { ENGINEER, as, riskRun } from './helpers'

// SCR-13 협조 요청 현황. 합성 사양서(tests/docx_factory.build_gis_spec)의 형식시험 줄이 품질 담당에게 간다.
const QUALITY = 4
const TYPE_TEST = /Type Test Report/

function row(page: Page, reviewNo: string) {
  return page.locator('tbody tr', { has: page.getByRole('link', { name: reviewNo, exact: true }) }).filter({ hasText: TYPE_TEST })
}

test('수신 부서별 요청 현황', async ({ page, request }) => {
  const run = await riskRun(request, `협조 요청 ${Date.now()}`)
  await page.goto('/#/todo')
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '품질 담당' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('품질 담당')
  const r = row(page, run.review_no)
  await expect(r.locator('.st').first()).toHaveText(/미발송|회신 대기/)
  await expect(r).toContainText('synthetic_154kV_GIS_spec.docx')
  await expect(page.locator('.sumline')).toContainText(/미발송\s*\d+/)
  await expect(page.locator('.sumline')).toContainText(/회신 완료\s*\d+/)
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '미분류' }).click()
  await expect(page.getByText('이 담당에게 요청 항목이 없습니다.')).toBeVisible()
})

test('24시간 넘게 미확인', async ({ page, request }) => {
  const run = await riskRun(request, `협조 요청 늦음 ${Date.now()}`)
  const old = new Date(Date.now() - 2 * 86_400_000).toISOString()
  await page.route('**/api/assignments', async (route) => {
    const res = await route.fetch()
    const rows = (await res.json()) as { run_id: number }[]
    await route.fulfill({ response: res, json: rows.map((a) => (a.run_id === run.run_id
      ? { ...a, status: 'DOING', mail_sent_at: old, mail_to: 'quality@example.com', mail_error: null } : a)) })
  })
  await page.goto('/#/todo')
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '품질 담당' }).click()
  const r = row(page, run.review_no)
  await expect(r.locator('.st')).toHaveText('24시간 넘게 회신 없음')
  await r.click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.locator('.tl2')).toContainText('재요청 필요')
  await expect(dlg.locator('.tl2')).toContainText('메일 발송')
})

// Scenario: 받는 담당자의 확인
test('보내기와 받는 담당자의 확인', async ({ page, request }) => {
  // 판정이 없는 형식시험 요청은 엔지니어가 [보내기]로 보낸다. 회신이 오면 엔지니어가 회신 요지와 함께 "회신 받음"을 표시한다
  const run = await riskRun(request, `협조 요청 확인 ${Date.now()}`)
  await as(page, ENGINEER)
  await page.goto('/#/todo')
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '품질 담당' }).click()
  const r = row(page, run.review_no)
  await expect(r.locator('.st').first()).toHaveText('미발송')
  await r.getByRole('button', { name: '보내기' }).click()
  await expect(page.getByRole('status')).toContainText('메일을 보냈습니다')
  await expect(r.locator('.st').first()).toHaveText('회신 대기')
  await r.click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.locator('.tl2')).toContainText('메일 발송')
  // add-handoff-questions: 메일에 넣은 부서 관점 확인할 점 (AI가 있으면 AI 작성, 없으면 기본 문장)
  await expect(dlg.getByTestId('ask-text')).toContainText(/AI 작성|기본 문장/)
  await dlg.getByLabel('회신 요지 (한 줄)').fill('성적서 3종 11-05까지 보냄')
  await dlg.getByRole('button', { name: '회신 완료 처리' }).click()
  await expect(page.getByRole('status')).toContainText('회신 완료로 처리했습니다')
  await expect(r).toHaveClass(/dis/)
  await expect(r.locator('.st').first()).toHaveText('회신 완료')
  await expect(dlg).toContainText('회신 요지: 성적서 3종 11-05까지 보냄')
  await expect(dlg.locator('.tl2')).toContainText('회신 완료')
})

test('발송 실패 다시 보내기와 담당자는 읽기만', async ({ page, request }) => {
  const run = await riskRun(request, `협조 요청 실패 ${Date.now()}`)
  await page.route('**/api/assignments', async (route) => {
    const res = await route.fetch()
    const rows = (await res.json()) as { run_id: number; status: string }[]
    await route.fulfill({ response: res, json: rows.map((a) => (a.run_id === run.run_id && a.status === 'TODO'
      ? { ...a, mail_error: '메일을 보내지 못했습니다: 연결 거부' } : a)) })
  })
  await as(page, ENGINEER)
  await page.goto('/#/todo')
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '품질 담당' }).click()
  const r = row(page, run.review_no)
  await expect(r).toContainText('발송 실패')
  await expect(r.getByRole('button', { name: '다시 보내기' })).toBeVisible()
  await as(page, QUALITY)
  await page.goto('/#/todo')
  await page.reload()                                                            // 같은 주소라 다시 읽어 사용자를 바꾼다
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('품질 담당')   // 담당자는 자기 부서 탭으로 열린다
  await expect(row(page, run.review_no).getByRole('button')).toHaveCount(0)
  await row(page, run.review_no).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByRole('button', { name: /보내기|회신 완료/ })).toHaveCount(0)
})

test('요청하기 예시', async ({ page }) => {
  await page.goto('/#/todo')
  const count = page.locator('.sech h2 span')
  await expect(page.locator('tbody .cond').first()).toBeVisible()
  const before = await count.textContent()
  await page.getByRole('button', { name: '요청하기' }).click()
  const dlg = page.getByRole('dialog', { name: '협조 요청하기' })
  await expect(dlg.getByText('예시 화면')).toBeVisible()
  await dlg.getByRole('button', { name: '요청 보내기' }).click()
  await expect(dlg.getByText('요구사항을 입력해 주세요.')).toBeVisible()
  await dlg.getByLabel('요구사항').fill('예시 요구사항')
  await dlg.getByLabel('요청 내용').fill('예시 요청')
  await dlg.getByRole('button', { name: '요청 보내기' }).click()
  await expect(page.getByRole('status')).toHaveText(/예시 화면이라 보내지 않았습니다/)
  await expect(dlg).toBeHidden()
  await expect(count).toHaveText(before!)
})

// 명세 requirement-extraction "사람이 유형 고치기" (change add-type-examples, C3)
test('협조 요청 상세에서 유형 고치기', async ({ page, request }) => {
  const run = await riskRun(request, `유형 고치기 ${Date.now()}`)
  // 같은 파일은 처리 결과를 다시 쓰므로(update-document-reuse) 고친 유형이 다음 검토로 이어진다. 끝에 원래 유형으로 되돌린다
  const before = (await (await request.get('/api/assignments?role=QUALITY')).json() as { run_id: number; text: string; requirement_id: number; type_code: string }[])
    .find((a) => a.run_id === run.run_id && TYPE_TEST.test(a.text))!
  await as(page, ENGINEER)
  await page.goto('/#/todo')
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '품질 담당' }).click()
  await row(page, run.review_no).click()
  const dlg = page.getByRole('dialog')
  const fix = dlg.getByTestId('type-fix')
  await fix.getByRole('button', { name: /유형 수정/ }).click()
  await fix.getByLabel('유형').selectOption('MAKER_QUAL')
  await fix.getByLabel('고친 사유').fill('제조사 자격 서류 요구')
  await fix.getByRole('button', { name: '유형 저장' }).click()
  await expect(fix.getByRole('status')).toContainText('유형을 제조사 자격(으)로 고쳤습니다')
  const log = await (await request.get(`/api/runs/${run.run_id}/history`)).json() as { target_table: string; after_value: { type_code?: string } | null }[]
  expect(log.some((h) => h.target_table === 'requirement' && h.after_value?.type_code === 'MAKER_QUAL')).toBe(true)
  const back = await request.post(`/api/runs/${run.run_id}/requirements/${before.requirement_id}/type`,
    { data: { type_code: before.type_code, reason: 'e2e 되돌림', actor_id: ENGINEER } })
  expect(back.ok()).toBe(true)
})

// 명세 role-assignment "보내는 동안 진행 표시" (change update-send-progress)
test('보내는 동안 진행 표시', async ({ page, request }) => {
  const run = await riskRun(request, `보내기 진행 ${Date.now()}`)
  await as(page, ENGINEER)
  // 서버 응답을 늦춰 보내는 동안의 모양을 본다 (응답은 실제 서버 것)
  await page.route('**/assignments/send', async (route) => {
    await new Promise((ok) => setTimeout(ok, 1500))
    await route.fulfill({ response: await route.fetch() })
  })
  await page.goto('/#/todo')
  await page.getByRole('navigation', { name: '수신 부서' }).getByRole('button', { name: '품질 담당' }).click()
  // 요청이 많이 쌓인 DB에서도 이 검토 줄이 첫 쪽에 오게 검토로 거른다
  const find = page.getByRole('search', { name: '협조 요청 찾기' })
  await find.getByLabel('RFP 검토').selectOption(String(run.run_id))
  await find.getByRole('button', { name: '검색' }).click()
  const r = row(page, run.review_no)
  await r.getByRole('button', { name: '보내기' }).click()
  const busy = r.getByRole('button', { name: '보내는 중…' })
  await expect(busy).toBeVisible()
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  await expect(busy.getByTestId('spinner')).toBeVisible()
  await expect(busy).toBeDisabled()                        // 보내는 동안 다시 누를 수 없음 (다른 줄 단추도 같은 값으로 잠김)
  await expect(page.getByRole('status')).toContainText('메일을 보냈습니다')
  await expect(r.getByTestId('spinner')).toHaveCount(0)
})
