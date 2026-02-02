-- Diamond Platform Database Schema
-- Execute this script in Supabase SQL Editor

-- API Keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE active = TRUE;

-- Raw diamonds from Nivoda
CREATE TABLE raw_diamonds_nivoda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  supplier_stone_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  consolidated BOOLEAN DEFAULT FALSE,
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(supplier_stone_id)
);

CREATE INDEX idx_raw_nivoda_consolidated ON raw_diamonds_nivoda(consolidated) WHERE NOT consolidated;
CREATE INDEX idx_raw_nivoda_run_id ON raw_diamonds_nivoda(run_id);
CREATE INDEX idx_raw_nivoda_unconsolidated_created ON raw_diamonds_nivoda(created_at ASC) WHERE NOT consolidated;

-- Canonical diamonds table
CREATE TABLE diamonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  feed TEXT NOT NULL DEFAULT 'nivoda',
  supplier_stone_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,

  -- Core Attributes
  shape TEXT NOT NULL,
  carats DECIMAL(6,2) NOT NULL,
  color TEXT NOT NULL,
  clarity TEXT NOT NULL,
  cut TEXT,
  polish TEXT,
  symmetry TEXT,
  fluorescence TEXT,

  -- Type Flags
  lab_grown BOOLEAN DEFAULT FALSE,
  treated BOOLEAN DEFAULT FALSE,

  -- Pricing (cents to avoid float issues)
  feed_price_cents BIGINT NOT NULL,
  price_per_carat_cents BIGINT NOT NULL,
  retail_price_cents BIGINT,
  markup_ratio DECIMAL(5,4),
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Availability
  availability TEXT NOT NULL,
  raw_availability TEXT,
  hold_id TEXT,

  -- Media
  image_url TEXT,
  video_url TEXT,

  -- Certificate
  certificate_lab TEXT,
  certificate_number TEXT,
  certificate_pdf_url TEXT,

  -- Measurements & Attributes (JSONB for flexibility)
  measurements JSONB,
  attributes JSONB,

  -- Supplier Details (vendor info from Nivoda)
  supplier_name TEXT,
  supplier_legal_name TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'active',
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(feed, supplier_stone_id)
);

CREATE INDEX idx_diamonds_search ON diamonds(shape, carats, color, clarity) WHERE status = 'active';
CREATE INDEX idx_diamonds_price ON diamonds(feed_price_cents) WHERE status = 'active';
CREATE INDEX idx_diamonds_availability ON diamonds(availability) WHERE status = 'active';
CREATE INDEX idx_diamonds_offer ON diamonds(offer_id);
CREATE INDEX idx_diamonds_lab_grown ON diamonds(lab_grown) WHERE status = 'active';
CREATE INDEX idx_diamonds_cut ON diamonds(cut) WHERE status = 'active';
CREATE INDEX idx_diamonds_created ON diamonds(created_at DESC) WHERE status = 'active';
CREATE INDEX idx_diamonds_deleted ON diamonds(deleted_at) WHERE status = 'deleted';
CREATE INDEX idx_diamonds_carats ON diamonds(carats) WHERE status = 'active';

-- Pricing rules table
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,

  -- Matching Criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],
  lab_grown BOOLEAN,
  feed TEXT,

  -- Outputs
  markup_ratio DECIMAL(5,4) NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Lifecycle
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_active ON pricing_rules(priority) WHERE active = TRUE;

-- Run metadata table
CREATE TABLE run_metadata (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,
  expected_workers INTEGER NOT NULL,
  completed_workers INTEGER DEFAULT 0,
  failed_workers INTEGER DEFAULT 0,
  watermark_before TIMESTAMPTZ,
  watermark_after TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_run_metadata_incomplete ON run_metadata(started_at DESC) WHERE completed_at IS NULL;

-- Worker runs table
CREATE TABLE worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  worker_id UUID NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  work_item_payload JSONB,  -- Stores original work item for retry capability
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(run_id, partition_id)
);

CREATE INDEX idx_worker_runs_status ON worker_runs(run_id, status);
CREATE INDEX idx_worker_runs_run_started ON worker_runs(run_id, started_at);

-- Migration for existing databases (run manually if upgrading):
-- ALTER TABLE worker_runs ADD COLUMN IF NOT EXISTS work_item_payload JSONB;

-- Hold history table
CREATE TABLE hold_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  feed TEXT NOT NULL,
  feed_hold_id TEXT,
  offer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  denied BOOLEAN DEFAULT FALSE,
  hold_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hold_history_diamond_id ON hold_history(diamond_id, created_at DESC);

-- Purchase history table
CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  feed TEXT NOT NULL,
  feed_order_id TEXT,
  offer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  reference TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_purchase_history_diamond_id ON purchase_history(diamond_id);

-- Insert default pricing rule
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
