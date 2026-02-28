-- Migration 015: Rating Rules Extended Filters
-- Adds Tier 1 (grading, certification, lab-grown) and Tier 2 (measurements) filter columns
-- to rating_rules for highly configurable diamond quality rating.
-- All columns are nullable so existing rules and code continue to work.

-- Tier 1: Core grading filters (text arrays)
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS polish text[];
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS symmetry text[];
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS fluorescence text[];
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS certificate_lab text[];

-- Tier 1: Lab-grown boolean filter
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS lab_grown boolean;

-- Tier 1: Carat weight range
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS carat_min numeric(6,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS carat_max numeric(6,2);

-- Tier 2: Table and depth percentage ranges
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS table_min numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS table_max numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS depth_min numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS depth_max numeric(5,2);

-- Tier 2: Crown angle and height ranges
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS crown_angle_min numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS crown_angle_max numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS crown_height_min numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS crown_height_max numeric(5,2);

-- Tier 2: Pavilion angle and depth ranges
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS pavilion_angle_min numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS pavilion_angle_max numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS pavilion_depth_min numeric(5,2);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS pavilion_depth_max numeric(5,2);

-- Tier 2: Girdle and culet (text arrays)
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS girdle text[];
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS culet_size text[];

-- Tier 2: Ratio range
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS ratio_min numeric(5,3);
ALTER TABLE rating_rules ADD COLUMN IF NOT EXISTS ratio_max numeric(5,3);
