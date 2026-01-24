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

-- Canonical diamonds table
CREATE TABLE diamonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  supplier TEXT NOT NULL DEFAULT 'nivoda',
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
  supplier_price_cents BIGINT NOT NULL,
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

  -- Supplier Details
  supplier_name TEXT,
  supplier_legal_name TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'active',
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(supplier, supplier_stone_id)
);

CREATE INDEX idx_diamonds_search ON diamonds(shape, carats, color, clarity) WHERE status = 'active';
CREATE INDEX idx_diamonds_price ON diamonds(supplier_price_cents) WHERE status = 'active';
CREATE INDEX idx_diamonds_availability ON diamonds(availability) WHERE status = 'active';
CREATE INDEX idx_diamonds_offer ON diamonds(offer_id);

-- Pricing rules table
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,

  -- Matching Criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],
  lab_grown BOOLEAN,
  supplier TEXT,

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

-- Worker runs table
CREATE TABLE worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  worker_id UUID NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(run_id, partition_id)
);

CREATE INDEX idx_worker_runs_status ON worker_runs(run_id, status);

-- Hold history table
CREATE TABLE hold_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  supplier TEXT NOT NULL,
  supplier_hold_id TEXT,
  offer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  denied BOOLEAN DEFAULT FALSE,
  hold_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase history table
CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  supplier TEXT NOT NULL,
  supplier_order_id TEXT,
  offer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  reference TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing rule
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
