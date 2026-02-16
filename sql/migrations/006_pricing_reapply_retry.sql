-- Migration: Add retry and monitoring columns to pricing_reapply_jobs
-- Description: Enables automatic retry and stall detection for pricing reapply jobs
-- Date: 2026-02-16

-- Add retry tracking columns
ALTER TABLE pricing_reapply_jobs
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN last_progress_at TIMESTAMPTZ,
ADD COLUMN next_retry_at TIMESTAMPTZ;

-- Add index for monitoring queries (stalled jobs and retryable jobs)
CREATE INDEX idx_pricing_reapply_jobs_monitor
  ON pricing_reapply_jobs(status, last_progress_at, next_retry_at)
  WHERE status IN ('running', 'failed');

-- Add comment for documentation
COMMENT ON COLUMN pricing_reapply_jobs.retry_count IS 'Number of retry attempts (max 3)';
COMMENT ON COLUMN pricing_reapply_jobs.last_progress_at IS 'Timestamp of last batch progress for stall detection';
COMMENT ON COLUMN pricing_reapply_jobs.next_retry_at IS 'Scheduled retry time for failed jobs (exponential backoff)';
