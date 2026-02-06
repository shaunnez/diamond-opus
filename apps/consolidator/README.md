# Consolidator

Data transformation service that processes raw diamonds into the canonical schema with pricing.

## Overview

The consolidator is a **long-running queue consumer** that:

1. Receives `ConsolidateMessage` from Azure Service Bus
2. Validates all workers completed successfully
3. Fetches raw diamonds with `FOR UPDATE SKIP LOCKED` (multi-replica safe)
4. Maps Nivoda payload to canonical `Diamond` schema in batches
5. Applies pricing rules from `pricing_rules` table
6. **Batch upserts** to `diamonds` table (100 diamonds per INSERT)
7. Advances watermark **only on success**

## Performance Optimizations

The consolidator is optimized for processing 500k+ records efficiently:

### Batch Upserts

Instead of individual INSERTs, diamonds are upserted in batches using PostgreSQL `UNNEST`:

```typescript
// Configuration (packages/shared/src/constants.ts)
CONSOLIDATOR_BATCH_SIZE = 2000;        // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100;  // Diamonds per batch INSERT
CONSOLIDATOR_CONCURRENCY = 2;          // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
```

**Performance comparison (500k records):**

| Approach | DB Operations | Est. Time |
|----------|---------------|-----------|
| Individual upserts | 500,000 | ~40 min |
| Batch upserts (100/batch) | 5,000 | ~2-4 min |

### Multi-Replica Support

Uses `FOR UPDATE SKIP LOCKED` for safe parallel processing:

```sql
SELECT * FROM raw_diamonds_nivoda
WHERE consolidated = FALSE
ORDER BY created_at ASC
LIMIT 2000
FOR UPDATE SKIP LOCKED;  -- Other replicas skip these rows
```

**Benefits:**
- Multiple consolidator replicas process different rows
- No duplicate processing or race conditions
- Linear scaling with replica count

## How It Works

### Consolidation Flow

```
┌─────────────────┐
│ Service Bus     │
│ consolidate     │
│ queue           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Validation      │────▶│ Check all       │
│                 │     │ workers passed  │
└────────┬────────┘     └─────────────────┘
         │
         │ if all passed
         ▼
┌─────────────────┐
│ Load pricing    │
│ rules           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Batch Processing (concurrency: 2)       │
│ ┌─────────────┐  ┌─────────────┐        │
│ │ Batch 1     │  │ Batch 2     │  ...   │
│ │ 1000 items  │  │ 1000 items  │        │
│ └──────┬──────┘  └──────┬──────┘        │
│        │                │               │
│        ▼                ▼               │
│   Map + Price      Map + Price          │
│        │                │               │
│        ▼                ▼               │
│   Upsert to        Upsert to            │
│   diamonds         diamonds             │
└────────────────────┬────────────────────┘
                     │
                     ▼
              ┌─────────────────┐
              │ Mark raw as     │
              │ consolidated    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Advance         │
              │ watermark       │
              └─────────────────┘
```

### Batch Processing

```typescript
// Configuration (from packages/shared/src/constants.ts)
CONSOLIDATOR_BATCH_SIZE = 2000;        // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100;  // Diamonds per batch INSERT
CONSOLIDATOR_CONCURRENCY = 2;          // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
```

**Example run (500k diamonds, 3 replicas):**
- 500,000 raw diamonds ÷ 3 replicas = ~167k per replica
- 167k ÷ 2000 batch = 84 fetch cycles per replica
- 2000 ÷ 100 = 20 batch upserts per cycle
- 20 ÷ 2 concurrency = 10 sequential rounds per cycle
- **Total: ~1-2 minutes with 3 replicas**

## Configuration

Required environment variables:

```bash
DATABASE_URL=postgresql://...
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
RESEND_API_KEY=re_...              # For failure alerts
ALERT_EMAIL_TO=alerts@example.com
ALERT_EMAIL_FROM=noreply@yourdomain.com
```

## Running

```bash
# Development (long-running)
npm run dev:consolidator

# Production
npm run build
node dist/index.js

# Manual trigger (force consolidation)
npm run consolidator:trigger
```

## Azure Deployment

Deployed as a **Container App** with Service Bus auto-scaling:

```hcl
# Scaling configuration (supports multi-replica with FOR UPDATE SKIP LOCKED)
min_replicas = 1
max_replicas = 3  # Safe with row-level locking

# Resource allocation (increased for batch operations)
cpu    = 0.5
memory = "1Gi"

# Auto-scale based on consolidate queue depth
custom_scale_rule {
  name             = "servicebus-consolidate-scale"
  custom_rule_type = "azure-servicebus"
  metadata = {
    queueName              = "consolidate"
    messageCount           = "1"
    activationMessageCount = "0"
  }
}
```

**Scaling behavior:**
- Scales up when messages arrive in `consolidate` queue
- Multiple replicas process different rows (no conflicts)
- Scales down to `min_replicas` when queue is empty

## Module Structure

```
src/
├── index.ts          # Entry point, message handler, and batch processing
├── service-bus.ts    # Service Bus message handling
├── trigger.ts        # Manual consolidation trigger
├── watermark.ts      # Watermark advancement
└── alerts.ts         # Failure notification via Resend
```

## Consolidate Message

Received from `consolidate` queue:

```typescript
interface ConsolidateMessage {
  runId: string;
  force?: boolean;  // Skip worker validation
}
```

## Transformation Logic

### Nivoda → Diamond Mapping

```typescript
// Key field mappings
{
  // Identity (CRITICAL - see CLAUDE.md)
  supplier_stone_id: item.diamond.id,  // For tracking/dedup
  offer_id: item.id,                   // For ordering/holds

  // Core attributes
  shape: item.diamond.shape,
  carats: item.diamond.carats,
  color: item.diamond.color,
  clarity: item.diamond.clarity,

  // Pricing (in dollars)
  priceModelPrice: item.price,

  // Availability mapping
  availability: mapAvailability(item.availability),
  // "available" | "on_hold" | "sold" | "unavailable"
}
```

### Pricing Application

```typescript
// From pricing-engine package
const engine = new PricingEngine();
await engine.loadRules();

const result = engine.calculatePricing(diamond);
// Returns:
// - retailPriceCents: supplier_price * markup_ratio
// - pricePerCaratCents: supplier_price / carats
// - markupRatio: from matched rule
// - rating: from matched rule (1-10)
```

## Watermark Management

**Only advanced on successful consolidation:**

```typescript
// After all batches complete successfully
await saveWatermark({
  lastUpdatedAt: new Date().toISOString(),
  lastRunId: message.runId,
  lastRunCompletedAt: new Date().toISOString()
});
```

**Location:** Azure Blob Storage `watermarks/nivoda.json`

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| Worker failures detected | Skip consolidation, log warning |
| Database error during batch | Retry batch 3 times, then fail run |
| Pricing engine error | Use default pricing (1.15x, rating 5) |
| Watermark save fails | Log error, send alert |
| Any critical failure | Send email alert via Resend |

### Failure Alerts

Sent via Resend when consolidation fails:

```typescript
{
  to: process.env.ALERT_EMAIL_TO,
  from: process.env.ALERT_EMAIL_FROM,
  subject: `Diamond Consolidation Failed - Run ${runId}`,
  html: `
    <h2>Consolidation Failure</h2>
    <p>Run ID: ${runId}</p>
    <p>Error: ${errorMessage}</p>
    <p>Time: ${new Date().toISOString()}</p>
  `
}
```

## Force Consolidation

Skip worker validation for failed runs:

```bash
# Trigger manually with force flag
npm run consolidator:trigger -- --force

# Or send message directly
{
  "runId": "your-run-id",
  "force": true
}
```

**Use cases:**
- Some workers failed but data is usable
- Need to reprocess with updated pricing rules
- Recovery after partial failure

## Assumptions

1. **Pricing rules loaded**: Rules cached in memory for batch
2. **Raw data complete**: All workers finished before consolidation
3. **Idempotent upserts**: Re-running consolidation safe
4. **Watermark atomicity**: Only one consolidator advances watermark
5. **Soft deletes**: Diamonds not in raw data marked as deleted

## Monitoring

Key metrics to watch:

- **Batch processing time**: Should be 10-50ms per batch
- **Total consolidation time**: 5-15 minutes for full inventory
- **Pricing rule matches**: % of diamonds with non-default pricing
- **Error rate**: Failed batches / total batches

## Debugging

```bash
# Check run status
SELECT * FROM run_metadata WHERE run_id = 'your-run-id';

# Check worker completion
SELECT status, COUNT(*)
FROM worker_runs
WHERE run_id = 'your-run-id'
GROUP BY status;

# Check unconsolidated raw diamonds
SELECT COUNT(*)
FROM raw_diamonds_nivoda
WHERE NOT consolidated;

# Check recent consolidations
SELECT id, created_at, updated_at
FROM diamonds
ORDER BY updated_at DESC
LIMIT 10;

# View consolidator logs
az containerapp logs show --name diamond-consolidator --resource-group rg-diamond

# Check watermark
az storage blob download \
  --container-name watermarks \
  --name nivoda.json \
  --file /dev/stdout
```

## Performance

Typical metrics (with batch optimizations):

| Metric | Single Replica | 3 Replicas |
|--------|----------------|------------|
| Records per fetch | 2,000 | 2,000 |
| Diamonds per upsert | 100 | 100 |
| DB operations (500k records) | ~5,000 | ~5,000 |
| Total consolidation time | ~4-6 min | ~1-2 min |
| Memory usage | 300-600MB | 300-600MB |

**Connection pool usage:**
- 2 concurrent batch upserts × 1 connection each = 2 connections per replica
- Concurrency should not exceed PG_POOL_MAX (default 2)
