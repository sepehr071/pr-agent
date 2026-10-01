# CTO Review Dashboard — Setup Guide

## Prerequisites

- Node.js 18+
- A Supabase project (with the PR Agent database already migrated via `migration-v3.sql`)
- GitLab API token with `api` scope

---

## 1. Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # Supabase Dashboard → Settings → API → anon public
NEXT_PUBLIC_GITLAB_URL=https://gitlab.example.com
NEXT_PUBLIC_GITLAB_NAMESPACE=your-group
NEXT_PUBLIC_GITLAB_PROJECT=your-project
```

## 2. Create a Login Account

Go to **Supabase Dashboard → Authentication → Users → Add User** and create an account with email + password. This is what you'll use to log in.

## 3. Run RLS Policies

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
ALTER TABLE pending_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_pending_reviews" ON pending_reviews
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_review_history" ON review_history
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_agent_runs" ON agent_runs
  FOR SELECT USING (auth.role() = 'authenticated');
```

> **Note:** This won't affect the existing n8n workflows — they use the connection pooler which bypasses RLS. Edge Functions use the `service_role` key which also bypasses RLS.

## 4. Deploy Edge Functions

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Link to your project
supabase init
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set GITLAB_URL=https://gitlab.example.com
supabase secrets set GITLAB_TOKEN=glpat-xxxxx

# Deploy both functions
supabase functions deploy approve-review
supabase functions deploy reject-review
```

Find your project ref in **Supabase Dashboard → Settings → General → Reference ID**.

## 5. Start the Dashboard

```bash
npm install   # first time only
npm run dev
```

Open **http://localhost:3000** → log in → you'll see pending reviews.

---

## Production Deployment (Vercel)

```bash
npm run build    # verify build passes
npx vercel       # deploy to Vercel
```

Set the same env vars in **Vercel Dashboard → Settings → Environment Variables**.

---

## How It Works

```
Login (/login)  →  Review List (/reviews)  →  Review Detail (/reviews/[id])
                                                    ↓
                                          Approve / Reject
                                                    ↓
                                    Edge Function → GitLab inline comments
                                                  → Supabase status update
                                                  → Review history recorded
```

- **Review List** reads from the `active_reviews_dashboard` Supabase view
- **Approve** posts findings as inline comments on the GitLab MR via the Discussions API
- **Reject** posts a rejection note on the MR
- Both record findings in `review_history` for the learning system
- The existing GitLab `!command` workflow still works alongside the dashboard
