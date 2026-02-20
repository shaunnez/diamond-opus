-- Migration: 009_stripe_payments.sql
-- Add Stripe payment support to purchase_history

-- Order number sequence
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1 NO MAXVALUE CACHE 1;

-- Generate order number function: DO-YYYYMMDD-NNNN
CREATE OR REPLACE FUNCTION generate_order_number() RETURNS text AS $$
DECLARE seq_val bigint;
BEGIN
  seq_val := nextval('order_number_seq');
  RETURN 'DO-' || to_char(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- New columns on purchase_history
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS order_number text UNIQUE;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS feed_order_status text NOT NULL DEFAULT 'not_attempted';
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text UNIQUE;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS amount_cents integer;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS currency text DEFAULT 'nzd';
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS feed_order_error text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_history_order_number ON purchase_history(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_history_stripe_session ON purchase_history(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_needs_attention
  ON purchase_history(payment_status, feed_order_status)
  WHERE payment_status = 'paid' AND feed_order_status = 'failed';
