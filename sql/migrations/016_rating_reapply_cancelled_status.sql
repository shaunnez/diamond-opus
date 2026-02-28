-- Migration 016: Add 'cancelled' status to rating_reapply_jobs
-- Allows running re-rating jobs to be cancelled mid-execution.

ALTER TABLE rating_reapply_jobs DROP CONSTRAINT IF EXISTS rating_reapply_jobs_status_check;
ALTER TABLE rating_reapply_jobs ADD CONSTRAINT rating_reapply_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'reverted', 'cancelled'));
