# PR Agent - n8n UI Setup Guide

## Overview

Step-by-step guide to configure PR Agent directly in the n8n UI (no JSON editing needed).

---

## Part 1: Create Credentials in n8n

### 1.1 GitLab Credential (for Webhook Triggers)

1. In n8n, go to **Credentials** (left sidebar)
2. Click **"Add Credential"**
3. Search for **"GitLab"**
4. Fill in:
   | Field | Value |
   |-------|-------|
   | **Base URL** | `https://your-gitlab.com` |
   | **Access Token** | *(your GitLab Personal Access Token with `api` scope)* |
5. Click **"Save"**
6. Name it: **`GitLab Self-Hosted`**

**Used by:** GitLab MR Trigger, GitLab Note Trigger

---

### 1.2 GitLab Private Token (for API Calls)

1. In n8n, go to **Credentials**
2. Click **"Add Credential"**
3. Search for **"Header Auth"**
4. Fill in:
   | Field | Value |
   |-------|-------|
   | **Name** | `PRIVATE-TOKEN` |
   | **Value** | *(your GitLab Personal Access Token - same as above)* |
5. Click **"Save"**
6. Name it: **`GitLab Private Token`**

**Used by:** All HTTP Request nodes that call GitLab API (Fetch MR, Post Comments, etc.)

---

### 1.3 OpenRouter API (for AI Agents)

1. In n8n, go to **Credentials**
2. Click **"Add Credential"**
3. Search for **"Header Auth"**
4. Fill in:
   | Field | Value |
   |-------|-------|
   | **Name** | `Authorization` |
   | **Value** | `Bearer sk-or-v1-your-key-here` *(include "Bearer " prefix!)* |
5. Click **"Save"**
6. Name it: **`OpenRouter API`**

**Used by:** All 7 AI Agent nodes (Security, Performance, Style, Architecture, Test Coverage, Code Quality, Context Analyzer)

---

### 1.4 Supabase Database (PostgreSQL)

1. In n8n, go to **Credentials**
2. Click **"Add Credential"**
3. Search for **"Postgres"**
4. Fill in:
   | Field | Value |
   |-------|-------|
   | **Host** | `db.xxxxxxxx.supabase.co` *(from Supabase → Settings → Database)* |
   | **Database** | `postgres` |
   | **User** | `postgres` |
   | **Password** | *(your Supabase database password)* |
   | **Port** | `5432` |
   | **SSL** | Select **"Allow"** |
5. Click **"Save"**
6. Name it: **`PostgreSQL`** or **`Supabase DB`**

**Used by:** Store Pending Review, all Fetch/Update nodes in approval workflow

---

## Part 2: Set Environment Variables in n8n

1. In n8n, go to **Settings** → **Variables**
2. Click **"Add Variable"** for each:

| Name | Value | Description |
|------|-------|-------------|
| `GITLAB_URL` | `https://your-gitlab.com` | No trailing slash |
| `GITLAB_NAMESPACE` | `your-group-or-username` | Group/user that owns the project |
| `GITLAB_PROJECT` | `your-project-name` | Project name |
| `OPENROUTER_MODEL` | `anthropic/claude-3.5-sonnet` | AI model to use |
| `APP_URL` | `https://yourcompany.com` | Your company URL |
| `AUTHORIZED_APPROVERS` | `cto,tech-lead,yourname` | Comma-separated GitLab usernames |
| `MIN_SEVERITY` | `low` | Minimum severity: critical/high/medium/low |
| `REVIEW_MODE` | `thorough` | Review depth: thorough/balanced/quick |
| `MAX_FINDINGS_PER_AGENT` | `20` | Cap findings per agent |

---

## Part 3: Import & Configure workflow-main.json

### 3.1 Import the Workflow

1. In n8n, click **"Add workflow"** (or **"+"**)
2. Click the **⋮** menu → **"Import from File"**
3. Select: `workflow-main.json`
4. Click **"Save"**

### 3.2 Connect Credentials to Each Node

After importing, click on each node and select the appropriate credential:

| Node | Credential to Select |
|------|---------------------|
| **GitLab MR Trigger** | `GitLab Self-Hosted` |
| **Fetch MR Diff** | `GitLab Private Token` |
| **Security Review Agent** | `OpenRouter API` |
| **Performance Review Agent** | `OpenRouter API` |
| **Style Review Agent** | `OpenRouter API` |
| **Architecture Review Agent** | `OpenRouter API` |
| **Test Coverage Agent** | `OpenRouter API` |
| **Code Quality Agent** | `OpenRouter API` |
| **Context Analyzer Agent** | `OpenRouter API` |
| **Post Draft Comment to GitLab** | `GitLab Private Token` |
| **Store Pending Review** | `PostgreSQL` (or `Supabase DB`) |

**How to connect:**
1. Click on the node
2. Under **"Credentials"** section, click the dropdown
3. Select the credential you created
4. The node should now show the credential name

---

## Part 4: Import & Configure workflow-approval.json

### 4.1 Import the Workflow

1. In n8n, click **"Add workflow"**
2. Click the **⋮** menu → **"Import from File"**
3. Select: `workflow-approval.json`
4. Click **"Save"**

### 4.2 Connect Credentials to Each Node

| Node | Credential to Select |
|------|---------------------|
| **GitLab Note Trigger** | `GitLab Self-Hosted` |
| **Fetch Review (Approve All)** | `PostgreSQL` |
| **Fetch Review (Partial)** | `PostgreSQL` |
| **Fetch Review (Reject)** | `PostgreSQL` |
| **Fetch Review (Remove)** | `PostgreSQL` |
| **Fetch Review (Edit)** | `PostgreSQL` |
| **Fetch Review (Add Comment)** | `PostgreSQL` |
| **Fetch Review (List)** | `PostgreSQL` |
| **Post Comment (All)** | `GitLab Private Token` |
| **Post Comment (Partial)** | `GitLab Private Token` |
| **Confirm Approve All** | `GitLab Private Token` |
| **Confirm Partial Approve** | `GitLab Private Token` |
| **Post Rejection** | `GitLab Private Token` |
| **Post Remove Confirmation** | `GitLab Private Token` |
| **Post Edit Confirmation** | `GitLab Private Token` |
| **Post Add Confirmation** | `GitLab Private Token` |
| **Post Findings List** | `GitLab Private Token` |
| **Post Error** | `GitLab Private Token` |
| **Post Unauthorized** | `GitLab Private Token` |
| **Update Status: Approved All** | `PostgreSQL` |
| **Update Status: Approved Partial** | `PostgreSQL` |
| **Update Status: Rejected** | `PostgreSQL` |
| **Update Findings (Remove)** | `PostgreSQL` |
| **Update Findings (Edit)** | `PostgreSQL` |
| **Update Custom Comments** | `PostgreSQL` |

---

## Part 5: Setup Supabase Database

### 5.1 Create Supabase Project

1. Go to **https://supabase.com**
2. Sign up / Log in
3. Click **"New Project"**
4. Fill in:
   - **Name:** `gitlab-reviews`
   - **Database Password:** Create a strong password (⚠️ **SAVE THIS!**)
   - **Region:** Choose closest to your GitLab server
5. Click **"Create new project"**
6. Wait 2-3 minutes for setup

### 5.2 Create the pending_reviews Table

1. In Supabase dashboard, click **"SQL Editor"** (left sidebar)
2. Click **"New query"**
3. Paste this SQL:

```sql
-- Main table for storing reviews
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

-- Create indexes for performance
CREATE INDEX idx_pending_reviews_review_id ON pending_reviews(review_id);
CREATE INDEX idx_pending_reviews_status ON pending_reviews(status);
CREATE INDEX idx_pending_reviews_mr ON pending_reviews(project_id, mr_iid);
```

4. Click **"Run"** (or Ctrl+Enter)
5. You should see ✅ "Success. No rows returned"

### 5.3 Run the v3.0 Migration (Optional - for Learning Features)

1. In Supabase SQL Editor, click **"New query"**
2. Open the file `database/migration-v3.sql` from your project
3. Copy all the SQL and paste it into the editor
4. Click **"Run"**

This adds:
- Enhanced columns to `pending_reviews` (confidence_score, review_metadata)
- 5 new tables for learning system
- Helper functions and dashboard views

### 5.4 Get Database Connection Info (if not already done)

1. In Supabase, go to **Settings** → **Database**
2. Scroll to **"Connection parameters"**
3. Note the **Host** value (for n8n credential setup)

---

## Part 6: Configure GitLab Webhooks

### 6.1 Get the Webhook URLs from n8n

**For Main Workflow:**
1. Open **workflow-main.json** in n8n
2. Click on the **"GitLab MR Trigger"** node
3. Look for **"Webhook URLs"** section
4. Copy the **Production URL**

**For Approval Workflow:**
1. Open **workflow-approval.json** in n8n
2. Click on the **"GitLab Note Trigger"** node
3. Copy the **Production URL**

### 6.2 Add Webhooks in GitLab

1. Go to your GitLab project
2. Go to **Settings** → **Webhooks**
3. Click **"Add new webhook"**

**Webhook 1 - For MR Events:**
| Field | Value |
|-------|-------|
| **URL** | *(paste Main Workflow webhook URL)* |
| **Secret token** | *(optional - leave blank for now)* |
| **Trigger** | ✅ **Merge request events** |
| **SSL verification** | ✅ Enable |
4. Click **"Add webhook"**

**Webhook 2 - For Comment Events:**
1. Click **"Add new webhook"** again
| Field | Value |
|-------|-------|
| **URL** | *(paste Approval Workflow webhook URL)* |
| **Secret token** | *(optional)* |
| **Trigger** | ✅ **Comments** |
| **SSL verification** | ✅ Enable |
2. Click **"Add webhook"**

---

## Part 7: Activate Workflows

1. In n8n, open **workflow-main.json**
2. Toggle **"Active"** switch (top right) → **ON** (green)
3. Open **workflow-approval.json**
4. Toggle **"Active"** → **ON**

Both workflows should now show as **Active**.

---

## Part 8: Test the Setup

### 8.1 Create a Test MR

1. Go to your GitLab project
2. Create a new branch with some code changes
3. Create a **Merge Request**

### 8.2 Wait for Review

1. Wait **30-60 seconds**
2. Refresh the MR page
3. You should see a draft comment with AI findings

### 8.3 Test Approval Commands

Reply to the draft comment with:
- `!approve` - Posts all findings as inline comments
- `!reject` - Discards the review
- `!approve-partial 1,2,3` - Posts only selected findings
- `!list-findings` - Shows all findings again

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook not triggering | Check GitLab webhook shows green checkmark |
| Database connection error | Verify SSL is "Allow" in n8n credential |
| OpenRouter API error | Check "Bearer " prefix in API key |
| Inline comments not appearing | Check GitLab token has `api` scope |

---

## Summary Checklist

- [ ] 4 credentials created in n8n
- [ ] 9 environment variables set
- [ ] Both workflows imported
- [ ] All nodes connected to credentials
- [ ] Supabase database table created
- [ ] GitLab webhooks configured (2)
- [ ] Both workflows activated
- [ ] Test MR created and reviewed
