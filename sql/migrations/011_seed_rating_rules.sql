-- Migration: Seed rating rules for diamond quality assessment
-- Rating scale: 1-10 (10 = exceptional, 1 = poor)
-- Rules ordered by priority (lower number = higher priority)
-- Considers: shape, price range, color, clarity, cut grade

-- Clear any existing rating rules
DELETE FROM "public"."rating_rules";

-- ============================================================
-- TIER 1: EXCEPTIONAL (Rating: 10)
-- Premium shapes + Top color (D-E) + Top clarity (FL-IF) + Excellent cut
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "rating", "active")
VALUES
  (10, ARRAY['ROUND', 'OVAL', 'CUSHION'], ARRAY['D', 'E'], ARRAY['FL', 'IF'], ARRAY['EXCELLENT', 'IDEAL'], 10, true);

-- ============================================================
-- TIER 2: OUTSTANDING (Rating: 9)
-- Premium shapes + Near colorless (D-F) + VVS clarity + Excellent cut
-- Price: $10,000+
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (20, ARRAY['ROUND', 'OVAL'], ARRAY['D', 'E', 'F'], ARRAY['VVS1', 'VVS2'], ARRAY['EXCELLENT', 'IDEAL'], 10000.00, 9, true),
  (21, ARRAY['CUSHION', 'EMERALD', 'RADIANT'], ARRAY['D', 'E', 'F'], ARRAY['VVS1', 'VVS2'], ARRAY['EXCELLENT', 'IDEAL'], 8000.00, 9, true);

-- ============================================================
-- TIER 3: EXCELLENT (Rating: 8)
-- All shapes + Good color (D-G) + VS clarity + Excellent/VG cut
-- Price: $5,000+
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (30, ARRAY['ROUND', 'OVAL', 'CUSHION', 'EMERALD'], ARRAY['D', 'E', 'F', 'G'], ARRAY['VS1', 'VS2'], ARRAY['EXCELLENT', 'IDEAL', 'VERY GOOD'], 5000.00, 8, true),
  (31, ARRAY['PRINCESS', 'RADIANT', 'ASSCHER'], ARRAY['D', 'E', 'F', 'G'], ARRAY['VVS1', 'VVS2', 'VS1'], ARRAY['EXCELLENT', 'IDEAL'], 4000.00, 8, true),
  (32, ARRAY['PEAR', 'MARQUISE', 'HEART'], ARRAY['D', 'E', 'F'], ARRAY['VVS1', 'VVS2', 'VS1', 'VS2'], ARRAY['EXCELLENT', 'IDEAL'], 3000.00, 8, true);

-- ============================================================
-- TIER 4: VERY GOOD (Rating: 7)
-- All shapes + Near colorless (F-H) + VS-SI1 clarity + VG cut
-- Price: $2,000+
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (40, ARRAY['ROUND', 'OVAL'], ARRAY['F', 'G', 'H'], ARRAY['VS1', 'VS2', 'SI1'], ARRAY['EXCELLENT', 'VERY GOOD'], 2000.00, 7, true),
  (41, ARRAY['CUSHION', 'EMERALD', 'RADIANT', 'PRINCESS'], ARRAY['F', 'G', 'H'], ARRAY['VS1', 'VS2', 'SI1'], ARRAY['EXCELLENT', 'VERY GOOD'], 1500.00, 7, true),
  (42, ARRAY['ASSCHER', 'PEAR', 'MARQUISE'], ARRAY['E', 'F', 'G', 'H'], ARRAY['VS1', 'VS2'], ARRAY['VERY GOOD', 'GOOD'], 1000.00, 7, true);

-- ============================================================
-- TIER 5: GOOD (Rating: 6)
-- All shapes + Good color (G-I) + SI clarity + Good cut
-- Price: $1,000+
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (50, ARRAY['ROUND', 'OVAL', 'CUSHION'], ARRAY['G', 'H', 'I'], ARRAY['SI1', 'SI2'], ARRAY['VERY GOOD', 'GOOD'], 1000.00, 6, true),
  (51, ARRAY['EMERALD', 'RADIANT', 'PRINCESS', 'ASSCHER'], ARRAY['G', 'H', 'I'], ARRAY['VS2', 'SI1', 'SI2'], ARRAY['VERY GOOD', 'GOOD'], 800.00, 6, true),
  (52, ARRAY['PEAR', 'MARQUISE', 'HEART', 'TRILLIANT'], ARRAY['F', 'G', 'H', 'I'], ARRAY['VS2', 'SI1', 'SI2'], ARRAY['VERY GOOD', 'GOOD'], 500.00, 6, true);

-- ============================================================
-- TIER 6: ABOVE AVERAGE (Rating: 5)
-- All shapes + Fair color (H-J) + SI clarity + Good cut
-- Price: $500+
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (60, ARRAY['ROUND', 'OVAL'], ARRAY['H', 'I', 'J'], ARRAY['SI1', 'SI2'], ARRAY['GOOD'], 500.00, 5, true),
  (61, ARRAY['CUSHION', 'EMERALD', 'RADIANT', 'PRINCESS'], ARRAY['H', 'I', 'J'], ARRAY['SI1', 'SI2'], ARRAY['GOOD'], 400.00, 5, true),
  (62, NULL, ARRAY['G', 'H', 'I'], ARRAY['SI2'], ARRAY['GOOD', 'FAIR'], 300.00, 5, true);

-- ============================================================
-- TIER 7: AVERAGE (Rating: 4)
-- All shapes + Fair color (I-K) + SI2-I1 clarity + Fair cut
-- Price: $200+
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (70, ARRAY['I', 'J', 'K'], ARRAY['SI2', 'I1'], ARRAY['GOOD', 'FAIR'], 200.00, 4, true),
  (71, ARRAY['H', 'I', 'J'], ARRAY['I1'], ARRAY['GOOD'], 150.00, 4, true);

-- ============================================================
-- TIER 8: BELOW AVERAGE (Rating: 3)
-- Lower color (J-L) + I1-I2 clarity + Fair cut
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  (80, ARRAY['J', 'K', 'L'], ARRAY['I1', 'I2'], ARRAY['FAIR'], 100.00, 3, true),
  (81, ARRAY['I', 'J', 'K'], ARRAY['I2'], ARRAY['GOOD', 'FAIR'], 50.00, 3, true);

-- ============================================================
-- TIER 9: POOR (Rating: 2)
-- Lower color (K-M) + I2-I3 clarity + Poor cut
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "color", "clarity", "cut", "rating", "active")
VALUES
  (90, ARRAY['K', 'L', 'M'], ARRAY['I2', 'I3'], ARRAY['FAIR', 'POOR'], 2, true),
  (91, NULL, ARRAY['I3'], ARRAY['FAIR', 'POOR'], 2, true);

-- ============================================================
-- TIER 10: LOWEST (Rating: 1)
-- Lowest quality combinations
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "clarity", "rating", "active")
VALUES
  (100, ARRAY['I3'], 1, true);

-- ============================================================
-- SHAPE-SPECIFIC PREMIUM ADJUSTMENTS (Rating: 8-9)
-- Popular shapes with excellent specs get higher ratings
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "shape", "color", "clarity", "cut", "price_min", "rating", "active")
VALUES
  -- Round brilliant premium (most popular)
  (15, ARRAY['ROUND'], ARRAY['D', 'E', 'F'], ARRAY['IF', 'VVS1'], ARRAY['EXCELLENT', 'IDEAL'], 5000.00, 9, true),

  -- Oval premium (trending)
  (16, ARRAY['OVAL'], ARRAY['D', 'E', 'F'], ARRAY['VVS1', 'VVS2'], ARRAY['EXCELLENT', 'IDEAL'], 4000.00, 9, true),

  -- Cushion premium (classic)
  (17, ARRAY['CUSHION', 'CUSHION BRILLIANT', 'CUSHION MODIFIED'], ARRAY['D', 'E', 'F', 'G'], ARRAY['VVS1', 'VVS2'], ARRAY['EXCELLENT', 'IDEAL'], 4000.00, 8, true);

-- ============================================================
-- PRICE RANGE ADJUSTMENTS
-- Higher price ranges indicate rarer/larger stones
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "color", "clarity", "cut", "price_min", "price_max", "rating", "active")
VALUES
  -- Ultra-premium ($50k+) with very good specs
  (25, ARRAY['D', 'E', 'F', 'G'], ARRAY['VVS1', 'VVS2', 'VS1'], ARRAY['EXCELLENT', 'IDEAL'], 50000.00, NULL, 9, true),

  -- Premium ($20k-$50k) with very good specs
  (26, ARRAY['E', 'F', 'G', 'H'], ARRAY['VVS2', 'VS1', 'VS2'], ARRAY['EXCELLENT', 'VERY GOOD'], 20000.00, 50000.00, 8, true),

  -- Mid-premium ($10k-$20k) with good specs
  (27, ARRAY['F', 'G', 'H'], ARRAY['VS1', 'VS2', 'SI1'], ARRAY['VERY GOOD', 'GOOD'], 10000.00, 20000.00, 7, true);

-- ============================================================
-- BUDGET TIER CATCH-ALL RULES (Rating: 4-6)
-- Ensures all combinations get reasonable ratings
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "price_max", "rating", "active")
VALUES
  -- Budget-friendly under $1000
  (110, 1000.00, 5, true),

  -- Entry-level under $500
  (111, 500.00, 4, true);

-- ============================================================
-- DEFAULT FALLBACK (Rating: 5)
-- Catches anything not matched above
-- ============================================================
INSERT INTO "public"."rating_rules" ("priority", "rating", "active")
VALUES
  (999, 5, true);

-- Summary:
-- - 10: Exceptional - Top 1% (D-E, FL-IF, Excellent)
-- - 9:  Outstanding - Top 5% (D-F, VVS, Excellent, $10k+)
-- - 8:  Excellent - Top 15% (D-G, VS, VG+, $5k+)
-- - 7:  Very Good - Top 30% (F-H, VS-SI1, VG, $2k+)
-- - 6:  Good - Top 50% (G-I, SI, Good, $1k+)
-- - 5:  Above Average - Top 70% (H-J, SI, Good, $500+)
-- - 4:  Average - Top 85% (I-K, SI2-I1, Fair, $200+)
-- - 3:  Below Average - Top 95% (J-L, I1-I2, Fair)
-- - 2:  Poor - Top 99% (K-M, I2-I3, Poor)
-- - 1:  Lowest - Bottom 1% (I3 clarity)
