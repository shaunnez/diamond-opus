-- Migration: Rename supplier columns to feed
-- This renames the data source identifier from "supplier" to "feed"
-- Note: supplier_stone_id is NOT renamed as it refers to Nivoda's diamond identifier

-- Diamonds table
ALTER TABLE diamonds RENAME COLUMN supplier TO feed;
ALTER TABLE diamonds RENAME COLUMN supplier_price_cents TO feed_price_cents;
ALTER TABLE diamonds RENAME COLUMN supplier_name TO feed_name;
ALTER TABLE diamonds RENAME COLUMN supplier_legal_name TO feed_legal_name;

-- Update the unique constraint
ALTER TABLE diamonds DROP CONSTRAINT IF EXISTS diamonds_supplier_supplier_stone_id_key;
ALTER TABLE diamonds ADD CONSTRAINT diamonds_feed_supplier_stone_id_key UNIQUE (feed, supplier_stone_id);

-- Update indexes
DROP INDEX IF EXISTS idx_diamonds_price;
CREATE INDEX idx_diamonds_price ON diamonds(feed_price_cents) WHERE status = 'active';

-- Pricing rules table
ALTER TABLE pricing_rules RENAME COLUMN supplier TO feed;

-- Hold history table
ALTER TABLE hold_history RENAME COLUMN supplier TO feed;
ALTER TABLE hold_history RENAME COLUMN supplier_hold_id TO feed_hold_id;

-- Purchase history table
ALTER TABLE purchase_history RENAME COLUMN supplier TO feed;
ALTER TABLE purchase_history RENAME COLUMN supplier_order_id TO feed_order_id;
