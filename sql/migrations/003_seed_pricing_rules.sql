-- Migration: Seed pricing rules for all stone types (natural, lab, fancy)
-- Base margins: Natural = 40%, Lab = 79%, Fancy = 40%
-- margin_modifier is added to the base margin to get effective margin
-- e.g., Lab $0-500: 79% base + 6% modifier = 85% effective → 1.85x markup

-- Clear any existing rules
DELETE FROM "public"."pricing_rules";

-- ============================================================
-- NATURAL (base margin: 40%)
-- ============================================================
-- $0 - $499.99:       40% + 6% = 46% effective → 1.46x
-- $500 - $999.99:     40% + 6% = 46% effective → 1.46x
-- $1000 - $2999.99:   40% + 3% = 43% effective → 1.43x
-- $3000 - $5999.99:   40% + 0% = 40% effective → 1.40x
-- $6000 - $9999.99:   40% - 4% = 36% effective → 1.36x
-- $10000 - $19999.99: 40% - 9% = 31% effective → 1.31x
-- $20000+:            40% - 14% = 26% effective → 1.26x

INSERT INTO "public"."pricing_rules" ("priority", "stone_type", "price_min", "price_max", "margin_modifier", "active")
VALUES
  (10, 'natural',     0.00,   499.99, 6.00, true),
  (11, 'natural',   500.00,   999.99, 6.00, true),
  (12, 'natural',  1000.00,  2999.99, 3.00, true),
  (13, 'natural',  3000.00,  5999.99, 0.00, true),
  (14, 'natural',  6000.00,  9999.99, -4.00, true),
  (15, 'natural', 10000.00, 19999.99, -9.00, true),
  (16, 'natural', 20000.00,     NULL, -14.00, true);

-- ============================================================
-- LAB (base margin: 79%)
-- ============================================================
-- $0 - $499.99:       79% + 6% = 85% effective → 1.85x
-- $500 - $999.99:     79% + 6% = 85% effective → 1.85x
-- $1000 - $2999.99:   79% + 3% = 82% effective → 1.82x
-- $3000 - $5999.99:   79% + 0% = 79% effective → 1.79x
-- $6000 - $9999.99:   79% - 4% = 75% effective → 1.75x
-- $10000 - $19999.99: 79% - 9% = 70% effective → 1.70x
-- $20000+:            79% - 14% = 65% effective → 1.65x

INSERT INTO "public"."pricing_rules" ("priority", "stone_type", "price_min", "price_max", "margin_modifier", "active")
VALUES
  (20, 'lab',     0.00,   499.99, 6.00, true),
  (21, 'lab',   500.00,   999.99, 6.00, true),
  (22, 'lab',  1000.00,  2999.99, 3.00, true),
  (23, 'lab',  3000.00,  5999.99, 0.00, true),
  (24, 'lab',  6000.00,  9999.99, -4.00, true),
  (25, 'lab', 10000.00, 19999.99, -9.00, true),
  (26, 'lab', 20000.00,     NULL, -14.00, true);

-- ============================================================
-- FANCY (base margin: 40%)
-- ============================================================
-- $0 - $499.99:       40% + 6% = 46% effective → 1.46x
-- $500 - $999.99:     40% + 6% = 46% effective → 1.46x
-- $1000 - $2999.99:   40% + 3% = 43% effective → 1.43x
-- $3000 - $5999.99:   40% + 0% = 40% effective → 1.40x
-- $6000 - $9999.99:   40% - 4% = 36% effective → 1.36x
-- $10000 - $19999.99: 40% - 9% = 31% effective → 1.31x
-- $20000+:            40% - 14% = 26% effective → 1.26x

INSERT INTO "public"."pricing_rules" ("priority", "stone_type", "price_min", "price_max", "margin_modifier", "active")
VALUES
  (30, 'fancy',     0.00,   499.99, 6.00, true),
  (31, 'fancy',   500.00,   999.99, 6.00, true),
  (32, 'fancy',  1000.00,  2999.99, 3.00, true),
  (33, 'fancy',  3000.00,  5999.99, 0.00, true),
  (34, 'fancy',  6000.00,  9999.99, -4.00, true),
  (35, 'fancy', 10000.00, 19999.99, -9.00, true),
  (36, 'fancy', 20000.00,     NULL, -14.00, true);
