// Demo-mode stand-in for Supabase: just enough of Auth, PostgREST and Edge Functions
// for the dashboard to run locally with fictional data (repo "acme/web").
// No dependencies. Usage:
//   MOCK_PORT=54321 node scripts/mock-supabase.mjs
// then run the dashboard with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
// and sign in with any email/password. State is in memory and resets on restart.
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT ?? 54321)
const HOST = '127.0.0.1'

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Date.now()
const ago = (min) => new Date(now - min * 60_000).toISOString()

let currentEmail = 'alice@acme.dev'
const user = () => ({
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: currentEmail,
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: ago(60 * 24 * 30),
})
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24
  const access_token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user().id, email: currentEmail, role: 'authenticated', exp })}.demo`
  return { access_token, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'demo-refresh', user: user() }
}

// ---- fictional review data -------------------------------------------------
const f = (id, severity, category, subcategory, file_path, line, title, description, suggestion, extra = {}) => ({
  id, severity, category, subcategory, file_path, line, title, description, suggestion, confidence: 'high', ...extra,
})

const findings1287 = [
  f(1, 'critical', 'security', 'sql-injection', 'src/server/orders/search.ts', 48,
    'Order search interpolates user input into raw SQL',
    'The `q` query parameter is concatenated into a `sql.raw()` template. Any authenticated user can read or modify other tenants\' orders.',
    'Use a parameterised query:\n```ts\nconst rows = await db.query(\n  \'SELECT * FROM orders WHERE tenant_id = $1 AND title ILIKE $2\',\n  [tenantId, `%${q}%`]\n)\n```',
    { cwe_id: 'CWE-89', impact: 'Cross-tenant data exposure through the public search endpoint.', auto_fixable: true }),
  f(2, 'high', 'security', 'secrets', 'src/lib/payments/client.ts', 12,
    'Payment provider key falls back to a hard-coded test value',
    'When `PAYMENTS_KEY` is unset the client silently uses a literal test key, which masks misconfiguration in staging and production.',
    'Fail fast at startup when the variable is missing instead of falling back.',
    { cwe_id: 'CWE-798', confidence: 'medium' }),
  f(3, 'high', 'performance', 'n-plus-one', 'src/app/(shop)/cart/page.tsx', 73,
    'Cart page loads each line item\'s product in a loop',
    'Every cart line triggers its own `getProduct()` call. A 30-item cart issues 31 round trips before first paint.',
    'Batch the lookup:\n```ts\nconst products = await getProducts(lines.map(l => l.productId))\n```',
    { metrics: 'Round trips grow linearly with cart size (1 + n).' }),
  f(4, 'medium', 'architecture', 'layering', 'src/components/checkout/summary.tsx', 22,
    'UI component imports the database client directly',
    'The checkout summary reaches into `@/server/db`, coupling a client-facing component to the persistence layer.',
    'Move the query into a server action or route handler and pass plain data to the component.',
    { related_files: ['src/server/db/index.ts', 'src/app/(shop)/checkout/page.tsx'] }),
  f(5, 'medium', 'test-coverage', 'missing-tests', 'src/server/orders/refund.ts', 5,
    'Partial refund path has no tests',
    'The new `refundPartial()` branch handles currency rounding but no test covers amounts with more than two decimals.',
    'Add a unit test for rounding edge cases.',
    { test_example: "it('rounds 10.005 EUR down to 10.00', () => {\n  expect(refundPartial(order, 10.005).amount).toBe(10.0)\n})" }),
  f(6, 'medium', 'code-quality', 'error-handling', 'src/server/orders/refund.ts', 61,
    'Refund errors are swallowed and logged as success',
    'The `catch` block logs `refund completed` and returns `ok: true` even when the provider call throws.',
    'Return a failed result and surface the provider error to the caller.',
    { confidence: 'medium' }),
  f(7, 'low', 'style', 'naming', 'src/lib/format.ts', 9,
    'Helper name `fmt2` does not describe what it formats',
    'The function formats minor-unit integers as currency strings.',
    'Rename to `formatMinorUnits` and update the two call sites.',
    { auto_fixable: true }),
  f(8, 'low', 'code-quality', 'dead-code', 'src/app/(shop)/cart/page.tsx', 140,
    'Unused `legacyTotals` import',
    'The import is left over from the previous cart implementation.',
    'Remove the import.',
    { auto_fixable: true }),
  f(9, 'medium', 'context', 'business-rules', 'src/server/orders/refund.ts', 30,
    'Refund window differs from the documented 30-day policy',
    'The code allows refunds for 45 days, while `docs/policies/refunds.md` in this repo still says 30.',
    'Confirm which value is intended and update either the constant or the doc.',
    { confidence: 'low' }),
]

const stats = (list) => {
  const s = { total: list.length, critical: 0, high: 0, medium: 0, low: 0, by_category: {} }
  for (const x of list) {
    s[x.severity]++
    s.by_category[x.category] = (s.by_category[x.category] ?? 0) + 1
  }
  return s
}

const small = (base, items) => items.map((it, i) => f(base + i, ...it))

const reviews = [
  { review_id: 'rv-1287', mr_iid: 1287, status: 'pending_approval', created_at: ago(18), confidence_score: 88, risk_score: 82,
    summary: 'Adds order search and partial refunds. One critical SQL injection in the new search endpoint must be fixed before merge; the cart page also regresses to N+1 product queries. Remaining findings are maintainability and test gaps.',
    findings: findings1287 },
  { review_id: 'rv-1284', mr_iid: 1284, status: 'pending_approval', created_at: ago(95), confidence_score: 91, risk_score: 46,
    summary: 'Migrates session storage to signed cookies. Cookie flags are correct; the refresh path lacks rate limiting and has no test for token expiry.',
    findings: small(1, [
      ['high', 'security', 'rate-limiting', 'src/app/api/auth/refresh/route.ts', 17, 'Refresh endpoint has no rate limit', 'Unlimited refresh calls allow token brute forcing.', 'Reuse the existing `rateLimit()` middleware.'],
      ['medium', 'test-coverage', 'missing-tests', 'src/lib/session.ts', 40, 'Expired token path is untested', 'No test covers an expired signed cookie.', 'Add a test with a clock mock.'],
      ['low', 'style', 'formatting', 'src/lib/session.ts', 3, 'Mixed quote styles', 'File mixes single and double quotes.', 'Run the formatter.'],
    ]) },
  { review_id: 'rv-1281', mr_iid: 1281, status: 'pending_approval', created_at: ago(60 * 5), confidence_score: 79, risk_score: 31,
    summary: 'بازنویسی صفحهٔ تنظیمات کاربر با فرم\u200cهای کنترل\u200cشده. مشکل امنیتی دیده نشد؛ دو مورد مربوط به دسترس\u200cپذیری و یک رندر اضافه در فیلد جست\u200cوجو وجود دارد.',
    findings: small(1, [
      ['medium', 'performance', 're-render', 'src/app/settings/profile-form.tsx', 58, 'Search field re-renders the whole form on each keystroke', 'State is lifted to the form root.', 'Keep the query state local to the field.'],
      ['low', 'code-quality', 'accessibility', 'src/app/settings/profile-form.tsx', 90, 'Avatar button has no accessible name', 'Icon-only button without aria-label.', 'Add `aria-label="Change avatar"`.'],
      ['low', 'code-quality', 'accessibility', 'src/app/settings/toggle.tsx', 12, 'Toggle does not expose its pressed state', 'Missing aria-pressed.', 'Add `aria-pressed={on}`.'],
    ]) },
  { review_id: 'rv-1279', mr_iid: 1279, status: 'pending_approval', created_at: ago(60 * 26), confidence_score: 95, risk_score: 12,
    summary: 'Copy and translation updates in the marketing pages. Only minor style notes.',
    findings: small(1, [
      ['low', 'style', 'naming', 'src/app/(marketing)/pricing/page.tsx', 14, 'Constant uses camelCase instead of UPPER_SNAKE', 'Module-level constant naming differs from the rest of the codebase.', 'Rename `planNames` to `PLAN_NAMES`.'],
    ]) },
  { review_id: 'rv-1276', mr_iid: 1276, status: 'approved', approved_by: 'bob@acme.dev', approved_at: ago(60 * 3), created_at: ago(60 * 30), confidence_score: 90, risk_score: 20, summary: 'Dependency bumps.', findings: [] },
  { review_id: 'rv-1273', mr_iid: 1273, status: 'rejected', rejected_by: 'alice@acme.dev', rejected_at: ago(60 * 20), created_at: ago(60 * 48), confidence_score: 64, risk_score: 38, summary: 'Feature flag cleanup.', findings: [] },
  { review_id: 'rv-1270', mr_iid: 1270, status: 'approved', approved_by: 'alice@acme.dev', approved_at: ago(60 * 50), created_at: ago(60 * 72), confidence_score: 87, risk_score: 55, summary: 'Webhook retries.', findings: [] },
]

const toRow = (r) => ({
  review_id: r.review_id,
  mr_iid: r.mr_iid,
  project_id: 42,
  findings: r.findings,
  stats: stats(r.findings),
  draft_note_id: 9000 + r.mr_iid,
  confidence_score: r.confidence_score,
  review_metadata: { risk_score: r.risk_score, executive_summary: r.summary, model: 'demo-model', languages: ['typescript'] },
  base_sha: 'a1b2c3d', head_sha: 'e4f5a6b', start_sha: 'a1b2c3d',
  custom_comments: [],
  status: r.status,
  approved_by: r.approved_by ?? null, approved_at: r.approved_at ?? null,
  rejected_by: r.rejected_by ?? null, rejected_at: r.rejected_at ?? null,
  created_at: r.created_at,
})

const toListItem = (r) => {
  const s = stats(r.findings)
  return {
    review_id: r.review_id, mr_iid: r.mr_iid, project_id: 42, status: r.status, created_at: r.created_at,
    confidence_score: r.confidence_score, risk_score: r.risk_score, executive_summary: r.summary,
    total_findings: s.total, critical_findings: s.critical, high_findings: s.high, approved_by: r.approved_by ?? null,
  }
}

// ---- minimal PostgREST filter handling ------------------------------------
function applyQuery(rows, params) {
  let out = rows
  for (const [key, val] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    if (val.startsWith('eq.')) out = out.filter((r) => String(r[key]) === val.slice(3))
    else if (val.startsWith('in.(')) {
      const set = val.slice(4, -1).split(',').map((v) => v.replace(/"/g, ''))
      out = out.filter((r) => set.includes(String(r[key])))
    }
  }
  const order = params.get('order')
  if (order) {
    const [col, dir] = order.split('.')
    out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (dir === 'desc' ? -1 : 1))
  }
  const limit = params.get('limit')
  if (limit) out = out.slice(0, Number(limit))
  const select = params.get('select')
  if (select && select !== '*') {
    const cols = select.split(',')
    out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
  }
  return out
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
  res.setHeader('access-control-allow-credentials', 'true')
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] ?? '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return send(res, 204)

  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {}

  // Auth
  if (url.pathname === '/auth/v1/token') {
    if (body.email) currentEmail = body.email
    return send(res, 200, session())
  }
  if (url.pathname === '/auth/v1/user') return send(res, 200, user())
  if (url.pathname === '/auth/v1/logout') return send(res, 204)

  // PostgREST
  if (url.pathname === '/rest/v1/active_reviews_dashboard') {
    const rows = reviews.filter((r) => r.status === 'pending_approval').map(toListItem)
    return send(res, 200, applyQuery(rows, url.searchParams))
  }
  if (url.pathname === '/rest/v1/pending_reviews') {
    const rows = applyQuery(reviews.map(toRow), url.searchParams)
    if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
      if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null })
      return send(res, 200, rows[0])
    }
    return send(res, 200, rows)
  }

  // Edge Functions (see supabase/functions/*)
  const fn = url.pathname.match(/^\/functions\/v1\/(approve|reject)-review$/)
  if (fn) {
    const r = reviews.find((x) => x.review_id === body.review_id)
    if (!r) return send(res, 404, { success: false, error: 'Review not found' })
    if (fn[1] === 'approve') {
      Object.assign(r, { status: 'approved', approved_by: body.approver, approved_at: new Date().toISOString() })
      const n = body.selected_finding_ids === 'all' ? r.findings.length : body.selected_finding_ids.length
      return send(res, 200, { success: true, posted_count: n, total_findings: r.findings.length })
    }
    Object.assign(r, { status: 'rejected', rejected_by: body.rejector, rejected_at: new Date().toISOString() })
    return send(res, 200, { success: true })
  }

  send(res, 404, { message: `mock-supabase: no handler for ${req.method} ${url.pathname}` })
})

server.listen(PORT, HOST, () => console.log(`mock-supabase listening on http://${HOST}:${PORT}`))
