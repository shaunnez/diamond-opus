-- Migration: Add partition_progress table for worker continuation pattern
-- This table tracks the processing progress of each partition in a run
-- enabling the worker to process one page at a time and continue from where it left off

CREATE TABLE partition_progress (
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (run_id, partition_id)
);

-- Index for querying incomplete partitions
CREATE INDEX idx_partition_progress_incomplete
  ON partition_progress(run_id, completed)
  WHERE completed = FALSE;

-- Index for tracking progress updates
CREATE INDEX idx_partition_progress_updated
  ON partition_progress(updated_at DESC);

-- Add comment for documentation
COMMENT ON TABLE partition_progress IS
  'Tracks pagination progress for each worker partition to enable continuation pattern. Each partition processes one page per message.';
COMMENT ON COLUMN partition_progress.next_offset IS
  'The offset for the next page to fetch. Updated atomically after each page is processed.';
COMMENT ON COLUMN partition_progress.completed IS
  'True when all pages in this partition have been processed.';
