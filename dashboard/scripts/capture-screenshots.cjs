// Captures the README screenshots from a running demo (mock-supabase + next dev).
// Usage:
//   MOCK_PORT=4191 node scripts/mock-supabase.mjs
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4191 NEXT_PUBLIC_SUPABASE_ANON_KEY=demo npx next dev -H 127.0.0.1 -p 4190
//   BASE=http://127.0.0.1:4190 OUT=../docs/images node scripts/capture-screenshots.cjs
// Requires the `playwright` package (resolve it via NODE_PATH or a local install).
const { chromium } = require('playwright')
const path = require('path')

const BASE = process.env.BASE ?? 'http://127.0.0.1:4190'
const OUT = path.resolve(process.env.OUT ?? path.join(__dirname, '..', '..', 'docs', 'images'))

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', 'alice@acme.dev')
  await page.fill('#password', 'demo-password')
  await page.click('button[type=submit]')
  await page.waitForURL('**/reviews')
  await page.reload({ waitUntil: 'networkidle' }) // header reads the session on mount
}

async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(OUT, name) })
  console.log('saved', name)
}

;(async () => {
  const browser = await chromium.launch()
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await desktop.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await shot(page, 'login.png')

  await login(page)
  await shot(page, 'reviews-queue.png')

  await page.goto(`${BASE}/reviews/rv-1287`, { waitUntil: 'networkidle' })
  await page.getByText('Order search interpolates user input').first().click()
  for (const t of ['Payment provider key', 'Cart page loads each']) {
    await page.getByText(t).first().locator('xpath=ancestor::*[@data-finding][1]').getByRole('checkbox').click()
  }
  await shot(page, 'review-critical-finding.png')

  await page.getByRole('button', { name: /test-coverage/ }).click()
  await page.getByText('Partial refund path has no tests').first().click()
  await shot(page, 'review-filtered-test-gap.png')

  await page.goto(`${BASE}/reviews/rv-1281`, { waitUntil: 'networkidle' })
  await page.getByText('Search field re-renders').first().click()
  await shot(page, 'review-persian-summary.png')

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const m = await mobile.newPage()
  await login(m)
  await shot(m, 'mobile-queue.png')

  // hero.png: the real review screen framed with a one-line pitch
  const img = require('fs').readFileSync(path.join(OUT, 'review-critical-finding.png')).toString('base64')
  const hero = await desktop.newPage()
  await hero.setViewportSize({ width: 1600, height: 820 })
  await hero.setContent(`<body style="margin:0;background:#10141d;font-family:'IBM Plex Sans','Segoe UI',sans-serif;color:#e7eaf2">
    <div style="display:grid;grid-template-columns:420px 1fr;gap:48px;align-items:center;height:820px;padding:0 56px 0 72px;overflow:hidden">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px">
          <span style="width:36px;height:36px;border-radius:9px;background:#b9b1f5;display:grid;place-items:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10141d" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg></span>
          <span style="font-size:20px;font-weight:600">PR Agent</span>
        </div>
        <h1 style="font-size:40px;line-height:1.15;font-weight:600;margin:0 0 18px;letter-spacing:-0.02em">Seven AI reviewers on every merge request. One human decides what gets posted.</h1>
        <p style="font-size:17px;line-height:1.6;color:#9aa3b8;margin:0">n8n fan-out of security, performance, style, architecture, test, quality and context agents, with a CTO dashboard to approve, trim or reject findings.</p>
        <p style="font-size:13px;color:#6b7489;margin-top:28px">Screenshot: CTO dashboard with demo data</p>
      </div>
      <img src="data:image/png;base64,${img}" style="width:100%;border-radius:14px;border:1px solid #2c3446;box-shadow:0 30px 80px rgba(0,0,0,.5)">
    </div></body>`)
  await hero.waitForTimeout(300)
  await hero.screenshot({ path: path.join(OUT, 'hero.png') })
  console.log('saved hero.png')

  await browser.close()
})()
