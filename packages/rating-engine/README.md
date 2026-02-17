# Rating Engine

Rule-based rating system for diamonds with priority-based matching.

## Overview

The rating engine assigns quality ratings (1-10) to diamonds based on configurable rules stored in the `rating_rules` database table. Rules are evaluated in priority order (lowest number = highest priority) and the first matching rule determines the diamond's rating.

## Features

- **Priority-based matching**: Rules sorted by priority, first match wins
- **Multi-criteria filtering**: Price range, shape, color, clarity, cut, feed
- **Case-insensitive matching**: All attribute comparisons are case-insensitive
- **Flexible rule loading**: Load from database or set directly in memory
- **Singleton pattern**: Shared default engine instance with lazy loading

## Installation

```bash
npm install @diamond/rating-engine
```

## Usage

### Basic Usage

```typescript
import { RatingEngine } from '@diamond/rating-engine';

// Create engine instance
const engine = new RatingEngine();

// Load rules from database
await engine.loadRules();

// Calculate rating for a diamond
const rating = engine.calculateRating({
  feedPrice: 5000,
  shape: 'ROUND',
  color: 'D',
  clarity: 'VVS1',
  cut: 'IDEAL',
  feed: 'nivoda',
});

console.log(rating); // 8
```

### Using the Singleton

```typescript
import { getDefaultRatingEngine } from '@diamond/rating-engine';

// Get shared instance (loads rules on first call)
const engine = await getDefaultRatingEngine();

const rating = engine.calculateRating(diamond);
```

### Setting Rules Directly

```typescript
import { RatingEngine } from '@diamond/rating-engine';
import type { RatingRule } from '@diamond/shared';

const engine = new RatingEngine();

const rules: RatingRule[] = [
  {
    id: '1',
    priority: 10,
    priceMin: 10000,
    shapes: ['ROUND'],
    colors: ['D', 'E', 'F'],
    clarities: ['IF', 'VVS1'],
    cuts: ['IDEAL', 'EXCELLENT'],
    rating: 9,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    priority: 100,
    rating: 5, // Default rating
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

engine.setRules(rules);
```

## API

### `class RatingEngine`

#### `async loadRules(): Promise<void>`

Loads active rating rules from the database and sorts by priority.

```typescript
await engine.loadRules();
```

#### `setRules(rules: RatingRule[]): void`

Sets rules directly (bypasses database) and sorts by priority.

```typescript
engine.setRules([...rules]);
```

#### `findMatchingRule(diamond): RatingRule | undefined`

Finds the first matching rule for a diamond.

```typescript
const rule = engine.findMatchingRule({
  feedPrice: 5000,
  shape: 'ROUND',
  color: 'D',
  clarity: 'VVS1',
  cut: 'IDEAL',
  feed: 'nivoda',
});

if (rule) {
  console.log(`Matched rule ${rule.id} with rating ${rule.rating}`);
}
```

**Throws:** `Error` if rules not loaded

#### `calculateRating(diamond): number | undefined`

Calculates the rating for a diamond (convenience method).

```typescript
const rating = engine.calculateRating(diamond);
// Returns undefined if no rule matches
```

**Throws:** `Error` if rules not loaded

### `async getDefaultRatingEngine(): Promise<RatingEngine>`

Returns a shared singleton instance with rules pre-loaded from database.

```typescript
const engine = await getDefaultRatingEngine();
```

### `resetDefaultRatingEngine(): void`

Resets the singleton instance (useful for testing).

```typescript
resetDefaultRatingEngine();
```

## Rule Matching Logic

Rules are evaluated in priority order (ascending). For each rule:

1. **Price range**: `feedPrice >= priceMin` AND `feedPrice <= priceMax` (if defined)
2. **Shape**: `shape` in `rule.shapes` (if defined, case-insensitive)
3. **Color**: `color` in `rule.colors` (if defined, case-insensitive)
4. **Clarity**: `clarity` in `rule.clarities` (if defined, case-insensitive)
5. **Cut**: `cut` in `rule.cuts` (if defined, case-insensitive)
6. **Feed**: `feed` matches `rule.feed` (if defined)

**All conditions must pass** for a rule to match. The first matching rule determines the rating.

### Example Rules

```sql
-- High-end natural diamonds (D-F, IF-VVS1, Ideal/Excellent cut)
INSERT INTO rating_rules (priority, price_min, shapes, colors, clarities, cuts, rating, active)
VALUES (10, 5000, ARRAY['ROUND'], ARRAY['D','E','F'], ARRAY['IF','VVS1'], ARRAY['IDEAL','EXCELLENT'], 9, true);

-- Mid-range diamonds
INSERT INTO rating_rules (priority, price_min, price_max, rating, active)
VALUES (50, 1000, 5000, 6, true);

-- Default catch-all rule
INSERT INTO rating_rules (priority, rating, active)
VALUES (1000, 5, true);
```

## Database Schema

Rating rules are stored in the `rating_rules` table:

```sql
CREATE TABLE rating_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL,
  price_min NUMERIC(12,2),
  price_max NUMERIC(12,2),
  shapes TEXT[],
  colors TEXT[],
  clarities TEXT[],
  cuts TEXT[],
  feed TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rating_rules_priority ON rating_rules(priority) WHERE active = true;
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm run test

# Type check
npm run typecheck
```

## Testing

The package includes comprehensive tests covering:

- Rule loading and priority sorting
- Price range filtering
- Attribute matching (shape, color, clarity, cut, feed)
- Case-insensitive matching
- Multiple filter combinations
- Edge cases (empty rules, undefined attributes, zero price)

```bash
npm run test
```

## Integration with Consolidator

The rating engine is used during consolidation to assign ratings to diamonds:

```typescript
import { getDefaultRatingEngine } from '@diamond/rating-engine';

const ratingEngine = await getDefaultRatingEngine();

for (const diamond of diamonds) {
  const rating = ratingEngine.calculateRating(diamond);
  diamond.rating = rating ?? null; // Store null if no rule matches
}
```

## Migration

Initial rating rules can be created via migration:

```sql
-- sql/migrations/010_rating_system.sql
INSERT INTO rating_rules (priority, rating, active)
VALUES (1000, 5, true) -- Default rating for all diamonds
ON CONFLICT DO NOTHING;
```

## Related

- [packages/pricing-engine/README.md](../pricing-engine/README.md) - Pricing rule system
- [sql/migrations/010_rating_system.sql](../../sql/migrations/010_rating_system.sql) - Database migration
- [CLAUDE.md](../../CLAUDE.md) - Project documentation
