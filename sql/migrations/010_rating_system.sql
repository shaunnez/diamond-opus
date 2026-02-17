-- Migration 010: Diamond Rating System
-- Adds pricing_rating column, rating_rules table, and rating reapply infrastructure

-- 1. Add pricing_rating column to diamonds and backfill from rating
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS pricing_rating integer;

-- Backfill pricing_rating from existing rating values (pricing-derived rating)
UPDATE diamonds SET pricing_rating = rating WHERE rating IS NOT NULL;

-- Clear rating column so it can be used for quality rating from rating rules
-- (existing pricing code will be updated to use pricing_rating instead)
UPDATE diamonds SET rating = NULL WHERE rating IS NOT NULL;

-- 2. Create rating_rules table (mirrors pricing_rules structure)
CREATE TABLE IF NOT EXISTS rating_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  price_min numeric(12,2),
  price_max numeric(12,2),
  shape text[],
  color text[],
  clarity text[],
  cut text[],
  feed text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for rating_rules
CREATE INDEX IF NOT EXISTS idx_rating_rules_active_priority
  ON rating_rules (priority ASC)
  WHERE active = TRUE;

-- 3. Create rating_reapply_jobs table (mirrors pricing_reapply_jobs)
CREATE TABLE IF NOT EXISTS rating_reapply_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'reverted')),
  total_diamonds integer NOT NULL DEFAULT 0,
  processed_diamonds integer NOT NULL DEFAULT 0,
  updated_diamonds integer NOT NULL DEFAULT 0,
  failed_diamonds integer NOT NULL DEFAULT 0,
  feeds_affected text[] NOT NULL DEFAULT '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  retry_count integer NOT NULL DEFAULT 0,
  last_progress_at timestamptz,
  next_retry_at timestamptz,
  trigger_type text CHECK (trigger_type IN ('manual', 'rule_create', 'rule_update')),
  triggered_by_rule_id uuid,
  trigger_rule_snapshot jsonb
);

-- Indexes for rating_reapply_jobs
CREATE INDEX IF NOT EXISTS idx_rating_reapply_jobs_status
  ON rating_reapply_jobs (status);

CREATE INDEX IF NOT EXISTS idx_rating_reapply_jobs_monitoring
  ON rating_reapply_jobs (status, last_progress_at, next_retry_at);

-- 4. Create rating_reapply_snapshots table (mirrors pricing_reapply_snapshots)
CREATE TABLE IF NOT EXISTS rating_reapply_snapshots (
  job_id uuid NOT NULL REFERENCES rating_reapply_jobs(id) ON DELETE CASCADE,
  diamond_id uuid NOT NULL,
  feed text NOT NULL,
  old_rating integer,
  new_rating integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, diamond_id)
);

-- Index for snapshot lookups by job
CREATE INDEX IF NOT EXISTS idx_rating_reapply_snapshots_job
  ON rating_reapply_snapshots (job_id);
