-- Migration: Add pricing reapply jobs and snapshots tables
-- Supports async repricing of available diamonds with progress tracking and revert

-- Table 1: Job tracking
CREATE TABLE pricing_reapply_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'reverted')),
    total_diamonds INTEGER NOT NULL DEFAULT 0,
    processed_diamonds INTEGER NOT NULL DEFAULT 0,
    failed_diamonds INTEGER NOT NULL DEFAULT 0,
    feeds_affected TEXT[] NOT NULL DEFAULT '{}',
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reverted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: Per-diamond snapshots for revert
CREATE TABLE pricing_reapply_snapshots (
    job_id UUID NOT NULL REFERENCES pricing_reapply_jobs(id) ON DELETE CASCADE,
    diamond_id UUID NOT NULL,
    feed TEXT NOT NULL,
    old_price_model_price NUMERIC(12,2) NOT NULL,
    old_markup_ratio NUMERIC(5,4),
    old_rating INTEGER,
    new_price_model_price NUMERIC(12,2) NOT NULL,
    new_markup_ratio NUMERIC(5,4),
    new_rating INTEGER,
    PRIMARY KEY (job_id, diamond_id)
);

CREATE INDEX idx_pricing_reapply_snapshots_job ON pricing_reapply_snapshots(job_id);
