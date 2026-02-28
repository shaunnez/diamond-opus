-- Migration 016: Add browse index for storefront queries without shape filter
--
-- Problem: The primary search index idx_diamonds_search_v3 has column order
-- (lab_grown, shape, carats, color, clarity). When the storefront searches
-- by stone type + carat range without selecting a shape (the most common
-- browsing pattern), PostgreSQL cannot skip the shape column in the B-tree.
-- It must scan all ~20 shape branches under the lab_grown equality, resulting
-- in slow queries despite the index existing.
--
-- Solution: Add a second index (lab_grown, carats) that covers the common
-- "browse by stone type + carat range" pattern directly. PostgreSQL's planner
-- will choose this index when shape is absent and v3 when shape is present.

CREATE INDEX IF NOT EXISTS idx_diamonds_browse ON diamonds
  (lab_grown, carats)
  INCLUDE (shape, color, clarity, cut, polish, symmetry, fluorescence_intensity,
           availability, feed_price, price_model_price, rating, certificate_lab,
           fancy_color)
  WHERE (status = 'active');
