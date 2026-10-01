-- =====================================================
-- GitLab MR Review System - Database Migration v3.0
-- Enhanced PR Agent with Learning and Context Support
-- =====================================================

-- Enable pgcrypto for calculate_pattern_hash function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add new columns to existing pending_reviews table
ALTER TABLE pending_reviews
ADD COLUMN IF NOT EXISTS context_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS file_analysis JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS review_metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS base_sha VARCHAR(64),
ADD COLUMN IF NOT EXISTS head_sha VARCHAR(64),
ADD COLUMN IF NOT EXISTS start_sha VARCHAR(64),
ADD COLUMN IF NOT EXISTS custom_comments JSONB DEFAULT '[]';

-- Create index on confidence_score for filtering
CREATE INDEX IF NOT EXISTS idx_pending_reviews_confidence ON pending_reviews(confidence_score)
WHERE confidence_score IS NOT NULL;

-- Create index on review_metadata for querying
CREATE INDEX IF NOT EXISTS idx_pending_reviews_metadata ON pending_reviews USING GIN(review_metadata);


-- =====================================================
-- Review History Table (for Learning System)
-- =====================================================

-- Stores historical review data for pattern learning
-- Allows the system to learn which findings are accepted/rejected
CREATE TABLE IF NOT EXISTS review_history (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    mr_iid INTEGER NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    issue_type VARCHAR(100) NOT NULL,        -- e.g., security, performance, etc.
    issue_subcategory VARCHAR(100),           -- e.g., sql-injection, n-plus-one, etc.
    pattern_hash VARCHAR(64),                 -- Hash of the code pattern for deduplication
    severity VARCHAR(20),                     -- critical, high, medium, low
    finding_data JSONB,                       -- Full finding details for analysis
    was_accepted BOOLEAN,                     -- Whether CTO approved this finding
    was_fixed BOOLEAN DEFAULT NULL,           -- Whether the issue was fixed
    created_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    review_id VARCHAR(255)                    -- Reference to original review
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_review_history_project ON review_history(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_review_history_pattern ON review_history(pattern_hash) WHERE pattern_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_history_type ON review_history(issue_type, issue_subcategory);
CREATE INDEX IF NOT EXISTS idx_review_history_accepted ON review_history(was_accepted) WHERE was_accepted IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_history_created ON review_history(created_at DESC);


-- =====================================================
-- Project Patterns Table (Context Awareness)
-- =====================================================

-- Stores learned patterns per project
-- Helps the AI understand project-specific conventions
CREATE TABLE IF NOT EXISTS project_patterns (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    patterns JSONB NOT NULL,                   -- Learned patterns
        -- Structure:
        -- {
        --   "accepted_patterns": [...],
        --   "rejected_patterns": [...],
        --   "false_positives": [...],
        --   "conventions": {
        --     "naming": "camelCase",
        --     "testing": "jest",
        --     "architecture": "mvc"
        --   },
        --   "common_ignore_rules": [...]
        -- }
    last_updated TIMESTAMP DEFAULT NOW(),
    total_reviews INTEGER DEFAULT 0,
    accepted_findings INTEGER DEFAULT 0,
    rejected_findings INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_patterns_project ON project_patterns(project_id);


-- =====================================================
-- Ignored Patterns Table (for Auto-Ignore)
-- =====================================================

-- Stores patterns that should be automatically ignored
-- Configured by CTO via commands like /ignore-pattern
CREATE TABLE IF NOT EXISTS ignored_patterns (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    pattern_type VARCHAR(100) NOT NULL,        -- e.g., todo-comment, debug-log, etc.
    pattern_regex VARCHAR(512),                -- Regex pattern to match
    added_by VARCHAR(255),                     -- GitLab username
    reason TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_ignored_patterns_project ON ignored_patterns(project_id, is_active);


-- =====================================================
-- Agent Runs Table (for Performance Tracking)
-- =====================================================

-- Tracks agent execution metrics for optimization
CREATE TABLE IF NOT EXISTS agent_runs (
    id SERIAL PRIMARY KEY,
    review_id VARCHAR(255) NOT NULL,
    agent_name VARCHAR(100) NOT NULL,          -- e.g., security, performance, etc.
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    tokens_used INTEGER,
    findings_count INTEGER,
    error_message TEXT,
    status VARCHAR(50) DEFAULT 'running'       -- running, completed, failed, timeout
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_review ON agent_runs(review_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);


-- =====================================================
-- CTO Feedback Table (for Continuous Improvement)
-- =====================================================

-- Stores explicit CTO feedback on reviews
-- Used to improve agent prompts and behavior
CREATE TABLE IF NOT EXISTS cto_feedback (
    id SERIAL PRIMARY KEY,
    review_id VARCHAR(255) NOT NULL,
    project_id INTEGER NOT NULL,
    mr_iid INTEGER NOT NULL,
    feedback_type VARCHAR(100) NOT NULL,       -- finding-accuracy, false-positive, missing-issue, etc.
    feedback TEXT NOT NULL,
    severity VARCHAR(20),                       -- critical, high, medium, low (for prioritizing improvements)
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cto_feedback_project ON cto_feedback(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cto_feedback_type ON cto_feedback(feedback_type, severity);


-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to calculate pattern hash (simplified)
CREATE OR REPLACE FUNCTION calculate_pattern_hash(code_snippet TEXT, issue_type VARCHAR)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(issue_type || ':' || substring(code_snippet, 1, 1000), 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get project statistics
CREATE OR REPLACE FUNCTION get_project_stats(p_project_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_reviews', COUNT(DISTINCT rh.review_id),
        'accepted_findings', COUNT(*) FILTER (WHERE rh.was_accepted = TRUE),
        'rejected_findings', COUNT(*) FILTER (WHERE rh.was_accepted = FALSE),
        'most_common_issues', (
            SELECT jsonb_agg(jsonb_build_object('type', issue_type, 'count', cnt))
            FROM (
                SELECT issue_type, COUNT(*) as cnt
                FROM review_history
                WHERE project_id = p_project_id
                GROUP BY issue_type
                ORDER BY cnt DESC
                LIMIT 5
            ) sub
        )
    ) INTO v_stats
    FROM review_history rh
    WHERE rh.project_id = p_project_id;

    RETURN COALESCE(v_stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- View: Active Reviews Dashboard
-- =====================================================

-- Dashboard view for CTO to see pending reviews
CREATE OR REPLACE VIEW active_reviews_dashboard AS
SELECT
    pr.review_id,
    pr.mr_iid,
    pr.project_id,
    pr.status,
    pr.created_at,
    pr.confidence_score,
    (pr.review_metadata->>'risk_score')::INTEGER AS risk_score,
    (pr.review_metadata->>'executive_summary')::TEXT AS executive_summary,
    (pr.stats->>'total')::INTEGER AS total_findings,
    (pr.stats->>'critical')::INTEGER AS critical_findings,
    (pr.stats->>'high')::INTEGER AS high_findings,
    (pr.approved_by) AS approved_by
FROM pending_reviews pr
WHERE pr.status IN ('pending_approval', 'changes_requested')
ORDER BY
    (pr.stats->>'critical')::INTEGER DESC,
    (pr.stats->>'high')::INTEGER DESC,
    pr.created_at ASC;


-- =====================================================
-- Verification Queries
-- =====================================================

-- Run these after migration to verify setup:

-- 1. Check new columns on pending_reviews
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'pending_reviews'
-- AND column_name IN ('context_data', 'file_analysis', 'confidence_score', 'review_metadata');

-- 2. Check new tables were created
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('review_history', 'project_patterns', 'ignored_patterns', 'agent_runs', 'cto_feedback');

-- 3. View functions
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('calculate_pattern_hash', 'get_project_stats');


-- =====================================================
-- Rollback Commands (if needed)
-- =====================================================

-- To rollback this migration, run:
-- DROP VIEW IF EXISTS active_reviews_dashboard;
-- DROP FUNCTION IF EXISTS get_project_stats;
-- DROP FUNCTION IF EXISTS calculate_pattern_hash;
-- DROP TABLE IF EXISTS cto_feedback;
-- DROP TABLE IF EXISTS agent_runs;
-- DROP TABLE IF EXISTS ignored_patterns;
-- DROP TABLE IF EXISTS project_patterns;
-- DROP TABLE IF EXISTS review_history;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS context_data;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS file_analysis;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS confidence_score;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS review_metadata;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS base_sha;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS head_sha;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS start_sha;
-- ALTER TABLE pending_reviews DROP COLUMN IF EXISTS custom_comments;
-- DROP INDEX IF EXISTS idx_pending_reviews_confidence;
-- DROP INDEX IF EXISTS idx_pending_reviews_metadata;
