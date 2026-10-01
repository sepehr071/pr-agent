// Renders the n8n workflow JSON files as node graphs (PNG) for the README.
// The graph is drawn from the real `nodes` and `connections` in each file;
// columns are computed from the longest path so the parallel fan-out is visible.
// Usage: node scripts/render-workflow-graph.cjs   (needs the `playwright` package via NODE_PATH)
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'images')
const NODE_W = 196
const NODE_H = 46
const COL_GAP = 64
const ROW_GAP = 16
const PAD = 40

const KINDS = {
  trigger: { label: 'Trigger', color: '#b9b1f5' },
  agent: { label: 'LLM agent', color: '#f0766b' },
  gitlab: { label: 'GitLab / HTTP', color: '#f2a65a' },
  db: { label: 'Postgres', color: '#6cc5a4' },
  code: { label: 'Code', color: '#8fa3c7' },
  flow: { label: 'Branch / merge / loop', color: '#e3cf6b' },
}

function kindOf(node) {
  const t = node.type.replace('n8n-nodes-base.', '')
  if (t.endsWith('Trigger')) return 'trigger'
  if (t === 'httpRequest' && /Agent/.test(node.name)) return 'agent'
  if (t === 'httpRequest') return 'gitlab'
  if (t === 'postgres') return 'db'
  if (['if', 'switch', 'merge', 'splitInBatches'].includes(t)) return 'flow'
  return 'code'
}

function layout(wf, vertical) {
  const byName = new Map(wf.nodes.map((n) => [n.name, n]))
  const edges = []
  for (const [src, conn] of Object.entries(wf.connections)) {
    for (const outputs of conn.main ?? []) for (const c of outputs ?? []) edges.push([src, c.node])
  }
  const out = new Map(wf.nodes.map((n) => [n.name, []]))
  for (const [a, b] of edges) out.get(a)?.push(b)

  // Drop back edges (loop nodes) so longest-path layering terminates.
  const state = new Map()
  const back = new Set()
  const visit = (v) => {
    state.set(v, 1)
    for (const w of out.get(v) ?? []) {
      if (state.get(w) === 1) back.add(`${v}>${w}`)
      else if (!state.get(w)) visit(w)
    }
    state.set(v, 2)
  }
  const indeg = new Map(wf.nodes.map((n) => [n.name, 0]))
  for (const [, b] of edges) indeg.set(b, (indeg.get(b) ?? 0) + 1)
  const roots = wf.nodes.filter((n) => !indeg.get(n.name)).sort((a, b) => a.position[0] - b.position[0])
  for (const r of roots) visit(r.name)
  for (const n of wf.nodes) if (!state.get(n.name)) visit(n.name)

  const fwd = edges.filter(([a, b]) => !back.has(`${a}>${b}`))
  const col = new Map(wf.nodes.map((n) => [n.name, 0]))
  for (let i = 0; i < wf.nodes.length; i++) {
    for (const [a, b] of fwd) col.set(b, Math.max(col.get(b), col.get(a) + 1))
  }

  const cols = []
  for (const n of wf.nodes) (cols[col.get(n.name)] ??= []).push(n)
  // Horizontal: columns left to right. Vertical: the same layers as rows, top to bottom.
  const across = vertical ? NODE_W + ROW_GAP : NODE_H + ROW_GAP
  const along = vertical ? NODE_H + COL_GAP / 1.5 : NODE_W + COL_GAP
  const span = Math.max(...cols.map((c) => c.length)) * across - ROW_GAP
  const pos = new Map()
  cols.forEach((c, i) => {
    c.sort((a, b) => a.position[1] - b.position[1])
    const len = c.length * across - ROW_GAP
    c.forEach((n, j) => {
      const u = i * along
      const v = (span - len) / 2 + j * across
      pos.set(n.name, vertical ? { x: PAD + v, y: PAD + 70 + u } : { x: PAD + u, y: PAD + 70 + v })
    })
  })
  const length = cols.length * along - (along - (vertical ? NODE_H : NODE_W))
  return vertical
    ? { byName, edges, back, pos, width: PAD * 2 + span, height: PAD * 2 + 70 + length + 40 }
    : { byName, edges, back, pos, width: PAD * 2 + length, height: span + PAD * 2 + 70 + 40 }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function svg(wf, title, vertical) {
  const { byName, edges, back, pos, width, height } = layout(wf, vertical)
  const paths = edges.map(([a, b]) => {
    const p = pos.get(a), q = pos.get(b)
    if (!p || !q) return ''
    const isBack = back.has(`${a}>${b}`)
    if (vertical) {
      const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H, x2 = q.x + NODE_W / 2, y2 = q.y
      return `<path d="M${x1},${y1} C${x1},${y1 + 28} ${x2},${y2 - 28} ${x2},${y2}" fill="none" stroke="#46506a" stroke-width="1.5"/>`
    }
    if (isBack) {
      // Loop edge: from the source's left side back to the target's right side, kept inside the column gap.
      const bx1 = p.x, by1 = p.y + NODE_H * 0.75, bx2 = q.x + NODE_W, by2 = q.y + NODE_H * 0.75
      return `<path d="M${bx1},${by1} C${bx1 - COL_GAP / 2},${by1} ${bx2 + COL_GAP / 2},${by2} ${bx2},${by2}" fill="none" stroke="#e3cf6b" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#loop)"/>`
    }
    const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2, x2 = q.x, y2 = q.y + NODE_H / 2
    const d = `M${x1},${y1} C${x1 + COL_GAP / 1.4},${y1} ${x2 - COL_GAP / 1.4},${y2} ${x2},${y2}`
    return `<path d="${d}" fill="none" stroke="#46506a" stroke-width="1.5"/>`
  }).join('')
  const nodes = [...pos].map(([name, p]) => {
    const k = KINDS[kindOf(byName.get(name))]
    return `<g transform="translate(${p.x},${p.y})">
      <rect width="${NODE_W}" height="${NODE_H}" rx="8" fill="#1b2130" stroke="#2c3446"/>
      <rect width="4" height="${NODE_H - 16}" x="10" y="8" rx="2" fill="${k.color}"/>
      <text x="24" y="${NODE_H / 2 + 4.5}" fill="#e7eaf2" font-size="13">${esc(name.length > 26 ? name.slice(0, 25) + '…' : name)}</text>
    </g>`
  }).join('')
  const legend = Object.values(KINDS).map((k, i) =>
    `<g transform="translate(${PAD + i * 170},${height - PAD})"><rect width="10" height="10" y="-9" rx="2" fill="${k.color}"/><text x="18" fill="#9aa3b8" font-size="12">${k.label}</text></g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif">
    <defs><marker id="loop" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#e3cf6b" stroke-width="1.5"/></marker></defs>
    <rect width="100%" height="100%" fill="#131722"/>
    <text x="${PAD}" y="${PAD + 18}" fill="#e7eaf2" font-size="22" font-weight="600">${esc(title)}</text>
    <text x="${PAD}" y="${PAD + 44}" fill="#9aa3b8" font-size="13">${esc(wf.name)}: ${wf.nodes.length} nodes, rendered from the exported workflow JSON</text>
    ${paths}${nodes}${legend}</svg>`
}

;(async () => {
  const jobs = [
    ['workflow-main.json', 'Review pipeline: seven agents in parallel', 'workflow-main-graph.png', true],
    ['workflow-approval.json', 'Approval handler: one route per !command', 'workflow-approval-graph.png', false],
  ]
  const browser = await chromium.launch()
  for (const [file, title, png, vertical] of jobs) {
    const wf = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    const s = svg(wf, title, vertical)
    const [, w, h] = s.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/)
    const page = await browser.newPage({ viewport: { width: Math.ceil(+w), height: Math.ceil(+h) }, deviceScaleFactor: 2 })
    await page.setContent(`<body style="margin:0">${s}</body>`)
    await page.screenshot({ path: path.join(OUT, png) })
    await page.close()
    console.log('saved', png)
  }
  await browser.close()
})()
