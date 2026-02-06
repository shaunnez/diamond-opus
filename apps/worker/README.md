# Worker

Diamond ingestion service that fetches data from Nivoda and stores raw payloads.

## Overview

The worker is a **long-running queue consumer** that:

1. Receives `WorkItemMessage` from Azure Service Bus
2. Fetches diamonds from Nivoda GraphQL API for assigned price range
3. Writes raw JSON payloads to `raw_diamonds_nivoda` table
4. Reports completion status to database
5. Last worker triggers consolidation

## How It Works

### Message Processing Flow

```
┌─────────────────┐
│ Service Bus     │
│ work-items queue│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Worker Instance │────▶│ Nivoda GraphQL  │
│ (1 of N)        │     │ API             │
└────────┬────────┘     └─────────────────┘
         │
         │ paginated fetch (page size: 30)
         ▼
┌─────────────────┐
│ raw_diamonds_   │
│ nivoda table    │
└────────┬────────┘
         │
         │ report completion
         ▼
┌─────────────────┐     ┌─────────────────┐
│ run_metadata    │────▶│ If last worker: │
│ (atomic counter)│     │ trigger consol. │
└─────────────────┘     └─────────────────┘
```

### Pagination Strategy

Workers paginate through their assigned price range:

```typescript
// Fetch configuration
const PAGE_SIZE = 30;           // Items per request
const MAX_RETRIES = 3;          // Per-page retry attempts
const RETRY_DELAY_MS = 2000;    // Base delay (exponential backoff)
```

**Example:**
- Worker assigned: $1,000-$2,000 range, ~5,000 diamonds
- Pages needed: ~167 API calls (5000 / 30)
- Total time: ~5-10 minutes depending on API latency

### Atomic Counter

Workers use database atomic increment to coordinate:

```sql
-- When worker completes successfully
UPDATE run_metadata
SET completed_workers = completed_workers + 1
WHERE run_id = $1
RETURNING completed_workers, expected_workers;

-- If completed_workers == expected_workers → trigger consolidation
```

## Configuration

Required environment variables:

```bash
DATABASE_URL=postgresql://...
NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
NIVODA_USERNAME=your-username
NIVODA_PASSWORD=your-password
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...

# Alerts (optional - falls back to console logging)
RESEND_API_KEY=re_...
ALERT_EMAIL_TO=alerts@example.com
ALERT_EMAIL_FROM=noreply@yourdomain.com
```

## Running

```bash
# Development (long-running)
npm run dev:worker

# Production
npm run build
node dist/index.js

# Manual retry of failed partitions
npm run worker:retry
```

## Azure Deployment

Deployed as a **Container App** with Service Bus scaling:

```hcl
# Scaling configuration
min_replicas = 1
max_replicas = 10

# Scale based on queue depth
scaling_rule {
  name             = "queue-scaling"
  queue_name       = "work-items"
  message_count    = 5
}
```

## Module Structure

```
src/
├── index.ts          # Entry point, message handler, and processing logic
├── service-bus.ts    # Service Bus message publishing (continuations)
├── alerts.ts         # Email notifications via Resend
└── retry.ts          # Manual retry functionality
```

## Work Item Message

Received from `work-items` queue:

```typescript
interface WorkItemMessage {
  runId: string;
  partitionId: string;
  priceMin: number;      // Filter: dollar_value.from
  priceMax: number;      // Filter: dollar_value.to
  expectedRecords: number;
  isIncremental: boolean;
  watermarkBefore?: string;  // For incremental: updated_at filter
}
```

## Raw Diamond Storage

Inserts to `raw_diamonds_nivoda` table:

```typescript
{
  run_id: message.runId,
  supplier_stone_id: item.diamond.id,  // For deduplication
  offer_id: item.id,                   // For ordering
  source_updated_at: item.updated_at,
  payload: item,                       // Full Nivoda response
  payload_hash: sha256(JSON.stringify(item)),
  consolidated: false
}
```

**Upsert Logic:**
- Key: `supplier_stone_id` (unique constraint)
- On conflict: Update payload, payload_hash, source_updated_at

## Worker Run Tracking

Each worker creates a record in `worker_runs`:

```sql
INSERT INTO worker_runs (
  run_id,
  partition_id,
  worker_id,
  status,              -- 'running' → 'completed' or 'failed'
  records_processed,
  work_item_payload,   -- Original message (for retry)
  error_message        -- If failed
)
```

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| Nivoda API error | Retry 3 times with exponential backoff |
| Database error | Retry 3 times, then mark partition failed |
| Message expires | Moves to dead-letter queue |
| Worker crash | Message returns to queue (lock timeout) |

**On Worker Failure:**
1. Worker marks partition as `failed` in `partition_progress`
2. Checks if all workers are done (completed + failed >= expected)
3. If ≥70% of workers succeeded → auto-starts consolidation after 5-minute delay
4. If <70% succeeded → skips consolidation, sends failure alert email

## Manual Retry

Retry failed partitions from a specific run:

```bash
# Retry all failed partitions
npm run worker:retry

# Or programmatically
import { retryFailedPartitions } from './retry';
await retryFailedPartitions(runId);
```

This:
1. Queries `worker_runs` for failed partitions
2. Re-publishes original `WorkItemMessage` to queue
3. Resets worker status to 'running'

## Assumptions

1. **Nivoda pagination**: Max 50 items per request, worker uses 30
2. **Offer ID stability**: Same diamond may have different offer IDs over time
3. **Supplier stone ID**: Unique identifier for deduplication
4. **Idempotent inserts**: Re-processing same diamond updates existing record
5. **Token caching**: Nivoda token valid for 6 hours, refreshed automatically

## Monitoring

Key metrics to watch:

- **Queue depth**: Should decrease as workers process
- **Records processed**: Compare to expected from work item
- **Error rate**: Failed pages / total pages
- **Processing time**: Time to complete partition

## Debugging

```bash
# Check worker status for a run
SELECT partition_id, status, records_processed, error_message
FROM worker_runs
WHERE run_id = 'your-run-id';

# Check queue depth
az servicebus queue show \
  --name work-items \
  --namespace-name sb-diamond \
  --query 'countDetails.activeMessageCount'

# View worker logs
az containerapp logs show --name diamond-worker --resource-group rg-diamond

# Check dead-letter queue
az servicebus queue show \
  --name work-items/$deadletterqueue \
  --namespace-name sb-diamond
```

## Performance

Typical metrics:

| Metric | Value |
|--------|-------|
| API calls per partition | 100-200 |
| Records per partition | 3,000-8,000 |
| Time per partition | 3-10 minutes |
| Concurrent workers | 1-30 |
| Total ingestion time | 10-45 minutes |
