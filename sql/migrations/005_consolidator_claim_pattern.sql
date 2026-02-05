-- Migration: Add claim pattern for multi-replica consolidator safety
-- This enables exclusive row claiming to prevent duplicate processing when running
-- multiple consolidator replicas.

-- Add claim pattern columns to raw_diamonds_nivoda
ALTER TABLE raw_diamonds_nivoda
ADD COLUMN IF NOT EXISTS consolidation_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS claimed_by TEXT;

-- Index to support efficient claiming: find pending rows ordered by created_at
-- Partial index only includes unconsolidated rows to keep it small
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_nivoda_claim
ON raw_diamonds_nivoda (consolidation_status, created_at)
WHERE consolidated = false;

-- Index to support unconsolidated ordered by created_at queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_nivoda_unconsolidated_created_at
ON raw_diamonds_nivoda (created_at)
WHERE consolidated = false;

-- Comment documenting the consolidation_status state machine:
-- 'pending'    -> Row is ready for consolidation
-- 'processing' -> Row has been claimed by a consolidator instance
-- 'done'       -> Row has been successfully consolidated
COMMENT ON COLUMN raw_diamonds_nivoda.consolidation_status IS
  'Claim status: pending (ready), processing (claimed), done (consolidated)';
COMMENT ON COLUMN raw_diamonds_nivoda.claimed_at IS
  'Timestamp when row was claimed for processing (for stuck claim detection)';
COMMENT ON COLUMN raw_diamonds_nivoda.claimed_by IS
  'Instance ID of consolidator that claimed this row';
