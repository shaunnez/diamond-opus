-- Migration: Rename supplier columns to feed and convert pricing to dollars
-- This renames the data source identifier from "supplier" to "feed"
-- Also converts cents to dollars for cleaner data handling
-- Note: supplier_stone_id, supplier_name, supplier_legal_name are NOT renamed
-- as they refer to actual supplier/vendor info from Nivoda

-- Diamonds table - rename supplier to feed
ALTER TABLE diamonds RENAME COLUMN supplier TO feed;

-- Convert price columns from cents (BIGINT) to dollars (DECIMAL)
-- First add new columns
ALTER TABLE diamonds ADD COLUMN price_model_price DECIMAL(12,2);
ALTER TABLE diamonds ADD COLUMN price_per_carat DECIMAL(12,2);
ALTER TABLE diamonds ADD COLUMN retail_price_new DECIMAL(12,2);

-- Migrate data (divide by 100 to convert cents to dollars)
UPDATE diamonds SET
  price_model_price = feed_price_cents / 100.0,
  price_per_carat = price_per_carat_cents / 100.0,
  retail_price_new = retail_price_cents / 100.0;

-- Make price_model_price NOT NULL after migration
ALTER TABLE diamonds ALTER COLUMN price_model_price SET NOT NULL;
ALTER TABLE diamonds ALTER COLUMN price_per_carat SET NOT NULL;

-- Drop old columns
ALTER TABLE diamonds DROP COLUMN feed_price_cents;
ALTER TABLE diamonds DROP COLUMN price_per_carat_cents;
ALTER TABLE diamonds DROP COLUMN retail_price_cents;

-- Rename retail_price_new to retail_price
ALTER TABLE diamonds RENAME COLUMN retail_price_new TO retail_price;

-- Update the unique constraint
ALTER TABLE diamonds DROP CONSTRAINT IF EXISTS diamonds_supplier_supplier_stone_id_key;
ALTER TABLE diamonds ADD CONSTRAINT diamonds_feed_supplier_stone_id_key UNIQUE (feed, supplier_stone_id);

-- Update indexes
DROP INDEX IF EXISTS idx_diamonds_price;
CREATE INDEX idx_diamonds_price ON diamonds(price_model_price) WHERE status = 'active';

-- Pricing rules table
ALTER TABLE pricing_rules RENAME COLUMN supplier TO feed;

-- Hold history table
ALTER TABLE hold_history RENAME COLUMN supplier TO feed;
ALTER TABLE hold_history RENAME COLUMN supplier_hold_id TO feed_hold_id;

-- Purchase history table
ALTER TABLE purchase_history RENAME COLUMN supplier TO feed;
ALTER TABLE purchase_history RENAME COLUMN supplier_order_id TO feed_order_id;
