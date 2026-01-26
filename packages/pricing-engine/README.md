# @diamond/pricing-engine

Rule-based pricing engine for the Diamond Opus platform.

## Overview

This package provides:

- **Rule matching** based on diamond attributes
- **Markup calculation** for retail pricing
- **Rating assignment** for quality scoring
- **Database-driven** configuration via `pricing_rules` table

## Installation

```json
{
  "dependencies": {
    "@diamond/pricing-engine": "*"
  }
}
```

## Usage

### Basic Usage

```typescript
import { PricingEngine } from '@diamond/pricing-engine';

const engine = new PricingEngine();

// Load rules from database
await engine.loadRules();

// Apply pricing to a diamond
const pricedDiamond = engine.applyPricing(baseDiamond);
// pricedDiamond now has: retailPriceCents, markupRatio, rating
```

### Singleton Pattern

```typescript
import { getDefaultPricingEngine, resetDefaultPricingEngine } from '@diamond/pricing-engine';

// Get cached engine instance
const engine = await getDefaultPricingEngine();

// Reset for testing
resetDefaultPricingEngine();
```

### Calculate Pricing Only

```typescript
const pricing = engine.calculatePricing({
  carats: 1.5,
  shape: 'ROUND',
  labGrown: false,
  supplier: 'nivoda',
  supplierPriceCents: 500000, // $5,000
});

// pricing = {
//   supplierPriceCents: 500000,
//   retailPriceCents: 575000,   // with 1.15x markup
//   pricePerCaratCents: 333333, // per carat
//   markupRatio: 1.15,
//   rating: 5,
//   matchedRuleId: 'uuid-of-rule',
// }
```

### Find Matching Rule

```typescript
const rule = engine.findMatchingRule({
  carats: 2.0,
  shape: 'OVAL',
  labGrown: true,
  supplier: 'nivoda',
});

if (rule) {
  console.log(`Matched rule: ${rule.id}, markup: ${rule.markupRatio}`);
}
```

### Set Rules Manually (Testing)

```typescript
engine.setRules([
  {
    id: 'rule-1',
    priority: 10,
    caratMin: 1.0,
    caratMax: 2.0,
    shapes: ['ROUND'],
    markupRatio: 1.20,
    rating: 8,
    active: true,
  },
  {
    id: 'default',
    priority: 1000,
    markupRatio: 1.15,
    rating: 5,
    active: true,
  },
]);
```

## Rule Matching Algorithm

Rules are matched in **priority order** (lower number = higher precedence):

1. Load all active rules sorted by priority
2. For each rule, check if diamond matches:
   - `caratMin <= diamond.carats` (if specified)
   - `diamond.carats <= caratMax` (if specified)
   - `diamond.shape in shapes` (if shapes array specified)
   - `diamond.labGrown === rule.labGrown` (if specified)
   - `diamond.supplier === rule.supplier` (if specified)
3. **First matching rule wins**
4. If no rule matches, use default markup (1.15x)

## Rule Structure

```typescript
interface PricingRule {
  id: string;
  priority: number;      // Lower = higher precedence

  // Match criteria (null = matches all)
  caratMin?: number;
  caratMax?: number;
  shapes?: string[];     // ['ROUND', 'OVAL', ...]
  labGrown?: boolean;
  supplier?: string;

  // Outputs
  markupRatio: number;   // e.g., 1.15 for 15% markup
  rating?: number;       // 1-10 quality score

  active: boolean;
}
```

## Pricing Calculation

```
retailPriceCents = round(supplierPriceCents * markupRatio)
pricePerCaratCents = round(supplierPriceCents / carats)
```

All calculations use integer arithmetic (cents) to avoid floating-point issues.

## Database Schema

```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,

  -- Match criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],
  lab_grown BOOLEAN,
  supplier TEXT,

  -- Outputs
  markup_ratio DECIMAL(5,4) NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default rule (always matches, lowest priority)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

## Example Rules

```sql
-- Premium for large natural rounds
INSERT INTO pricing_rules (priority, shapes, carat_min, lab_grown, markup_ratio, rating)
VALUES (10, ARRAY['ROUND'], 3.0, false, 1.30, 9);

-- Lower markup for lab-grown
INSERT INTO pricing_rules (priority, lab_grown, markup_ratio, rating)
VALUES (20, true, 1.10, 6);

-- Specific supplier pricing
INSERT INTO pricing_rules (priority, supplier, markup_ratio)
VALUES (30, 'preferred-supplier', 1.12);

-- Small stones get lower markup
INSERT INTO pricing_rules (priority, carat_max, markup_ratio, rating)
VALUES (50, 0.5, 1.08, 4);

-- Default (always keep a catch-all)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

## Module Structure

```
src/
├── index.ts              # Main exports
└── engine.ts             # PricingEngine class
```

## Assumptions

1. **First match wins**: Rules are not combined, first matching rule applies
2. **Default markup**: 1.15 (15%) if no rule matches
3. **Prices in cents**: All monetary values are integers
4. **Rules from database**: Production rules stored in `pricing_rules` table
5. **Priority ordering**: Lower number = higher priority

## Error Handling

```typescript
const engine = new PricingEngine();

// This will throw if rules not loaded
try {
  engine.findMatchingRule(diamond);
} catch (error) {
  // Error: Pricing rules not loaded. Call loadRules() first.
}

// Correct usage
await engine.loadRules();
const rule = engine.findMatchingRule(diamond);
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Tests
npm run test
```

## Testing

```typescript
import { PricingEngine } from '@diamond/pricing-engine';
import { createTestDiamond, createTestPricingRule } from '@diamond/shared/testing';

describe('PricingEngine', () => {
  it('applies correct markup', () => {
    const engine = new PricingEngine();
    engine.setRules([
      createTestPricingRule({ priority: 10, markupRatio: 1.25 }),
    ]);

    const diamond = createTestDiamond({ supplierPriceCents: 100000 });
    const result = engine.applyPricing(diamond);

    expect(result.retailPriceCents).toBe(125000);
    expect(result.markupRatio).toBe(1.25);
  });
});
```
