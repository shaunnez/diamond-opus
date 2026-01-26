# @diamond/database

PostgreSQL database client and query functions for the Diamond Opus platform.

## Overview

This package provides:

- **Connection pooling** via `pg` library
- **Query functions** for all database operations
- **Transaction support** for atomic operations
- **Type-safe** database interactions

## Installation

```json
{
  "dependencies": {
    "@diamond/database": "*"
  }
}
```

## Configuration

Requires the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:pass@db.supabase.co:5432/postgres
```

## Usage

### Connection Management

```typescript
import { getPool, closePool } from '@diamond/database';

// Get connection pool (singleton)
const pool = getPool();

// Close pool (on shutdown)
await closePool();
```

### Diamond Operations

```typescript
import {
  getDiamondById,
  getDiamondByOfferId,
  searchDiamonds,
  upsertDiamond,
  updateDiamondAvailability,
} from '@diamond/database';

// Get single diamond
const diamond = await getDiamondById('uuid-here');

// Search with filters
const results = await searchDiamonds({
  shape: 'ROUND',
  caratMin: 1.0,
  caratMax: 2.0,
  colors: ['D', 'E', 'F'],
  clarities: ['VVS1', 'VVS2'],
  labGrown: false,
  priceMin: 500000, // $5,000 in cents
  priceMax: 1000000,
  page: 1,
  limit: 50,
  sortBy: 'supplier_price_cents',
  sortOrder: 'asc',
});

// Upsert diamond
await upsertDiamond(diamondData);

// Update availability
await updateDiamondAvailability(diamondId, 'on_hold', holdId);
```

### Raw Diamond Operations

```typescript
import {
  upsertRawDiamond,
  getUnconsolidatedRawDiamonds,
  markAsConsolidated,
} from '@diamond/database';

// Insert raw Nivoda data
await upsertRawDiamond(runId, supplierStoneId, offerId, payload);

// Get unprocessed diamonds for consolidation
const rawDiamonds = await getUnconsolidatedRawDiamonds(
  1000, // batch size
  0     // offset
);

// Mark as processed
await markAsConsolidated(['id1', 'id2', 'id3']);
```

### Run Metadata Operations

```typescript
import {
  createRunMetadata,
  getRunMetadata,
  incrementCompletedWorkers,
  incrementFailedWorkers,
  completeRun,
} from '@diamond/database';

// Create new run
const run = await createRunMetadata('full', 10, watermarkBefore);

// Update worker counters (atomic)
const { completedWorkers, expectedWorkers, failedWorkers } =
  await incrementCompletedWorkers(runId);

// Mark run complete
await completeRun(runId, completedAt);
```

### Worker Run Operations

```typescript
import {
  createWorkerRun,
  updateWorkerRun,
  getFailedWorkerRuns,
} from '@diamond/database';

// Create worker record
const workerRun = await createWorkerRun(
  runId,
  partitionId,
  workerId,
  workItemPayload
);

// Update on completion
await updateWorkerRun(workerRun.id, 'completed', recordsProcessed);

// Get failed runs for retry
const failed = await getFailedWorkerRuns(runId);
```

### Pricing Rules

```typescript
import { getActivePricingRules } from '@diamond/database';

// Get all active rules sorted by priority
const rules = await getActivePricingRules();
```

### API Keys

```typescript
import { validateApiKey, updateApiKeyLastUsed } from '@diamond/database';

// Validate hashed key
const apiKey = await validateApiKey(hashedKey);

// Update usage timestamp
await updateApiKeyLastUsed(apiKey.id);
```

### Hold & Purchase History

```typescript
import {
  createHoldHistory,
  createPurchaseHistory,
} from '@diamond/database';

await createHoldHistory({
  diamondId,
  supplier: 'nivoda',
  supplierHoldId: 'hold-123',
  offerId,
  status: 'active',
  holdUntil: new Date(),
});

await createPurchaseHistory({
  diamondId,
  supplier: 'nivoda',
  supplierOrderId: 'order-456',
  offerId,
  idempotencyKey: 'unique-key',
  status: 'pending',
});
```

## Module Structure

```
src/
├── index.ts              # Main exports
├── client.ts             # Connection pool singleton
└── queries/
    ├── diamonds.ts       # Diamond CRUD operations
    ├── raw-diamonds.ts   # Raw data operations
    ├── run-metadata.ts   # Run tracking
    ├── worker-runs.ts    # Worker tracking
    ├── pricing-rules.ts  # Pricing rule queries
    ├── api-keys.ts       # API key validation
    ├── hold-history.ts   # Hold tracking
    ├── purchase-history.ts # Purchase tracking
    └── index.ts
```

## Connection Pool Settings

```typescript
{
  min: 2,              // Minimum connections
  max: 15,             // Maximum connections
  idleTimeoutMillis: 30000,  // 30 seconds
  connectionTimeoutMillis: 5000, // 5 seconds
}
```

## Database Schema

See `sql/bootstrap.sql` for the complete schema. Key tables:

| Table | Purpose |
|-------|---------|
| `diamonds` | Canonical diamond inventory |
| `raw_diamonds_nivoda` | Raw Nivoda API responses |
| `pricing_rules` | Pricing configuration |
| `run_metadata` | Batch run tracking |
| `worker_runs` | Individual worker tracking |
| `api_keys` | API authentication |
| `hold_history` | Hold audit trail |
| `purchase_history` | Purchase audit trail |

## Assumptions

1. **Supabase PostgreSQL**: Designed for Supabase, but works with any PostgreSQL
2. **Prices in cents**: All `*_cents` columns are BIGINT storing cents
3. **Soft deletes**: Diamonds use `status = 'deleted'` instead of hard delete
4. **Atomic counters**: Worker completion uses atomic increment to avoid races
5. **Connection pooling**: Single pool instance per process

## Error Handling

All query functions throw on database errors. Wrap in try/catch:

```typescript
try {
  const diamond = await getDiamondById(id);
} catch (error) {
  if (error.code === '23505') {
    // Unique constraint violation
  }
  throw error;
}
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
