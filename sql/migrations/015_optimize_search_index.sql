-- Migration 015: Optimized search index with INCLUDE columns
--
-- Problem: Storefront diamond searches take 10-21+ seconds. EXPLAIN ANALYZE shows
-- the search index (v2) covers only (status, lab_grown, shape, carats, color, clarity)
-- but cut, polish, symmetry, availability, and feed_price are checked via heap fetches.
-- This causes ~142K random heap reads to discard ~105K non-matching rows.
--
-- Solution:
--   1. Create idx_diamonds_search_v3 with INCLUDE columns for all commonly-filtered
--      fields. This enables Index Only Scans for COUNT queries (no heap access) and
--      fast index-level filtering for data queries.
--   2. Drop ~22 redundant indexes subsumed by v3 (beyond what 014 already removed).
--   3. Normalize cut/polish/symmetry to uppercase for consistent filtering.
--
-- Expected impact: COUNT queries drop from ~21s to <1s; total API response from
-- 10-40s to 1-3s. Index count on diamonds drops from ~35 to ~15.
--
-- IMPORTANT: On Supabase/production, run the CREATE INDEX statement with CONCURRENTLY
-- to avoid locking the table. The DROP INDEX statements are fast (metadata only).

-- =========================================================================
-- Step 1: Normalize cut/polish/symmetry data to uppercase
-- =========================================================================
-- The API uppercases filter values (longDiamondFilterToShort), so DB data must match.
-- Old queries used UPPER() wrappers which prevented index usage. After this migration,
-- direct equality comparison works and indexes are usable.

UPDATE diamonds SET
  cut = UPPER(cut)
WHERE cut IS NOT NULL AND cut != UPPER(cut);

UPDATE diamonds SET
  polish = UPPER(polish)
WHERE polish IS NOT NULL AND polish != UPPER(polish);

UPDATE diamonds SET
  symmetry = UPPER(symmetry)
WHERE symmetry IS NOT NULL AND symmetry != UPPER(symmetry);

-- =========================================================================
-- Step 2: Create the new composite search index
-- =========================================================================
-- Key columns: lab_grown, shape, carats, color, clarity — used for btree seeking.
-- INCLUDE columns: cut, polish, symmetry, fluorescence_intensity, availability,
--   feed_price, price_model_price, rating, certificate_lab, fancy_color —
--   stored in leaf pages for index-only filter evaluation without heap access.
-- Partial: WHERE status = 'active' — excludes deleted rows from the index entirely.
--
-- For production, use: CREATE INDEX CONCURRENTLY idx_diamonds_search_v3 ...
-- (CONCURRENTLY cannot run inside a transaction block)

CREATE INDEX IF NOT EXISTS idx_diamonds_search_v3 ON diamonds
  (lab_grown, shape, carats, color, clarity)
  INCLUDE (cut, polish, symmetry, fluorescence_intensity, availability,
           feed_price, price_model_price, rating, certificate_lab, fancy_color)
  WHERE (status = 'active');

-- =========================================================================
-- Step 3: Drop redundant indexes
-- =========================================================================

-- A) Non-partial duplicates missed by migration 014
DROP INDEX IF EXISTS diamonds_carats_idx;
DROP INDEX IF EXISTS diamonds_fancy_color_idx;
DROP INDEX IF EXISTS diamonds_lab_grown_idx;
DROP INDEX IF EXISTS diamonds_price_model_price_idx;
DROP INDEX IF EXISTS diamonds_supplier_idx;           -- feed column, only 2-3 values

-- B) Old search indexes replaced by v3
DROP INDEX IF EXISTS idx_diamonds_search;             -- v1: (shape, carats, color, clarity)
DROP INDEX IF EXISTS idx_diamonds_search_v2;          -- v2: (status, lab_grown, shape, carats, color, clarity)
DROP INDEX IF EXISTS idx_diamonds_search_covering;    -- (shape, carats, color, clarity, cut, ...) lab_grown=false only

-- C) Single-column partial indexes subsumed by v3 key or INCLUDE columns
DROP INDEX IF EXISTS idx_diamonds_shape;
DROP INDEX IF EXISTS idx_diamonds_color;
DROP INDEX IF EXISTS idx_diamonds_clarity;
DROP INDEX IF EXISTS idx_diamonds_cut;
DROP INDEX IF EXISTS idx_diamonds_polish;
DROP INDEX IF EXISTS idx_diamonds_symmetry;
DROP INDEX IF EXISTS idx_diamonds_lab_grown;
DROP INDEX IF EXISTS idx_diamonds_fluorescence_intensity;
DROP INDEX IF EXISTS idx_diamonds_price;              -- feed_price standalone
DROP INDEX IF EXISTS idx_diamonds_availability;       -- availability standalone

-- D) Composite indexes subsumed by v3
DROP INDEX IF EXISTS idx_diamonds_shape_avail;        -- (shape, availability)
DROP INDEX IF EXISTS idx_diamonds_shape_carats;       -- (shape, carats, id)
DROP INDEX IF EXISTS idx_diamonds_lab_grown_price;    -- (lab_grown, feed_price, id)
DROP INDEX IF EXISTS idx_diamonds_lab_grown_price_model; -- (lab_grown, price_model_price, id)
