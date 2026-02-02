# SQL

Database schema and migrations for Supabase PostgreSQL.

## Overview

This directory contains:

- `bootstrap.sql` - Complete database schema for fresh installations
- `migrations/` - Incremental schema changes

## Schema Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Database Schema                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ api_keys        │     │ pricing_rules   │               │
│  │ (authentication)│     │ (markup config) │               │
│  └─────────────────┘     └─────────────────┘               │
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ run_metadata    │────▶│ worker_runs     │               │
│  │ (batch tracking)│     │ (per-partition) │               │
│  └─────────────────┘     └─────────────────┘               │
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ raw_diamonds_   │────▶│ diamonds        │               │
│  │ nivoda          │     │ (canonical)     │               │
│  │ (staging)       │     │                 │               │
│  └─────────────────┘     └────────┬────────┘               │
│                                   │                         │
│                    ┌──────────────┴──────────────┐         │
│                    │                             │         │
│              ┌─────▼─────┐               ┌──────▼──────┐   │
│              │hold_history│               │purchase_    │   │
│              │            │               │history      │   │
│              └────────────┘               └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Tables

### api_keys

Stores hashed API keys for REST API authentication.

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,      -- SHA256 hash of API key
  client_name TEXT NOT NULL,          -- Human-readable identifier
  permissions TEXT[] DEFAULT '{}',    -- Future: fine-grained permissions
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
```

**Usage:**
- API key is SHA256 hashed before comparison
- `last_used_at` updated on each successful auth
- Inactive keys (`active = false`) are rejected

### raw_diamonds_nivoda

Staging table for raw Nivoda API responses.

```sql
CREATE TABLE raw_diamonds_nivoda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,               -- Links to run_metadata
  supplier_stone_id TEXT NOT NULL,    -- diamond.id from Nivoda
  offer_id TEXT NOT NULL,             -- item.id from Nivoda
  source_updated_at TIMESTAMPTZ,      -- Nivoda updated_at
  payload JSONB NOT NULL,             -- Full API response
  payload_hash TEXT NOT NULL,         -- SHA256 for change detection
  consolidated BOOLEAN DEFAULT FALSE, -- Processed by consolidator
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_stone_id)
);
```

**Key points:**
- `supplier_stone_id` is the unique identifier (not offer_id)
- `payload` contains complete Nivoda response for audit trail
- `consolidated` flag prevents re-processing

### diamonds

Canonical diamond inventory table.

```sql
CREATE TABLE diamonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  feed TEXT NOT NULL DEFAULT 'nivoda',
  supplier_stone_id TEXT NOT NULL,    -- Unique per feed (Nivoda diamond.id)
  offer_id TEXT NOT NULL,             -- For ordering operations

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

  -- Pricing (ALL IN CENTS)
  feed_price_cents BIGINT NOT NULL,
  price_per_carat_cents BIGINT NOT NULL,
  retail_price_cents BIGINT,           -- feed * markup
  markup_ratio DECIMAL(5,4),           -- e.g., 1.1500
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Availability
  availability TEXT NOT NULL,          -- available|on_hold|sold|unavailable
  raw_availability TEXT,               -- Original Nivoda value
  hold_id TEXT,

  -- Media
  image_url TEXT,
  video_url TEXT,

  -- Certificate
  certificate_lab TEXT,
  certificate_number TEXT,
  certificate_pdf_url TEXT,

  -- Measurements & Attributes (flexible JSONB)
  measurements JSONB,    -- length, width, depth, angles
  attributes JSONB,      -- eyeClean, tint, comments

  -- Supplier Details
  supplier_name TEXT,
  supplier_legal_name TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'active',        -- active|deleted
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(feed, supplier_stone_id)
);
```

**Key points:**
- All prices in **cents** (BIGINT) to avoid float precision issues
- Soft deletes via `status = 'deleted'` and `deleted_at`
- Composite unique on `(feed, supplier_stone_id)`

### pricing_rules

Database-driven pricing configuration.

```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,  -- Lower = higher priority

  -- Match Criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],                          -- Array of shapes
  lab_grown BOOLEAN,
  feed TEXT,

  -- Outputs
  markup_ratio DECIMAL(5,4) NOT NULL,     -- e.g., 1.1500 = 15%
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Lifecycle
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default rule (always matches)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

**Matching logic:**
1. Rules sorted by priority ascending
2. First matching rule wins
3. All non-NULL criteria must match
4. Default rule (priority 1000) catches everything

### run_metadata

Tracks batch pipeline executions.

```sql
CREATE TABLE run_metadata (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,              -- 'full' or 'incremental'
  expected_workers INTEGER NOT NULL,
  completed_workers INTEGER DEFAULT 0, -- Atomic counter
  failed_workers INTEGER DEFAULT 0,    -- Atomic counter
  watermark_before TIMESTAMPTZ,        -- For incremental
  watermark_after TIMESTAMPTZ,         -- Set on completion
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**Atomic counter pattern:**
```sql
UPDATE run_metadata
SET completed_workers = completed_workers + 1
WHERE run_id = $1
RETURNING completed_workers, expected_workers;
```

### worker_runs

Individual worker execution records.

```sql
CREATE TABLE worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  worker_id UUID NOT NULL,
  status TEXT NOT NULL,                -- running|completed|failed
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  work_item_payload JSONB,             -- For retry capability
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(run_id, partition_id)
);
```

### hold_history / purchase_history

Track diamond operations.

```sql
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

CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  feed TEXT NOT NULL,
  feed_order_id TEXT,
  offer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,  -- Prevents duplicate orders
  status TEXT NOT NULL,
  reference TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Indexes

### Search Optimization

```sql
-- Composite search (shape, carats, color, clarity)
CREATE INDEX idx_diamonds_search ON diamonds(shape, carats, color, clarity)
  WHERE status = 'active';

-- Price filtering
CREATE INDEX idx_diamonds_price ON diamonds(feed_price_cents)
  WHERE status = 'active';

-- Common filters
CREATE INDEX idx_diamonds_lab_grown ON diamonds(lab_grown) WHERE status = 'active';
CREATE INDEX idx_diamonds_cut ON diamonds(cut) WHERE status = 'active';
CREATE INDEX idx_diamonds_carats ON diamonds(carats) WHERE status = 'active';
```

### Pipeline Optimization

```sql
-- Consolidator: find unconsolidated records
CREATE INDEX idx_raw_nivoda_unconsolidated_created
  ON raw_diamonds_nivoda(created_at ASC) WHERE NOT consolidated;

-- Worker tracking
CREATE INDEX idx_worker_runs_status ON worker_runs(run_id, status);
```

## Installation

### Fresh Database

1. Open Supabase SQL Editor
2. Copy contents of `bootstrap.sql`
3. Execute

### Migrations

Run migrations in order:

```sql
-- Check current state
SELECT * FROM schema_migrations;

-- Apply migration
\i migrations/001_add_indexes.sql
```

## Common Queries

### Search diamonds

```sql
SELECT * FROM diamonds
WHERE status = 'active'
  AND shape = 'ROUND'
  AND carats BETWEEN 1.0 AND 2.0
  AND feed_price_cents BETWEEN 100000 AND 500000
ORDER BY feed_price_cents ASC
LIMIT 50;
```

### Check run status

```sql
SELECT
  rm.run_id,
  rm.run_type,
  rm.expected_workers,
  rm.completed_workers,
  rm.failed_workers,
  rm.completed_at
FROM run_metadata rm
ORDER BY started_at DESC
LIMIT 5;
```

### Pricing rule audit

```sql
SELECT
  d.shape,
  d.carats,
  d.lab_grown,
  d.feed_price_cents,
  d.retail_price_cents,
  d.markup_ratio,
  d.rating
FROM diamonds d
WHERE d.status = 'active'
ORDER BY d.created_at DESC
LIMIT 10;
```

## Assumptions

1. **Supabase PostgreSQL**: No local Postgres setup
2. **UTC timestamps**: All `TIMESTAMPTZ` in UTC
3. **Cents for money**: Avoids float precision issues
4. **Soft deletes**: Never hard delete diamonds
5. **UUID primary keys**: No sequential IDs exposed

## Migrations

### Creating a new migration

```sql
-- migrations/002_description.sql
-- Description of changes

BEGIN;

-- Make changes
ALTER TABLE diamonds ADD COLUMN new_column TEXT;

-- Record migration
INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Add new_column to diamonds');

COMMIT;
```

### Rollback

```sql
-- migrations/002_description_rollback.sql
BEGIN;

ALTER TABLE diamonds DROP COLUMN new_column;

DELETE FROM schema_migrations WHERE version = '002';

COMMIT;
```
