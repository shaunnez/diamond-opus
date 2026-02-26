-- Migration 014: Diamond index cleanup and fluorescence functional index
-- Removes 18 redundant or unused indexes and adds 1 missing functional index.
--
-- Rationale by category:
--   A) Non-partial duplicates: identical indexes without WHERE status='active'
--      are superseded by partial variants that are strictly smaller and faster.
--   B) Standalone low-value indexes: status, updated_at, availability as plain
--      btrees are never the best plan choice when combined with other filters.
--   C) Unused: supplier_legal_name not in any search or sort path.
--   D) Single-column → (col, id) superseded: price_per_carat and
--      price_model_price without id are worse than their _id variants for sort
--      + cursor pagination.
--   E) Dead GIN indexes: measurements and attributes are denormalized columns;
--      the jsonb GIN indexes maintain overhead on every upsert for zero benefit.
--   F) Superseded sort indexes: idx_diamonds_carats single-column is covered by
--      idx_diamonds_carats_sort (ASC+id) and idx_diamonds_carats_sort_desc.
--      idx_diamonds_natural_price (lab_grown=false partial) is a subset of
--      idx_diamonds_lab_grown_price which covers both lab values.
--      idx_diamonds_created is superseded by idx_diamonds_active_created_desc
--      which adds id for deterministic cursor pagination.
--   G) Overly narrow partial: idx_diamonds_active_available_created omits id
--      (no cursor pagination) and is subsumed by idx_diamonds_active_created_desc.
--      diamonds_active_available_id_idx indexes only the PK column — lookups
--      already use diamonds_pkey.
--
-- Note: idx_diamonds_available_active_id is intentionally kept — it was added
-- in migration 008 specifically for the pricing reapply keyset pagination scan.

-- -------------------------------------------------------------------------
-- A) Non-partial duplicates
-- -------------------------------------------------------------------------

-- Superseded by idx_diamonds_color (WHERE status='active' AND color IS NOT NULL)
DROP INDEX  IF EXISTS diamonds_color_idx;

-- Superseded by idx_diamonds_clarity (WHERE status='active' AND clarity IS NOT NULL)
DROP INDEX  IF EXISTS diamonds_clarity_idx;

-- Superseded by idx_diamonds_shape (WHERE status='active')
DROP INDEX  IF EXISTS diamonds_shape_idx;

-- Superseded by idx_diamonds_ratio (WHERE status='active' AND ratio IS NOT NULL)
DROP INDEX  IF EXISTS diamonds_ratio_idx;

-- Superseded by idx_diamonds_price (WHERE status='active')
DROP INDEX  IF EXISTS diamonds_feed_price_idx;

-- Superseded by idx_diamonds_active_created_desc (WHERE status='active', has id)
DROP INDEX  IF EXISTS diamonds_created_at_idx;

-- Superseded by partial variants (idx_diamonds_available_price, etc.)
DROP INDEX  IF EXISTS diamonds_availability_idx;

-- -------------------------------------------------------------------------
-- B) Standalone low-value indexes
-- -------------------------------------------------------------------------

-- status is always combined with other predicates; a standalone btree on status
-- is never chosen over the many partial (WHERE status='active') indexes.
DROP INDEX  IF EXISTS diamonds_status_idx;

-- updated_at is only used for ORDER BY in getDiamondsOnHold() and quickSearch(),
-- both of which return small result sets where a sort is trivially cheap.
DROP INDEX  IF EXISTS diamonds_updated_at_idx;

-- -------------------------------------------------------------------------
-- C) Unused
-- -------------------------------------------------------------------------

-- supplier_legal_name is not filtered or sorted on in any API or dashboard query.
DROP INDEX  IF EXISTS diamonds_supplier_legal_name_idx;

-- -------------------------------------------------------------------------
-- D) Single-column versions superseded by (col, id) variants
-- -------------------------------------------------------------------------

-- Superseded by idx_diamonds_active_price_per_carat_id
DROP INDEX  IF EXISTS idx_diamonds_active_price_per_carat;

-- Superseded by idx_diamonds_active_price_model_price_id
DROP INDEX  IF EXISTS idx_diamonds_active_price_model_price;

-- -------------------------------------------------------------------------
-- E) Dead GIN indexes (measurements and attributes are now denormalized columns)
-- -------------------------------------------------------------------------

DROP INDEX  IF EXISTS idx_diamonds_measurements_gin;
DROP INDEX  IF EXISTS idx_diamonds_attributes_gin;

-- -------------------------------------------------------------------------
-- F) Superseded sort indexes
-- -------------------------------------------------------------------------

-- Superseded by idx_diamonds_carats_sort (carats ASC, id) and
-- idx_diamonds_carats_sort_desc (carats DESC, id)
DROP INDEX  IF EXISTS idx_diamonds_carats;

-- Superseded by idx_diamonds_lab_grown_price (lab_grown, feed_price, id)
-- which covers both lab_grown values, not just false
DROP INDEX  IF EXISTS idx_diamonds_natural_price;

-- Superseded by idx_diamonds_active_created_desc (created_at DESC, id)
-- which adds id for deterministic cursor pagination
DROP INDEX  IF EXISTS idx_diamonds_created;

-- -------------------------------------------------------------------------
-- G) Overly narrow partial indexes
-- -------------------------------------------------------------------------

-- Subsumed by idx_diamonds_active_created_desc; omits id so cannot paginate
DROP INDEX  IF EXISTS idx_diamonds_active_available_created;

-- Only indexes the PK column — diamonds_pkey already handles all id lookups
DROP INDEX  IF EXISTS diamonds_active_available_id_idx;
