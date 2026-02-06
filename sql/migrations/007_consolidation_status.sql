-- Migration: Add consolidation status tracking to run_metadata
-- This enables tracking consolidation progress/outcome per run
-- and supports the "resume consolidation" feature.

-- Consolidation outcome tracking
ALTER TABLE run_metadata ADD COLUMN IF NOT EXISTS consolidation_started_at TIMESTAMPTZ;
ALTER TABLE run_metadata ADD COLUMN IF NOT EXISTS consolidation_completed_at TIMESTAMPTZ;
ALTER TABLE run_metadata ADD COLUMN IF NOT EXISTS consolidation_processed INTEGER DEFAULT 0;
ALTER TABLE run_metadata ADD COLUMN IF NOT EXISTS consolidation_errors INTEGER DEFAULT 0;
ALTER TABLE run_metadata ADD COLUMN IF NOT EXISTS consolidation_total INTEGER DEFAULT 0;

-- Add 'failed' status to raw_diamonds_nivoda consolidation_status
-- Previously only: pending, processing, done
-- Now also: failed (for diamonds that errored during mapping/upsert)
COMMENT ON COLUMN raw_diamonds_nivoda.consolidation_status IS 'pending | processing | done | failed';

-- Index for finding runs that need consolidation resume
CREATE INDEX IF NOT EXISTS idx_run_metadata_consolidation
ON run_metadata(consolidation_completed_at)
WHERE consolidation_completed_at IS NOT NULL AND consolidation_errors > 0;
