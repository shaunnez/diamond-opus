-- Migration 004: Add failed flag to partition_progress for robust failure tracking
-- This enables idempotent failure marking to prevent double-counting of failed workers

ALTER TABLE partition_progress
ADD COLUMN IF NOT EXISTS failed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for querying failed partitions (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_partition_progress_failed
  ON partition_progress(run_id, failed)
  WHERE failed = TRUE;

COMMENT ON COLUMN partition_progress.failed IS
  'True when this partition has encountered a failure. Set atomically to prevent double-counting.';
