-- Exchange rates table for currency conversion
-- Stores daily rates fetched from Frankfurter API
-- Uses UNIQUE constraint for upsert semantics (one row per currency pair)

CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC(12,6) NOT NULL,
  rate_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair
  ON exchange_rates(base_currency, target_currency);
