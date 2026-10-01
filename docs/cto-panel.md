# CTO Review Dashboard — Design Document

> A web-based dashboard replacing GitLab `!command` workflow for reviewing and approving AI code review findings.

## Problem

The CTO currently reviews AI findings via GitLab comment commands (`!approve`, `!reject`, `!approve-partial 1,3,5-7`). This is:

- **Error-prone** — typos in commands, no autocomplete, delayed feedback (2-10s per command round-trip through n8n)
- **Hard to scan** — findings are a Markdown wall in a GitLab comment; 20+ findings require scrolling
- **No overview** — no way to see pending reviews across projects at a glance
- **Buried UX** — CTO commands are in a threaded reply (v3.1.0), easy to miss

## Solution

A Next.js dashboard that reads directly from Supabase and uses Edge Functions for actions that require GitLab API access.

---

## Architecture

```
Next.js App (Vercel)
  │
  ├── Supabase Client SDK (reads)
  │     ├── pending_reviews table
  │     ├── active_reviews_dashboard view
  │     ├── agent_runs table
  │     └── RLS policies enforce auth
  │
  └── Supabase Edge Functions (writes/actions)
        ├── approve-review  → posts inline comments via GitLab Discussions API
        ├── reject-review   → posts rejection note via GitLab Notes API
        ├── edit-finding    → updates finding in Supabase, recalculates stats
        ├── remove-findings → removes + renumbers findings, recalculates stats
        ├── add-comment     → appends to custom_comments JSONB
        └── rerun-agent     → calls OpenRouter API, merges new findings
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript |
| UI Components | shadcn/ui + Tailwind CSS |
| Database | Supabase (existing, shared with n8n workflows) |
| Auth | Supabase Auth (email/password, allowlisted accounts) |
| Server Functions | Supabase Edge Functions (Deno) |
| Deployment | Vercel (frontend) + Supabase (edge functions) |
| Realtime | Supabase Realtime (postgres_changes) |

### Backward Compatibility

The GitLab `!command` workflow (`workflow-approval.json`) remains fully functional. Both the dashboard and GitLab commands read/write the same `pending_reviews` table. If the CTO approves via the dashboard, the n8n `!approve` command will find no `pending_approval` review and gracefully return "Review not found."

---

## Database — Existing Schema (No Changes Needed)

All tables already exist from `database/migration-v3.sql`. The dashboard reads/writes the same data the n8n workflows use.

### Tables Used by Dashboard

**`pending_reviews`** — Core table, one row per review:

| Column | Type | Dashboard Use |
|--------|------|--------------|
| `review_id` | VARCHAR(255) PK | URL parameter, lookup key |
| `mr_iid` | INTEGER | Display, GitLab link |
| `project_id` | INTEGER | Display, GitLab link |
| `findings` | JSONB | Array of finding objects — the core data |
| `stats` | JSONB | `{total, critical, high, medium, low, by_category}` |
| `draft_note_id` | INTEGER | GitLab note reference |
| `status` | VARCHAR | `pending_approval`, `approved`, `rejected` |
| `confidence_score` | DECIMAL(5,2) | Display |
| `review_metadata` | JSONB | `{risk_score, executive_summary, model, languages}` |
| `base_sha` | VARCHAR(64) | Inline comment positioning |
| `head_sha` | VARCHAR(64) | Inline comment positioning |
| `start_sha` | VARCHAR(64) | Inline comment positioning |
| `custom_comments` | JSONB | CTO-added comments array |
| `approved_by` | VARCHAR | Set on approve |
| `approved_at` | TIMESTAMP | Set on approve |
| `rejected_by` | VARCHAR | Set on reject |
| `rejected_at` | TIMESTAMP | Set on reject |
| `created_at` | TIMESTAMP | Display (age) |

**`active_reviews_dashboard`** — Pre-built SQL view (migration-v3.sql lines 202-221):

```sql
SELECT
    pr.review_id, pr.mr_iid, pr.project_id, pr.status,
    pr.created_at, pr.confidence_score,
    (pr.review_metadata->>'risk_score')::INTEGER AS risk_score,
    (pr.review_metadata->>'executive_summary')::TEXT AS executive_summary,
    (pr.stats->>'total')::INTEGER AS total_findings,
    (pr.stats->>'critical')::INTEGER AS critical_findings,
    (pr.stats->>'high')::INTEGER AS high_findings,
    pr.approved_by
FROM pending_reviews pr
WHERE pr.status IN ('pending_approval', 'changes_requested')
ORDER BY critical_findings DESC, high_findings DESC, created_at ASC;
```

**`review_history`** — Learning system, written on approve/reject:

| Column | Type | Notes |
|--------|------|-------|
| `project_id` | INTEGER | |
| `mr_iid` | INTEGER | |
| `file_path` | VARCHAR(512) | |
| `issue_type` | VARCHAR(100) | Category (security, performance, etc.) |
| `issue_subcategory` | VARCHAR(100) | |
| `severity` | VARCHAR(20) | |
| `finding_data` | JSONB | Full finding object |
| `was_accepted` | BOOLEAN | TRUE if approved, FALSE if rejected |
| `review_id` | VARCHAR(255) | Back-reference |

**`agent_runs`** — Performance metrics (read-only from dashboard):

| Column | Type | Notes |
|--------|------|-------|
| `review_id` | VARCHAR(255) | |
| `agent_name` | VARCHAR(100) | security, performance, style, etc. |
| `findings_count` | INTEGER | |
| `duration_ms` | INTEGER | |
| `status` | VARCHAR(50) | running/completed/failed/timeout |

---

## Data Structures

### Finding Object (element of `findings` JSONB array)

```typescript
interface Finding {
  id: number;                // 1-based index
  file_path: string;         // "src/api/users.js"
  line: number;              // approximate line number
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'style' | 'architecture'
          | 'test-coverage' | 'code-quality' | 'context';
  subcategory: string;       // "sql-injection", "n-plus-one", etc.
  title: string;             // under 60 chars
  description: string;       // detailed explanation
  suggestion: string;        // recommended fix
  confidence: 'high' | 'medium' | 'low';

  // Category-specific optional fields:
  cwe_id?: string;           // security only — "CWE-89"
  impact?: string;           // performance & architecture — degradation estimate
  auto_fixable?: boolean;    // style only
  test_example?: string;     // test-coverage only — example test code
  metrics?: string;          // code-quality only — "cyclomatic complexity: 18"
  related_files?: string[];  // context only — ["src/models/user.js"]
}
```

### Review Stats

```typescript
interface ReviewStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  by_category: Record<string, number>;
}
```

### Review Metadata

```typescript
interface ReviewMetadata {
  risk_score: number;          // 0-100, capped: (critical*25)+(high*10)+(medium*3)+(low*1)
  executive_summary: string;   // Markdown text
  model: string;               // "moonshotai/kimi-k2.5"
  languages: string[];         // ["javascript", "python"]
}
```

### Custom Comment

```typescript
interface CustomComment {
  file_path: string;
  line: number;
  message: string;
  added_by: string;    // GitLab username
  added_at: string;    // ISO timestamp
}
```

### Review List Item (from `active_reviews_dashboard` view)

```typescript
interface ReviewListItem {
  review_id: string;
  mr_iid: number;
  project_id: number;
  status: string;
  created_at: string;
  confidence_score: number;
  risk_score: number;
  executive_summary: string;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  approved_by: string | null;
}
```

### Full Review (from `pending_reviews` table)

```typescript
interface PendingReview {
  review_id: string;
  mr_iid: number;
  project_id: number;
  findings: Finding[];
  stats: ReviewStats;
  draft_note_id: number;
  confidence_score: number;
  review_metadata: ReviewMetadata;
  base_sha: string;
  head_sha: string;
  start_sha: string;
  custom_comments: CustomComment[];
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
}
```

---

## Pages & Routes

```
/login              → Login page (email/password)
/reviews            → Review list (pending + recent) — redirects here from /
/reviews/[id]       → Review detail (two-panel split)
```

No settings page, no analytics page, no user management — keep it minimal for 1-2 users.

**Layout:** Minimal header (logo/title on left, username + logout on right). No sidebar — only 2 real pages, detail page has back arrow.

---

## Page 1: Login (`/login`)

- Email + password form using `supabase.auth.signInWithPassword()`
- Redirect to `/reviews` on success
- Next.js middleware protects all routes except `/login` — checks `supabase.auth.getUser()`
- Create CTO account manually in Supabase dashboard (Auth → Users → Create user)

---

## Page 2: Review List (`/reviews`)

### Data Sources

- **Pending reviews:** `SELECT * FROM active_reviews_dashboard` (existing view)
- **Recent decisions:** `SELECT * FROM pending_reviews WHERE status IN ('approved','rejected') ORDER BY COALESCE(approved_at, rejected_at) DESC LIMIT 20`

### Layout

**Section A — Pending Reviews (primary table):**

| Column | Source | Rendering |
|--------|--------|-----------|
| MR | `mr_iid` | `!{mr_iid}` as link to GitLab MR page |
| Project | `project_id` | ID (later: resolve to name) |
| Risk | `risk_score` | Color badge: green 0-19, yellow 20-39, orange 40-69, red 70-100 |
| Findings | `total_findings` | Count + severity sub-badges: `{critical}C {high}H` |
| Confidence | `confidence_score` | Percentage badge |
| Summary | `executive_summary` | Truncated ~80 chars, tooltip shows full |
| Age | `created_at` | Relative time ("2h ago", "1d ago") |
| Action | — | "Review" button → `/reviews/[review_id]` |

Sorted by critical findings DESC, high findings DESC, created_at ASC (matching the view's built-in sort).

**Section B — Recent Decisions (collapsed by default):**
Simpler table: MR#, outcome badge (approved/rejected), by whom, when.

**Empty state:** "No pending reviews. New reviews will appear automatically."

**Realtime:** Subscribe to `pending_reviews` INSERT events → auto-add new rows + toast notification.

---

## Page 3: Review Detail (`/reviews/[id]`) — Two-Panel Split

This is the core page. The CTO loads it, scans findings, drills into details, selects which to approve, and takes action.

### Wireframe

```
+-----------------------------------------------------------+
| <-- Back   MR !42 - "Add user endpoint"   Risk: 65/100   |
| Summary: 8 findings | 0C 2H 3M 1L | Confidence: 82%     |
| Executive Summary (collapsible)                            |
+---------------------------+-------------------------------+
| FINDINGS LIST (left 40%)  | DETAIL PANEL (right 60%)     |
|                           |                               |
| Filter: [All] [Sev] [Cat]| #1 - SQL injection            |
|                           | Severity: CRITICAL [edit v]   |
| [x] #1 CRIT Security     | Category: security            |
|     SQL injection...      | File: src/api/users.js:45     |
| [ ] #2 HIGH Performance  | Subcategory: sql-injection    |
|     N+1 query...          | CWE: CWE-89 (linked)         |
| [x] #3 MED Architecture  | Confidence: high              |
|     Missing abstraction   |                               |
| [ ] #4 MED Code Quality  | DESCRIPTION:                  |
|     High complexity       | User input is concatenated    |
| [ ] #5 LOW Style         | directly into SQL query...    |
|     Missing JSDoc         |                               |
| ...                       | SUGGESTION:                   |
|                           | Use parameterized queries:    |
| CUSTOM COMMENTS:          | `SELECT * FROM users WHERE    |
| file.js:42 - "Add input  |  id = $1`                     |
| validation"               |                               |
|                           | [Remove Finding] [Rerun Agent]|
+---------------------------+-------------------------------+
| STICKY ACTION BAR:                                         |
| [Select All] [Deselect] | 3 of 8 selected                |
| [Approve Selected] [Approve All] [Reject All]             |
| [+ Add Comment]                                            |
+-----------------------------------------------------------+
```

### Top Bar

- Back arrow → `/reviews`
- MR identifier (e.g., `!42 - "Add user endpoint"`) linking to GitLab MR page: `{GITLAB_URL}/{GITLAB_NAMESPACE}/{GITLAB_PROJECT}/-/merge_requests/{mr_iid}`
- Risk score badge: color-coded 0-100 (green/yellow/orange/red)
- Confidence percentage badge
- Severity summary pills: `0C 2H 3M 1L` with colors
- Executive summary (collapsible card, expanded by default on first visit)

### Left Panel (40% width)

**Filter bar:**
- Severity multi-select buttons: All | Critical | High | Medium | Low
- Category chips: Security | Performance | Style | Architecture | Test | Quality | Context
- Sort toggle: Severity (default) | File | Category

**Finding cards (scrollable list):**
- Checkbox for selection
- Colored left border matching severity (red/orange/yellow/gray)
- `#{id}` • severity badge • category icon
- `file_path:line`
- Title (truncated if long)
- Click anywhere on card → shows detail in right panel
- Active card highlighted

**Custom comments section (below findings):**
- List of existing custom comments: `file:line — "message" (by @user)`
- Delete button per comment (calls `remove-findings` edge function variant or direct DB update)

### Right Panel (60% width)

When a finding is selected:

**Header:**
- `#{id}` — Finding title
- Severity dropdown (editable — triggers `edit-finding` edge function)
- Category badge with icon
- Subcategory tag
- Confidence badge (high/medium/low with color)

**Location:**
- File path (as link to GitLab file): `{GITLAB_URL}/{namespace}/{project}/-/blob/{head_sha}/{file_path}#L{line}`
- Line number

**Body:**
- **Description** — full text
- **Suggestion** — full text, code blocks rendered

**Category-specific fields:**
- Security: CWE ID as link to `https://cwe.mitre.org/data/definitions/{id}.html`
- Performance/Architecture: Impact estimate
- Style: "Auto-fixable" badge (yes/no)
- Test Coverage: Test example in code block
- Code Quality: Metrics string
- Context: Related files list (as links)

**Actions:**
- "Remove Finding" button (confirmation dialog → calls `remove-findings`)
- "Rerun Agent" button (re-runs this finding's agent category → calls `rerun-agent`)

**Empty state (no finding selected):**
- "Select a finding from the list to view details"

### Sticky Bottom Action Bar

- "Select All" / "Deselect All" toggle
- `{N} of {total} selected` counter
- **"Approve Selected"** — primary button, enabled when selection > 0. Calls `approve-review` with selected IDs
- **"Approve All"** — secondary button. Calls `approve-review` with `"all"`
- **"Reject All"** — destructive button with AlertDialog confirmation. Calls `reject-review`
- **"+ Add Comment"** — opens dialog (inputs: file path, line number, message textarea)

### State Management

- Selection state: `Set<number>` of finding IDs (React useState)
- Active finding: `number | null` (finding ID shown in right panel)
- Filter state: `{ severities: Set<string>, categories: Set<string>, sort: 'severity' | 'file' | 'category' }`
- All client-side state — no need for global state management (Zustand, etc.)

### Realtime

Subscribe to `pending_reviews` UPDATE where `review_id = current` — if the review is modified externally (e.g., someone used `!command` in GitLab), refresh the data.

---

## Supabase Edge Functions — Detailed Specs

All edge functions are in `supabase/functions/` and deployed via Supabase CLI (`supabase functions deploy`).

### Shared Setup

```typescript
// All edge functions need:
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // bypasses RLS
)

const GITLAB_URL = Deno.env.get('GITLAB_URL')!
const GITLAB_TOKEN = Deno.env.get('GITLAB_TOKEN')!
```

### Function 1: `approve-review`

**Endpoint:** `POST /functions/v1/approve-review`

**Request body:**
```json
{
  "review_id": "review-123-42-1709123456789",
  "selected_finding_ids": [1, 3, 5] | "all",
  "approver": "your-gitlab-username"
}
```

**Logic:**
1. Fetch review from `pending_reviews` by `review_id`
2. Validate `status = 'pending_approval'` — return 409 if not
3. Filter findings to selected IDs (or all)
4. For each selected finding + custom_comments, POST to GitLab:
   ```
   POST {GITLAB_URL}/api/v4/projects/{project_id}/merge_requests/{mr_iid}/discussions
   Headers: PRIVATE-TOKEN: {GITLAB_TOKEN}
   Body: {
     body: "**[#{id}] {title}**\n\nSeverity: {severity}\nCategory: {category}\n\n{description}\n\n**Suggestion:** {suggestion}\n\n---\n_AI Code Review_",
     position: {
       base_sha: review.base_sha,
       start_sha: review.start_sha,
       head_sha: review.head_sha,
       position_type: "text",
       new_path: finding.file_path,
       new_line: finding.line
     }
   }
   ```
5. Batch in groups of 5, 1-second delay between batches (prevent GitLab rate limiting)
6. Update `pending_reviews`: `status = 'approved'`, `approved_by`, `approved_at = NOW()`
7. Insert into `review_history`: one row per finding. For selected: `was_accepted = true`. For unselected (partial approve): `was_accepted = false`

**Response:** `{ success: true, posted_count: 3, total_findings: 8 }`

### Function 2: `reject-review`

**Endpoint:** `POST /functions/v1/reject-review`

**Request body:**
```json
{
  "review_id": "review-123-42-1709123456789",
  "rejector": "your-gitlab-username"
}
```

**Logic:**
1. Fetch review, validate status
2. POST rejection note to GitLab:
   ```
   POST {GITLAB_URL}/api/v4/projects/{project_id}/merge_requests/{mr_iid}/notes
   Body: { body: "**AI Code Review Rejected** — No inline comments will be posted.\n\nRejected by: @{rejector}" }
   ```
3. Update `pending_reviews`: `status = 'rejected'`, `rejected_by`, `rejected_at = NOW()`
4. Insert all findings into `review_history` with `was_accepted = false`

**Response:** `{ success: true }`

### Function 3: `edit-finding`

**Endpoint:** `POST /functions/v1/edit-finding`

**Request body:**
```json
{
  "review_id": "review-123-42-1709123456789",
  "finding_id": 1,
  "changes": { "severity": "low" }
}
```

**Allowed changes:** `severity`, `title`, `description`

**Logic:**
1. Fetch review, parse `findings` JSONB
2. Find finding by `id`, apply changes
3. If `severity` changed: recalculate `stats` (count each severity) and `review_metadata.risk_score` using weights `{critical: 25, high: 10, medium: 3, low: 1}` capped at 100
4. Update `pending_reviews` with new `findings`, `stats`, `review_metadata`

**Response:** `{ success: true, finding: <updated finding>, stats: <new stats>, risk_score: <new score> }`

### Function 4: `remove-findings`

**Endpoint:** `POST /functions/v1/remove-findings`

**Request body:**
```json
{
  "review_id": "review-123-42-1709123456789",
  "finding_ids": [2, 4]
}
```

**Logic:**
1. Fetch review, parse `findings`
2. Remove findings matching IDs
3. Renumber remaining findings: `id = index + 1` (1-based sequential)
4. Recalculate `stats` and `review_metadata.risk_score`
5. Update `pending_reviews`

**Response:** `{ success: true, remaining_count: 6, stats: <new stats> }`

### Function 5: `add-comment`

**Endpoint:** `POST /functions/v1/add-comment`

**Request body:**
```json
{
  "review_id": "review-123-42-1709123456789",
  "file_path": "src/api/users.js",
  "line": 42,
  "message": "Add input validation here",
  "added_by": "your-gitlab-username"
}
```

**Logic:**
1. Fetch review, parse `custom_comments`
2. Append: `{ file_path, line, message, added_by, added_at: new Date().toISOString() }`
3. Update `pending_reviews.custom_comments`

**Response:** `{ success: true, comment_count: 3 }`

### Function 6: `rerun-agent`

**Endpoint:** `POST /functions/v1/rerun-agent`

**Request body:**
```json
{
  "review_id": "review-123-42-1709123456789",
  "agent_name": "security"
}
```

**Valid agent names:** `security`, `performance`, `style`, `architecture`, `test-coverage`, `code-quality`, `context`

**Logic:**
1. Fetch review from DB
2. Fetch MR diff from GitLab: `GET {GITLAB_URL}/api/v4/projects/{project_id}/merge_requests/{mr_iid}/changes`
3. Build agent-specific system prompt (copy from `workflow-main.json` "Prepare Agent Bodies" node — each agent has a different system message with severity guidelines and output format instructions)
4. Call OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions` with model from `review_metadata.model` or env `OPENROUTER_MODEL`
5. Parse response as JSON array of findings
6. Remove old findings where `category = agent_name`
7. Merge new findings in, sort by severity (critical > high > medium > low)
8. Renumber all findings (1-based)
9. Recalculate `stats` and `review_metadata.risk_score`
10. Update `pending_reviews`

**Response:** `{ success: true, old_count: 3, new_count: 5, findings: <new findings for this agent> }`

**Env needed:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`

---

## Supabase RLS Policies

```sql
-- Authenticated users can read all review data
CREATE POLICY "auth_read_pending_reviews" ON pending_reviews
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_read_review_history" ON review_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_read_agent_runs" ON agent_runs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_read_project_patterns" ON project_patterns
  FOR SELECT USING (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies for authenticated users
-- Edge Functions use service_role key which bypasses RLS entirely
-- n8n workflows use the connection pooler (also bypasses RLS)
```

Enable RLS on all tables: `ALTER TABLE pending_reviews ENABLE ROW LEVEL SECURITY;`

---

## Realtime Subscriptions

### Review List Page

```typescript
// Auto-update when new reviews arrive
supabase
  .channel('new-reviews')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'pending_reviews'
  }, (payload) => {
    // Prepend to review list, show toast: "New review for MR !{mr_iid}"
  })
  .subscribe()
```

### Review Detail Page

```typescript
// Sync if review is modified externally (e.g., via GitLab !command)
supabase
  .channel(`review-${reviewId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'pending_reviews',
    filter: `review_id=eq.${reviewId}`
  }, (payload) => {
    // Refresh findings, stats, status
  })
  .subscribe()
```

---

## Project Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout: header, auth provider
│   │   ├── login/
│   │   │   └── page.tsx               # Email/password login form
│   │   ├── reviews/
│   │   │   ├── page.tsx               # Review list (server component)
│   │   │   └── [id]/
│   │   │       └── page.tsx           # Review detail (two-panel split)
│   │   └── globals.css                # Tailwind imports + custom vars
│   │
│   ├── components/
│   │   ├── review-list-table.tsx      # DataTable with severity badges
│   │   ├── findings-panel.tsx         # Left panel: finding cards + checkboxes
│   │   ├── finding-detail.tsx         # Right panel: full finding view
│   │   ├── action-bar.tsx             # Sticky bottom: approve/reject buttons
│   │   ├── severity-badge.tsx         # Color-coded severity/risk badges
│   │   ├── filter-bar.tsx             # Category + severity filter chips
│   │   ├── add-comment-dialog.tsx     # Modal: file path, line, message
│   │   ├── executive-summary.tsx      # Collapsible summary card
│   │   └── custom-comments-list.tsx   # CTO custom comments display
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser Supabase client (createBrowserClient)
│   │   │   ├── server.ts             # Server component client (createServerClient)
│   │   │   └── middleware.ts          # Auth session refresh
│   │   ├── types.ts                   # TypeScript interfaces (see Data Structures above)
│   │   └── actions.ts                 # Edge Function call wrappers
│   │
│   └── hooks/
│       ├── use-realtime-reviews.ts    # Supabase Realtime for review list
│       └── use-review-detail.ts       # Realtime for single review updates
│
├── supabase/
│   └── functions/
│       ├── approve-review/index.ts
│       ├── reject-review/index.ts
│       ├── edit-finding/index.ts
│       ├── remove-findings/index.ts
│       ├── add-comment/index.ts
│       └── rerun-agent/index.ts
│
├── .env.local.example                 # Template for local env vars
├── middleware.ts                       # Next.js middleware (auth redirect)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Environment Variables

### Frontend (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_GITLAB_URL=https://gitlab.example.com
NEXT_PUBLIC_GITLAB_NAMESPACE=your-group
NEXT_PUBLIC_GITLAB_PROJECT=your-project
```

### Edge Functions (Supabase Dashboard → Edge Functions → Secrets)

```env
GITLAB_URL=https://gitlab.example.com
GITLAB_TOKEN=glpat-xxxxx
OPENROUTER_API_KEY=sk-or-xxxxx
OPENROUTER_MODEL=moonshotai/kimi-k2.5
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

---

## shadcn/ui Components Needed

Install with `npx shadcn@latest add <component>`:

| Component | Where Used |
|-----------|-----------|
| `table` | Review list |
| `badge` | Severity, risk score, status, confidence |
| `card` | Finding cards, executive summary |
| `button` | All actions |
| `checkbox` | Finding selection |
| `select` | Severity editor dropdown, sort |
| `tooltip` | Truncated summary hover |
| `scroll-area` | Left/right panel independent scroll |
| `separator` | Visual dividers |
| `skeleton` | Loading states |
| `toast` / `sonner` | Action confirmations, realtime notifications |
| `alert-dialog` | Reject confirmation |
| `dropdown-menu` | Finding context actions |
| `collapsible` | Executive summary |
| `dialog` | Add comment modal |
| `input` | Comment form inputs |
| `textarea` | Comment message |

---

## Implementation Phases

### Phase 1: Project Setup + Auth
1. `npx create-next-app@latest dashboard --app --ts --tailwind --src-dir`
2. `cd dashboard && npm install @supabase/supabase-js @supabase/ssr`
3. Initialize shadcn: `npx shadcn@latest init`
4. Set up Supabase client (browser + server + middleware)
5. Create login page with email/password form
6. Auth middleware: redirect unauthenticated → `/login`
7. Root layout with minimal header (title + logout)
8. Create CTO user account in Supabase Dashboard

### Phase 2: Review List Page
1. Server component fetching `active_reviews_dashboard` view
2. Install shadcn components: `table`, `badge`, `skeleton`, `card`
3. Build review list table with columns: MR#, Risk, Findings, Confidence, Summary, Age, Action
4. Add severity color badges and risk score coloring
5. Recent decisions section (collapsed by default)
6. Empty state when no pending reviews
7. Realtime subscription for auto-refresh + toast

### Phase 3: Review Detail — Layout + Left Panel
1. Two-panel layout with CSS grid (`grid-cols-[2fr_3fr]`)
2. Top bar: back arrow, MR info, risk/confidence badges, severity pills
3. Executive summary (collapsible)
4. Finding cards with checkboxes in left panel
5. Severity color bars on cards
6. Filter chips: severity multi-select, category multi-select
7. Sort toggle
8. Selection state management

### Phase 4: Review Detail — Right Panel + Actions
1. Finding detail view with all fields
2. Category-specific field rendering (CWE link, impact, auto_fixable, test_example, metrics, related_files)
3. Severity edit dropdown (calls `edit-finding`)
4. Sticky action bar: Select All/Deselect, Approve Selected, Approve All, Reject All
5. Add comment dialog
6. Remove finding button with confirmation
7. Custom comments list

### Phase 5: Edge Functions
1. Set up Supabase CLI: `npm install -g supabase`, `supabase init`, `supabase link`
2. Implement `approve-review` (most critical — GitLab inline comment posting with batching)
3. Implement `reject-review`
4. Implement `edit-finding` + `remove-findings` (JSONB mutation + stats recalc)
5. Implement `add-comment`
6. Implement `rerun-agent` (most complex — OpenRouter integration)
7. Set secrets: `supabase secrets set GITLAB_URL=... GITLAB_TOKEN=... OPENROUTER_API_KEY=...`
8. Deploy: `supabase functions deploy`

### Phase 6: Polish + Deploy
1. Loading states with skeletons for all data fetches
2. Error states with retry buttons
3. Optimistic UI: update local state immediately on action, rollback on error
4. Toast notifications for all action results
5. Realtime subscription on detail page
6. RLS policies (SQL migration)
7. Deploy to Vercel: `npx vercel` or connect GitHub repo
8. Set env vars in Vercel dashboard

---

## Verification Checklist

- [ ] **Auth:** Login → `/reviews`. No auth → redirected to `/login`
- [ ] **Review list:** Shows pending reviews from `active_reviews_dashboard` view
- [ ] **Realtime:** Trigger test MR in GitLab → new review auto-appears in dashboard
- [ ] **Review detail:** Click review → two-panel layout, findings visible, click finding → detail panel
- [ ] **Filters:** Filter by severity/category → list updates correctly
- [ ] **Approve selected:** Select 2 findings → "Approve Selected" → inline comments appear on GitLab MR → review disappears from list
- [ ] **Approve all:** "Approve All" → all findings posted as inline comments → status = approved
- [ ] **Reject:** "Reject All" → confirmation → rejection note posted to GitLab → status = rejected
- [ ] **Edit finding:** Change severity → stats recalculate, risk score updates
- [ ] **Remove finding:** Remove → findings renumber, stats update
- [ ] **Add comment:** Add custom comment → appears in custom comments section → posted with findings on approve
- [ ] **Rerun agent:** Rerun security agent → new findings replace old security findings
- [ ] **Backward compat:** After dashboard approve, `!approve` in GitLab → "no pending review"
- [ ] **Review history:** After approve/reject, `review_history` table has correct `was_accepted` values

---

## Reference Files

| File | What to Reference |
|------|-------------------|
| `database/migration-v3.sql` | `active_reviews_dashboard` view definition (lines 202-221), all table schemas, indexes |
| `workflow-approval.json` | GitLab API patterns for inline comments (position data), all command handler logic to replicate in edge functions |
| `workflow-main.json` | 7 AI agent system prompts in "Prepare Agent Bodies" node (needed for `rerun-agent`), review storage format |
| `config/review-settings.json.example` | Severity weights `{critical:25, high:10, medium:3, low:1}`, output format options |

---

## Known Gaps in Current System (Dashboard Could Fix Later)

1. **`project_patterns` is never auto-populated** — no aggregation pipeline from `review_history` → `project_patterns`
2. **`ignored_patterns` table exists but no UI or workflow integration** — dashboard could add a "manage ignore rules" page
3. **`cto_feedback` table exists but no submission mechanism** — dashboard could add a feedback form
4. **Partial approve doesn't record `review_history`** — the `approve-review` edge function should fix this by recording all findings (accepted + not-accepted)
5. **No analytics** — agent_runs data is collected but not surfaced. Future dashboard page could show trends
