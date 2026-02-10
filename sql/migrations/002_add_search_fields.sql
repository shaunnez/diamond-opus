-- Migration: Add new diamond search/filter columns
-- Date: 2026-02-11
-- Description: Adds fancy color, fluorescence intensity, ratio, and diamond_price
--              as first-class columns for efficient search filtering.
--              Adds indexes on existing columns now used as search filters.
--              Adds GIN indexes on JSONB columns for measurement/attribute filtering.

-- New columns
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS fancy_color TEXT;
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS fancy_intensity TEXT;
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS fancy_overtone TEXT;
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS fluorescence_intensity TEXT;
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS ratio NUMERIC(5,3);
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS diamond_price NUMERIC(12,2);

-- Indexes on new columns (partial on status='active')
CREATE INDEX IF NOT EXISTS idx_diamonds_fancy_color
  ON diamonds (fancy_color) WHERE status = 'active' AND fancy_color IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diamonds_fancy_intensity
  ON diamonds (fancy_intensity) WHERE status = 'active' AND fancy_intensity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diamonds_fluorescence_intensity
  ON diamonds (fluorescence_intensity) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_diamonds_ratio
  ON diamonds (ratio) WHERE status = 'active' AND ratio IS NOT NULL;

-- Indexes on existing columns now used as search filters
CREATE INDEX IF NOT EXISTS idx_diamonds_polish
  ON diamonds (polish) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_diamonds_symmetry
  ON diamonds (symmetry) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_diamonds_certificate_lab
  ON diamonds (certificate_lab) WHERE status = 'active';

-- GIN indexes on JSONB columns for measurement/attribute range filtering
CREATE INDEX IF NOT EXISTS idx_diamonds_measurements_gin
  ON diamonds USING GIN (measurements jsonb_path_ops) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_diamonds_attributes_gin
  ON diamonds USING GIN (attributes jsonb_path_ops) WHERE status = 'active';
