import { readFileSync } from 'node:fs'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// e2e 공용: 합성 데이터시트(e2e/fixtures/synthetic_judgment.docx, 백엔드 tests/docx_factory.py로 만듦, 고객 원문 아님)로
// 실행을 만들고, 판정 하나를 일탈 후보로 고쳐 AR-01이 걸리게 한다.
// 제품표에 따라 처음부터 일탈인 판정이 있을 수 있어, 일탈 후보 수는 고정하지 않고 고친 뒤의 수(deviations)를 돌려준다.
// 판정하려면 문서 목록에 묶음 A로 있어야 한다. 로컬 DB에 한 번 넣는다:
//   INSERT INTO document_catalog (file_no, file_key, bundle, language) VALUES (91, 'synthetic_judgment', 'A', 'en');
const DOCX = new URL('./fixtures/synthetic_judgment.docx', import.meta.url)
export const ENGINEER = 1

/** 검토를 만들 때 꼭 보내는 제출 마감일: 오늘부터 days일 뒤 (update-due-required) */
export function dueIn(days = 14): string {
  const d = new Date(Date.now() + days * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const APPROVER = 2
export const COMMENT = '질의 1건은 10-27 회신 예정'

export async function deviationRun(request: APIRequestContext, name: string) {
  const res = await request.post('/api/runs', {
    multipart: {
      files: { name: 'synthetic_judgment.docx', mimeType: 'application/octet-stream', buffer: readFileSync(DOCX) },
      review_name: name, actor_id: String(ENGINEER), due_date: dueIn(),
    },
  })
  const run = await res.json() as { run_id: number; review_no: string }
  await expect.poll(async () => (await (await request.get(`/api/runs/${run.run_id}`)).json()).stage,
    { timeout: 60_000 }).toBe('ENGINEER_REVIEW')
  const [j] = await (await request.get(`/api/runs/${run.run_id}/judgments?limit=1`)).json()
  test.skip(!j, '합성 데이터시트가 문서 목록(묶음 A)에 없어 판정이 없습니다')
  const edit = await request.post(`/api/runs/${run.run_id}/actions`, {
    data: { target: 'judgment', target_id: j.judgment_id, action: 'EDIT', value: { result: 'DEVIATION_CANDIDATE' },
      reason: '시험용 일탈', actor_id: ENGINEER },
  })
  expect(edit.status()).toBe(200)
  const summary = await (await request.get(`/api/runs/${run.run_id}`)).json() as { deviation_candidates: number }
  expect(summary.deviation_candidates).toBeGreaterThanOrEqual(1)
  return { ...run, deviations: summary.deviation_candidates }
}

export async function as(page: Page, userId: number) {
  await page.addInitScript((id) => localStorage.setItem('s2w.user', String(id)), userId)
}


/** e2e/fixtures의 합성 문서로 실행을 만들고 담당자 확인 단계까지 기다린다.
 * 문서 목록에 없는 문서는 판정 대상이 없어 등록이 거절되므로(reject-unjudged-registration) 묶음을 정해 보낸다. */
async function upload(request: APIRequestContext, file: string, name: string, bundle?: 'A' | 'B') {
  const res = await request.post('/api/runs', {
    multipart: {
      files: { name: file, mimeType: 'application/octet-stream', buffer: readFileSync(new URL(`./fixtures/${file}`, import.meta.url)) },
      review_name: name, actor_id: String(ENGINEER), due_date: dueIn(),
      ...(bundle ? { choices: JSON.stringify({ [file]: { bundle } }) } : {}),
    },
  })
  expect(res.status(), await res.text()).toBe(202)
  const run = await res.json() as { run_id: number; review_no: string }
  await expect.poll(async () => (await (await request.get(`/api/runs/${run.run_id}`)).json()).stage,
    { timeout: 60_000 }).toBe('ENGINEER_REVIEW')
  return run
}

/** 위험 조건 후보(포괄 조항·값 불일치·범위 모호 하나씩)가 나오는 합성 사양서 (tests/docx_factory.build_gis_spec) */
export const riskRun = (request: APIRequestContext, name: string) => upload(request, 'synthetic_154kV_GIS_spec.docx', name, 'B')

/** 손실 환산 단가 행 셋이 있고 비교 제품이 없는 합성 데이터시트 (tests/docx_factory.build_loss_spec).
 * 문서 목록 번호가 판정 데이터시트와 같으면 문서 판이 겹치므로 따로 넣는다:
 *   INSERT INTO document_catalog (file_no, file_key, bundle, language) VALUES (94, 'synthetic_loss', 'A', 'en'); */
export const lossRun = (request: APIRequestContext, name: string) => upload(request, 'synthetic_loss.docx', name)

/** 문서 읽기 점검 줄(표·그림·단위·위치 하나씩)이 나오는 합성 문서 (tests/docx_factory.build_read_spec) */
export const readRun = (request: APIRequestContext, name: string) => upload(request, 'synthetic_read.docx', name, 'B')

/** 영업 메일 보내기 결과. e2e 백엔드에 영업 주소(RFP_MAIL_SALES)나 메일 서버(Mailpit)가 없으면 보내지 못했다는 안내가 뜬다
 * (주소는 지어내지 않는다, CR-04). 그 안내가 보이면 true를 돌려 보낸 뒤를 보는 확인은 건너뛴다.
 * 메일 내용·다시 시도는 백엔드 테스트(가짜 메일)에서 본다. 보냈으면 false. */
export async function salesMailUnavailable(page: Page, sent: RegExp | string) {
  const failed = page.getByText(/(보내|넘기)지 못했습니다/)
  const ok = page.getByRole('status').filter({ hasText: sent })
  await expect(failed.or(ok).first()).toBeVisible()
  if (!(await failed.first().isVisible())) return false
  test.info().annotations.push({ type: 'note', description: `메일 환경 없음: ${await failed.first().textContent()}` })
  return true
}

/** 판정 데이터시트로 실행만 만든다(판정을 고치지 않음). 지난 확정 힌트 시험용 (add-review-memory) */
export const judgmentRun = (request: APIRequestContext, name: string) => upload(request, 'synthetic_judgment.docx', name)

/** 검토 상세 탭 열기. 손실 환산·입찰 영향·지난 RFP 비교·제출본은 "더 보기" 안에 있다 (update-detail-header) */
export async function openTab(page: Page, name: string) {
  if (['지난 RFP 비교', '제출본'].includes(name)) {
    await page.getByRole('button', { name: '더 보기' }).click()
    await page.getByRole('menuitem', { name }).click()
  } else {
    await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
  }
}

/** 검토 상세 머리 "내보내기 ▾"에서 고르기 (일탈 목록 초안 (Word) · 질의서 초안 (Word) · TBE 준수표 · 데이터시트 채우기) */
export async function exportItem(page: Page, name: string) {
  await page.getByRole('button', { name: '내보내기' }).click()
  await page.getByRole('menuitem', { name }).click()
}

/** 판정 줄을 누른 뒤 열린 판정 상세 화면(add-judgment-view)에서 Esc로 판정 목록에 돌아온다. 돌아오면 패널에 그 줄이 열린다 */
export async function backFromJudgment(page: Page) {
  await expect(page.locator('.jv .mdpos')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#judge')).toBeVisible()
}
