-- Migration 005: Remove unused counter columns from run_metadata
--
-- IMPORTANT: Only apply this migration after verifying that partition_progress
-- based counting is working correctly in production for at least 1 week.
--
-- These columns are no longer maintained or queried after the sync fix:
-- - completed_workers
-- - failed_workers
--
-- All queries now compute these counts from partition_progress.completed and
-- partition_progress.failed flags.

-- Step 1: Verify columns are truly unused by checking recent queries
-- Run this in Supabase before applying the migration:
--   SELECT * FROM pg_stat_user_tables WHERE relname = 'run_metadata';
--   -- Look at seq_scan, idx_scan to see if table is being heavily queried

-- Step 2: Add computed columns as views (optional, for transition period)
CREATE OR REPLACE VIEW run_metadata_with_counts AS
SELECT
  rm.*,
  COALESCE(
    (SELECT COUNT(*) FROM partition_progress pp
     WHERE pp.run_id = rm.run_id AND pp.completed = TRUE),
    0
  ) as completed_workers_computed,
  COALESCE(
    (SELECT COUNT(*) FROM partition_progress pp
     WHERE pp.run_id = rm.run_id AND pp.failed = TRUE),
    0
  ) as failed_workers_computed
FROM run_metadata rm;

-- Step 3: Drop the columns (cannot be rolled back without backup!)
-- ALTER TABLE run_metadata DROP COLUMN completed_workers;
-- ALTER TABLE run_metadata DROP COLUMN failed_workers;

-- To apply this migration:
-- 1. Deploy code with partition_progress based counting
-- 2. Monitor for 1 week to ensure no issues
-- 3. Uncomment the ALTER TABLE statements above
-- 4. Run this migration in Supabase SQL editor
-- 5. Drop the view if no longer needed: DROP VIEW run_metadata_with_counts;
