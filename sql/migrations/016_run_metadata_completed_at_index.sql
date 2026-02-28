-- Migration 016: Add index on run_metadata.completed_at for dashboard summary query
--
-- The getDashboardSummary query does:
--   SELECT rm.* FROM run_metadata rm
--   WHERE rm.completed_at IS NOT NULL
--   ORDER BY rm.completed_at DESC LIMIT 1
-- Without an index on completed_at this requires a full table scan + sort.

CREATE INDEX IF NOT EXISTS idx_run_metadata_completed_at
  ON run_metadata (completed_at DESC)
  WHERE completed_at IS NOT NULL;
