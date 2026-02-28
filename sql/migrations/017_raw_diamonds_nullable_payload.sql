-- After consolidation, payload JSONB is no longer needed (hash is kept for deduplication).
-- Nulling payload after consolidation saves ~95% of raw table storage while preserving
-- the ON CONFLICT ... WHERE payload_hash IS DISTINCT FROM EXCLUDED.payload_hash check.
ALTER TABLE raw_diamonds_nivoda ALTER COLUMN payload DROP NOT NULL;
ALTER TABLE raw_diamonds_demo ALTER COLUMN payload DROP NOT NULL;
