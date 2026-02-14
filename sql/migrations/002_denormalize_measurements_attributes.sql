-- Migration: Denormalize measurements and attributes JSONB fields into proper columns
-- This migration:
-- 1. Adds new columns for frequently-queried fields
-- 2. Backfills data from JSONB
-- 3. Creates indexes for query performance
-- 4. Drops the JSONB columns

-- Step 1: Add new columns
ALTER TABLE diamonds
  ADD COLUMN table_pct numeric(5,2),
  ADD COLUMN depth_pct numeric(5,2),
  ADD COLUMN length_mm numeric(6,2),
  ADD COLUMN width_mm numeric(6,2),
  ADD COLUMN depth_mm numeric(6,2),
  ADD COLUMN crown_angle numeric(5,2),
  ADD COLUMN crown_height numeric(5,2),
  ADD COLUMN pavilion_angle numeric(5,2),
  ADD COLUMN pavilion_depth numeric(5,2),
  ADD COLUMN girdle text,
  ADD COLUMN culet_size text,
  ADD COLUMN eye_clean boolean,
  ADD COLUMN brown text,
  ADD COLUMN green text,
  ADD COLUMN milky text;

-- Step 2: Backfill from JSONB
UPDATE diamonds
SET
  table_pct = (measurements->>'table')::numeric,
  depth_pct = (measurements->>'depthPercentage')::numeric,
  length_mm = (measurements->>'length')::numeric,
  width_mm = (measurements->>'width')::numeric,
  depth_mm = (measurements->>'depth')::numeric,
  crown_angle = (measurements->>'crownAngle')::numeric,
  crown_height = (measurements->>'crownHeight')::numeric,
  pavilion_angle = (measurements->>'pavAngle')::numeric,
  pavilion_depth = (measurements->>'pavDepth')::numeric,
  girdle = measurements->>'girdle',
  culet_size = measurements->>'culetSize',
  eye_clean = CASE
    WHEN attributes->>'eyeClean' IS NULL THEN NULL
    WHEN LOWER(attributes->>'eyeClean') IN ('true', 'yes', '1', 't', 'y') THEN TRUE
    WHEN LOWER(attributes->>'eyeClean') IN ('false', 'no', '0', 'f', 'n', 'none', 'n/a', '') THEN FALSE
    ELSE NULL  -- For unexpected values like "100%", set to NULL
  END,
  brown = attributes->>'brown',
  green = attributes->>'green',
  milky = attributes->>'milky'
WHERE measurements IS NOT NULL OR attributes IS NOT NULL;

-- Step 3: Create indexes for query performance
CREATE INDEX idx_diamonds_table_pct ON diamonds (table_pct)
  WHERE status = 'active' AND table_pct IS NOT NULL;

CREATE INDEX idx_diamonds_depth_pct ON diamonds (depth_pct)
  WHERE status = 'active' AND depth_pct IS NOT NULL;

CREATE INDEX idx_diamonds_eye_clean ON diamonds (eye_clean)
  WHERE status = 'active' AND eye_clean = true;

CREATE INDEX idx_diamonds_no_bgm ON diamonds (brown, green, milky)
  WHERE status = 'active';

CREATE INDEX idx_diamonds_measurements_composite ON diamonds (table_pct, depth_pct, crown_angle, pavilion_angle)
  WHERE status = 'active';

-- Step 4: Drop old GIN indexes on JSONB
DROP INDEX IF EXISTS idx_diamonds_measurements_gin;
DROP INDEX IF EXISTS idx_diamonds_attributes_gin;

-- Step 5: Drop JSONB columns
ALTER TABLE diamonds
  DROP COLUMN measurements,
  DROP COLUMN attributes;

-- Verify migration
DO $$
DECLARE
  total_count integer;
  has_table_pct integer;
  has_depth_pct integer;
BEGIN
  SELECT COUNT(*) INTO total_count FROM diamonds WHERE status = 'active';
  SELECT COUNT(*) INTO has_table_pct FROM diamonds WHERE status = 'active' AND table_pct IS NOT NULL;
  SELECT COUNT(*) INTO has_depth_pct FROM diamonds WHERE status = 'active' AND depth_pct IS NOT NULL;

  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  Total active diamonds: %', total_count;
  RAISE NOTICE '  With table_pct: %', has_table_pct;
  RAISE NOTICE '  With depth_pct: %', has_depth_pct;
END $$;
