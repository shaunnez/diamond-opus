-- Migration: Switch pricing rules from carat/shape brackets to cost-based dynamic pricing
-- Stone types: natural, lab, fancy (has fancy color)
-- Base margins: Natural = 40%, Lab = 79%, Fancy = 40%
-- Rules store margin_modifier (percentage points) applied to base margin

-- Step 1: Add fancy_color column to diamonds table
ALTER TABLE "public"."diamonds"
  ADD COLUMN IF NOT EXISTS "fancy_color" text;

-- Step 2: Modify pricing_rules table
-- Remove old columns
ALTER TABLE "public"."pricing_rules"
  DROP COLUMN IF EXISTS "carat_min",
  DROP COLUMN IF EXISTS "carat_max",
  DROP COLUMN IF EXISTS "shapes",
  DROP COLUMN IF EXISTS "lab_grown",
  DROP COLUMN IF EXISTS "markup_ratio";

-- Add new columns
ALTER TABLE "public"."pricing_rules"
  ADD COLUMN IF NOT EXISTS "stone_type" text,
  ADD COLUMN IF NOT EXISTS "price_min" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "price_max" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "margin_modifier" numeric(5,2) NOT NULL DEFAULT 0;

-- Add check constraint for stone_type values
ALTER TABLE "public"."pricing_rules"
  ADD CONSTRAINT "pricing_rules_stone_type_check"
  CHECK ("stone_type" IS NULL OR "stone_type" IN ('natural', 'lab', 'fancy'));

-- Add check constraint for price range validity
ALTER TABLE "public"."pricing_rules"
  ADD CONSTRAINT "pricing_rules_price_range_check"
  CHECK ("price_min" IS NULL OR "price_max" IS NULL OR "price_min" <= "price_max");
