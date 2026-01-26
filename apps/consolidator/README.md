# Consolidator

Data transformation service that processes raw diamonds into the canonical schema with pricing.

## Overview

The consolidator is a **long-running queue consumer** that:

1. Receives `ConsolidateMessage` from Azure Service Bus
2. Validates all workers completed successfully
3. Batches raw diamonds from `raw_diamonds_nivoda`
4. Maps Nivoda payload to canonical `Diamond` schema
5. Applies pricing rules from `pricing_rules` table
6. Upserts to `diamonds` table
7. Advances watermark **only on success**

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
│ Batch Processing (concurrency: 10)      │
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
// Configuration
const BATCH_SIZE = 1000;      // Diamonds per batch
const CONCURRENCY = 10;       // Parallel batch processing
```

**Example run:**
- 150,000 raw diamonds
- 150 batches of 1,000
- 15 rounds with concurrency 10
- ~5-15 minutes total

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

Deployed as a **Container App** with Service Bus trigger:

```hcl
# Scaling configuration
min_replicas = 1
max_replicas = 2  # Low concurrency - consolidation is sequential

# Scale based on consolidate queue
scaling_rule {
  name             = "consolidate-scaling"
  queue_name       = "consolidate"
  message_count    = 1
}
```

## Module Structure

```
src/
├── index.ts          # Entry point and message handler
├── processor.ts      # Batch processing orchestration
├── transformer.ts    # Nivoda → Diamond mapping
├── pricer.ts         # Pricing rule application
├── watermark.ts      # Watermark advancement
└── alerter.ts        # Failure notification
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

  // Pricing (in cents)
  supplier_price_cents: item.price * 100,

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

Typical metrics:

| Metric | Value |
|--------|-------|
| Batches per run | 100-200 |
| Records per batch | 1,000 |
| Time per batch | 10-50ms |
| Total consolidation | 5-15 minutes |
| Memory usage | 200-500MB |
