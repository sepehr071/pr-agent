# GitLab MR Multi-Agent Code Review - Setup Guide

> Complete guide to set up **AI-powered code review for GitLab** using Supabase + n8n Cloud

## Overview

This workflow automatically reviews GitLab Merge Requests using **7 AI agents**:
- **Security** - OWASP Top 10, SQL injection, XSS, auth flaws, secrets, CWE mapping
- **Performance** - N+1 queries, complexity analysis, memory leaks, impact estimation
- **Style** - Naming conventions, formatting, documentation, auto-fixable detection
- **Architecture** - SOLID principles, design patterns, coupling/cohesion analysis
- **Test Coverage** - Missing tests, edge cases, error handling, test examples
- **Code Quality** - Cyclomatic complexity, code smells, maintainability metrics
- **Context Analyzer** - File relationships, missing imports, breaking changes, consistency

### v3.0 New Features
- **Enhanced AI Prompts** - 200+ word detailed prompts with specific severity criteria
- **Executive Summary** - Risk assessment, recommendation, critical issues highlight
- **Risk Score (0-100)** - Calculated from severity × confidence weights
- **Confidence Scoring** - Per-finding confidence (high/medium/low) with overall percentage
- **Language Detection** - Auto-detects programming languages for better analysis
- **Configurable Thresholds** - Filter findings by minimum severity level
- **CWE Links** - Security findings link to MITRE CWE database
- **Learning System** - Tracks CTO approvals/rejections for pattern learning

Reviews require CTO approval before posting inline comments. CTO has full control to edit, remove, or add findings before approving.

---

## Prerequisites

| Service | Sign Up | Free Tier |
|---------|---------|-----------|
| **Supabase** | https://supabase.com | ✅ 500MB database |
| **n8n Cloud** | https://app.n8n.cloud | ✅ 5 workflows |
| **OpenRouter** | https://openrouter.ai | ✅ Free credits |
| **GitLab** | Your self-hosted instance | - |

---

## Step 1: Create Supabase Project

### 1.1 Sign Up
1. Go to **https://supabase.com**
2. Click **"Start your project"** → Sign up with GitHub/Email

### 1.2 Create New Project
1. Click **"New Project"**
2. Fill in:
   - **Name:** `gitlab-reviews`
   - **Database Password:** Create a strong password (⚠️ **SAVE THIS!**)
   - **Region:** Choose closest to your GitLab server
3. Click **"Create new project"**
4. Wait 2-3 minutes for setup

### 1.3 Create Database Table
1. In Supabase dashboard, click **"SQL Editor"** (left sidebar)
2. Click **"New query"**
3. Paste this SQL:

```sql
-- Create table for storing pending reviews
CREATE TABLE pending_reviews (
    id SERIAL PRIMARY KEY,
    review_id VARCHAR(255) UNIQUE NOT NULL,
    mr_iid INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    findings JSONB NOT NULL,
    stats JSONB,
    draft_note_id INTEGER,
    base_sha VARCHAR(64),
    head_sha VARCHAR(64),
    start_sha VARCHAR(64),
    status VARCHAR(50) DEFAULT 'pending_approval',
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    rejected_by VARCHAR(255),
    rejected_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX idx_pending_reviews_review_id ON pending_reviews(review_id);
CREATE INDEX idx_pending_reviews_status ON pending_reviews(status);
CREATE INDEX idx_pending_reviews_mr ON pending_reviews(project_id, mr_iid);
```

4. Click **"Run"** (or press Ctrl+Enter)
5. You should see ✅ "Success. No rows returned"

### 1.4 Get Database Connection Info
1. Go to **Settings** → **Database** (left sidebar)
2. Scroll to **"Connection parameters"**
3. Note down these values:

| Parameter | Example Value |
|-----------|---------------|
| **Host** | `db.abcdefgh.supabase.co` |
| **Port** | `5432` |
| **Database** | `postgres` |
| **User** | `postgres` |
| **Password** | *(the one you set in step 1.2)* |

---

## Step 2: Get API Keys

### 2.1 GitLab Personal Access Token
1. Go to your GitLab instance
2. Click your **Profile picture** → **Preferences**
3. Go to **Access Tokens** (left sidebar)
4. Create new token:
   - **Name:** `n8n-mr-review`
   - **Expiration:** Set as needed (or leave blank for no expiry)
   - **Scopes:** ✅ `api` (this is required!)
5. Click **"Create personal access token"**
6. ⚠️ **Copy the token immediately** (you won't see it again!)

### 2.2 OpenRouter API Key
1. Go to **https://openrouter.ai**
2. Sign up / Log in
3. Go to **Keys** → **"Create Key"**
4. Copy the key (starts with `sk-or-`)

---

## Step 3: Set Up n8n Cloud

### 3.1 Create Account
1. Go to **https://app.n8n.cloud**
2. Sign up for free account
3. Your instance URL will be: `https://yourname.app.n8n.cloud`

### 3.2 Add Credentials

Go to **Credentials** in the left sidebar and add these:

#### A) Supabase Database (PostgreSQL)
1. Click **"Add Credential"**
2. Search for **"Postgres"**
3. Fill in:
   - **Host:** `db.xxxxxxxx.supabase.co` *(from Step 1.4)*
   - **Database:** `postgres`
   - **User:** `postgres`
   - **Password:** *(your Supabase password)*
   - **SSL:** Select **"Allow"**
4. Click **"Save"**
5. Name it: `Supabase DB`

#### B) GitLab API
1. Click **"Add Credential"**
2. Search for **"GitLab"**
3. Fill in:
   - **Base URL:** `https://your-gitlab.com` *(your GitLab URL)*
   - **Access Token:** *(your GitLab token from Step 2.1)*
4. Click **"Save"**
5. Name it: `GitLab`

#### C) GitLab Header Auth (for API calls)
1. Click **"Add Credential"**
2. Search for **"Header Auth"**
3. Fill in:
   - **Name:** `PRIVATE-TOKEN`
   - **Value:** *(your GitLab token from Step 2.1)*
4. Click **"Save"**
5. Name it: `GitLab Token`

#### D) OpenRouter API
1. Click **"Add Credential"**
2. Search for **"Header Auth"**
3. Fill in:
   - **Name:** `Authorization`
   - **Value:** `Bearer sk-or-v1-your-key-here` *(include "Bearer " prefix!)*
4. Click **"Save"**
5. Name it: `OpenRouter API`

### 3.3 Add Environment Variables

1. Go to **Settings** → **Variables**
2. Add these variables:

| Name | Value | Description |
|------|-------|-------------|
| `GITLAB_URL` | `https://your-gitlab.com` | Your GitLab URL (no trailing slash) |
| `GITLAB_NAMESPACE` | `your-group` | Group or username |
| `GITLAB_PROJECT` | `your-project` | Project name |
| `OPENROUTER_MODEL` | `anthropic/claude-3.5-sonnet` | AI model to use |
| `APP_URL` | `https://yourcompany.com` | Your company URL |
| `AUTHORIZED_APPROVERS` | `cto,tech-lead,yourname` | GitLab usernames who can approve |
| `MIN_SEVERITY` | `low` | Minimum severity to report (critical/high/medium/low) |
| `REVIEW_MODE` | `thorough` | Review depth (thorough/balanced/quick) |
| `MAX_FINDINGS_PER_AGENT` | `20` | Cap findings per agent to reduce noise |

---

## Step 4: Import Workflows

### 4.1 Import Main Workflow
1. In n8n, click **"Add workflow"** (top right)
2. Click the **⋮** menu → **"Import from File"**
3. Select: `workflow-main.json`
4. Click **"Save"**

### 4.2 Import Approval Workflow
1. Click **"Add workflow"** again
2. Import: `workflow-approval.json`
3. Click **"Save"**

### 4.3 Connect Credentials to Nodes

For **each workflow**, you need to connect your credentials:

#### In workflow-main (v3.0 - Enhanced):
| Node | Credential to Select |
|------|---------------------|
| GitLab MR Trigger | `GitLab` |
| Fetch MR Diff | `GitLab Token` |
| Security Review Agent | `OpenRouter API` |
| Performance Review Agent | `OpenRouter API` |
| Style Review Agent | `OpenRouter API` |
| Architecture Review Agent | `OpenRouter API` |
| Test Coverage Agent | `OpenRouter API` |
| Code Quality Agent | `OpenRouter API` |
| **Context Analyzer Agent** | `OpenRouter API` (NEW v3.0) |
| Post Draft Comment to GitLab | `GitLab Token` |
| Store Pending Review | `Supabase DB` |

#### In workflow-approval:
| Node | Credential to Select |
|------|---------------------|
| GitLab Note Trigger | `GitLab` |
| All "Fetch Review (*)" nodes | `Supabase DB` |
| All "Post *" nodes | `GitLab Token` |
| All "Update *" nodes | `Supabase DB` |

> **Note:** The approval workflow has multiple paths for different commands. Each path has similar nodes that need the same credentials.

---

## Step 5: Get Webhook URLs

### 5.1 Main Workflow Webhook
1. Open **"GitLab MR Multi-Agent Code Review"** workflow
2. Click on the **"GitLab MR Trigger"** node
3. Look for **"Webhook URLs"** section
4. Copy the **Production URL** (looks like `https://xxx.app.n8n.cloud/webhook/abc123`)

### 5.2 Approval Workflow Webhook
1. Open **"GitLab MR Review - CTO Approval Handler"** workflow
2. Click on the **"GitLab Note Trigger"** node
3. Copy the **Production URL**

---

## Step 6: Configure GitLab Webhooks

1. Go to your GitLab project
2. Navigate to **Settings** → **Webhooks**

### 6.1 Add MR Events Webhook
1. Click **"Add new webhook"**
2. Fill in:
   - **URL:** *(paste Main Workflow webhook URL from Step 5.1)*
   - **Secret token:** *(optional)*
   - **Trigger:** ✅ **Merge request events**
   - **SSL verification:** ✅ Enable
3. Click **"Add webhook"**

### 6.2 Add Comment Events Webhook
1. Click **"Add new webhook"** again
2. Fill in:
   - **URL:** *(paste Approval Workflow webhook URL from Step 5.2)*
   - **Secret token:** *(optional)*
   - **Trigger:** ✅ **Comments**
   - **SSL verification:** ✅ Enable
3. Click **"Add webhook"**

---

## Step 7: Activate Workflows

1. Go back to n8n
2. Open **workflow-main**
3. Toggle **"Active"** switch (top right) → **ON** (green)
4. Open **workflow-approval**
5. Toggle **"Active"** → **ON**

Both workflows should now show as **Active**.

---

## Step 8: Test the Setup

### 8.1 Create a Test MR
1. Go to your GitLab project
2. Create a new branch with some code changes
3. Create a **Merge Request**

### 8.2 Wait for Review
1. Wait **30-60 seconds**
2. Refresh the MR page
3. You should see a comment like:

```
## 🤖 AI Code Review - Pending CTO Approval

**MR:** !1 - Test merge request
**Files Changed:** 3 (+50/-10)

### 📊 Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 3 |
| ⚪ Low | 1 |

...

### ✅ CTO Action Required
Reply to this comment with:
- `!approve` - Post all inline comments
- `!reject` - Discard this review
```

### 8.3 Test Approval
1. Reply to the comment with: `!approve`
2. Wait a few seconds
3. Inline comments should appear on specific lines!

### 8.4 Test Rejection (Optional)
1. Create another MR
2. When draft comment appears, reply: `!reject`
3. Review should be discarded

---

## CTO Commands Reference

The CTO (or any authorized approver) can use these commands by replying to the AI review draft comment:

### Basic Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!approve` | Post **all** findings as inline comments | `!approve` |
| `!reject` | Discard all findings, post nothing | `!reject` |
| `!list-findings` | Re-display current findings list | `!list-findings` |

### Selection Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!approve-partial 1,3,5` | Post only selected findings | `!approve-partial 1,2,5-8` |
| `!remove-finding 2,4` | Remove findings from list | `!remove-finding 3,6,7` |

**Range notation:** Use `5-8` to select findings 5, 6, 7, 8.

### Edit Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!edit-finding N severity:X` | Change severity level | `!edit-finding 3 severity:low` |
| `!edit-finding N title:"X"` | Change title | `!edit-finding 1 title:"Consider caching"` |
| `!add-comment file:line "msg"` | Add custom inline comment | `!add-comment src/api.js:42 "Add input validation"` |

### Example Workflow

```
1. AI posts draft with 10 findings

2. CTO reviews and makes adjustments:
   !remove-finding 8,9,10          ← Remove less important findings
   !edit-finding 3 severity:medium ← Downgrade severity
   !add-comment db.js:55 "Add index for performance"  ← Add own comment

3. CTO approves selected findings:
   !approve-partial 1,2,3,4,5      ← Post only findings 1-5 + custom comment
```

### Severity Levels
- `critical` - Must fix before merge
- `high` - Should fix before merge
- `medium` - Consider fixing
- `low` - Nice to have

---

## Troubleshooting

### Webhook not triggering?
- Check GitLab webhook shows ✅ green checkmark in recent deliveries
- Verify n8n workflows are **Active**
- Check webhook URL is correct (no typos)

### Database connection error?
- Verify Supabase password is correct
- Make sure SSL is set to **"Allow"** in n8n
- Check Supabase project is not paused (free tier pauses after inactivity)

### OpenRouter API error?
- Check API key includes `Bearer ` prefix
- Verify you have credits on OpenRouter
- Try a different model if rate limited

### Inline comments not appearing?
- Check GitLab token has `api` scope
- Verify the diff positions are correct
- Check n8n execution logs for errors

### Reviews not stored in database?
- Verify table was created correctly
- Check Supabase connection in n8n
- Look at execution logs for SQL errors

---

## Cost Breakdown

| Service | Free Tier | Paid (if needed) |
|---------|-----------|------------------|
| **Supabase** | 500MB, 50K requests/month | $25/month |
| **n8n Cloud** | 5 active workflows | $20/month |
| **OpenRouter** | ~$5 free credits | Pay as you go (~$0.01-0.03/review) |

**Estimated cost for 100 reviews/month:** ~$3-5 (mostly OpenRouter API)

---

## Database Migration (v3.0)

If upgrading from an earlier version, run the migration in Supabase SQL Editor:

```bash
# Run the v3.0 migration
database/migration-v3.sql
```

This adds:
- Enhanced columns to `pending_reviews` (confidence_score, review_metadata, etc.)
- New tables: `review_history`, `project_patterns`, `ignored_patterns`, `agent_runs`, `cto_feedback`
- Helper functions and dashboard views

---

## Upgrading from v1 to v2

If you already have the workflow running, run this migration in Supabase SQL Editor:

```sql
-- Run config/migration-v2.sql
ALTER TABLE pending_reviews
ADD COLUMN IF NOT EXISTS custom_comments JSONB DEFAULT '[]';
```

Then re-import both workflow JSON files in n8n.

---

## Files Reference

```
pr-agent/
├── workflow-main.json              # Main review workflow (v3.0 - Enhanced)
├── workflow-approval.json          # CTO approval handler
├── SETUP-GUIDE.md                  # This file
├── config/
│   └── review-settings.json.example  # Configuration template
└── database/
    └── migration-v3.sql             # Database migration for v3.0
```

---

## Support

If you encounter issues:
1. Check n8n execution logs for detailed errors
2. Verify all credentials are correctly configured
3. Test webhooks using GitLab's "Test" button
4. Check Supabase logs for database issues

---

*Last updated: February 2026 (v3.0.0 - Enhanced AI Prompts + Context Analyzer)*
