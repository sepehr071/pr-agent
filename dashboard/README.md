# CTO Review Dashboard

Next.js (App Router) + Supabase dashboard for the PR Agent review queue: list pending merge request reviews, inspect findings, and approve, trim or reject them.

- Setup (Supabase, env vars, edge functions): [`SETUP.md`](SETUP.md)
- Design doc: [`../docs/cto-panel.md`](../docs/cto-panel.md)
- Demo without Supabase or GitLab: see "Dashboard demo" in the [root README](../README.md#dashboard-demo-no-supabase-no-gitlab)

```bash
npm install
npm run dev     # needs .env.local, see SETUP.md
npm run build
npm run lint
```
