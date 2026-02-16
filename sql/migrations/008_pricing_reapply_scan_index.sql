-- Migration: Add composite index for efficient pricing reapply job scanning
-- Description: Supports keyset pagination (id cursor) for available active diamonds
-- Date: 2026-02-16

-- Drop existing partial index to replace with composite
DROP INDEX IF EXISTS idx_diamonds_availability;

-- Create composite index for efficient scan with keyset pagination
-- Supports: WHERE availability = 'available' AND status = 'active' AND id > $cursor ORDER BY id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_available_active_id
  ON diamonds(availability, status, id)
  WHERE status = 'active';

COMMENT ON INDEX idx_diamonds_available_active_id IS 'Composite index for pricing reapply job scanning with keyset pagination';
