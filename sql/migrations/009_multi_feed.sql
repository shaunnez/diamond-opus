-- Migration: Multi-feed support
-- Adds feed column to run_metadata and creates tables for the demo feed

-- 1. Add feed column to run_metadata
ALTER TABLE run_metadata ADD COLUMN IF NOT EXISTS feed TEXT NOT NULL DEFAULT 'nivoda';

CREATE INDEX IF NOT EXISTS idx_run_metadata_feed ON run_metadata(feed);

-- 2. Create raw_diamonds_demo table (mirrors raw_diamonds_nivoda structure)
CREATE TABLE IF NOT EXISTS raw_diamonds_demo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  supplier_stone_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  consolidated BOOLEAN DEFAULT FALSE,
  consolidation_status TEXT DEFAULT 'pending',
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(supplier_stone_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_demo_consolidated ON raw_diamonds_demo(consolidated) WHERE NOT consolidated;
CREATE INDEX IF NOT EXISTS idx_raw_demo_run_id ON raw_diamonds_demo(run_id);
CREATE INDEX IF NOT EXISTS idx_raw_demo_unconsolidated_created ON raw_diamonds_demo(created_at ASC) WHERE NOT consolidated;
CREATE INDEX IF NOT EXISTS idx_raw_demo_claim ON raw_diamonds_demo(consolidation_status, created_at ASC) WHERE NOT consolidated;

-- 3. Create demo_feed_inventory table (backing store for the mock API)
CREATE TABLE IF NOT EXISTS demo_feed_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id TEXT NOT NULL UNIQUE,
  -- Deliberately different field names from Nivoda to prove mapper abstraction
  weight_ct DECIMAL(6,2) NOT NULL,
  stone_shape TEXT NOT NULL,
  stone_color TEXT NOT NULL,
  stone_clarity TEXT NOT NULL,
  cut_grade TEXT,
  polish_grade TEXT,
  symmetry_grade TEXT,
  fluorescence_level TEXT,
  asking_price_usd DECIMAL(12,2) NOT NULL,
  price_per_ct_usd DECIMAL(12,2) NOT NULL,
  is_lab_created BOOLEAN DEFAULT FALSE,
  is_treated BOOLEAN DEFAULT FALSE,
  availability_status TEXT NOT NULL DEFAULT 'available',
  cert_lab TEXT,
  cert_number TEXT,
  image_link TEXT,
  video_link TEXT,
  vendor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_inventory_price ON demo_feed_inventory(asking_price_usd);
CREATE INDEX IF NOT EXISTS idx_demo_inventory_updated ON demo_feed_inventory(updated_at);
CREATE INDEX IF NOT EXISTS idx_demo_inventory_shape ON demo_feed_inventory(stone_shape);
