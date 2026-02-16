-- Migration: Add updated_diamonds column to pricing_reapply_jobs
-- Description: Track the number of diamonds that had pricing changes (not just processed)
-- Date: 2026-02-16

ALTER TABLE pricing_reapply_jobs
ADD COLUMN updated_diamonds INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN pricing_reapply_jobs.updated_diamonds IS 'Number of diamonds with pricing changes (subset of processed_diamonds)';
