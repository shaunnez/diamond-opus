-- Add feed column to raw diamond tables so each record carries its feed identifier.
-- This allows claimUnconsolidatedRawDiamonds to filter by feed and prevents
-- the nivoda-natural and nivoda-labgrown consolidators from claiming each other's rows.

ALTER TABLE raw_diamonds_nivoda ADD COLUMN IF NOT EXISTS feed TEXT;
ALTER TABLE raw_diamonds_demo    ADD COLUMN IF NOT EXISTS feed TEXT;

-- Backfill from run_metadata using the run_id already stored on each row.
-- run_id on a record reflects the most recent run that upserted it, so
-- run_metadata.feed is the correct feed for that record's current payload.
UPDATE raw_diamonds_nivoda r
SET feed = rm.feed
FROM run_metadata rm
WHERE rm.run_id = r.run_id
  AND r.feed IS NULL;

UPDATE raw_diamonds_demo r
SET feed = rm.feed
FROM run_metadata rm
WHERE rm.run_id = r.run_id
  AND r.feed IS NULL;

-- Partial B-tree index — only unconsolidated rows matter for the claim query hot path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_diamonds_nivoda_feed
  ON raw_diamonds_nivoda (feed)
  WHERE consolidated = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_diamonds_demo_feed
  ON raw_diamonds_demo (feed)
  WHERE consolidated = FALSE;
