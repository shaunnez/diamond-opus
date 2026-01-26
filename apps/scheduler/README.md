# Scheduler

Job partitioning service that orchestrates the diamond ingestion pipeline.

## Overview

The scheduler is a **cron-triggered job** that:

1. Reads the current watermark from Azure Blob Storage
2. Performs a **heatmap scan** to analyze Nivoda inventory density
3. Partitions the workload into price-range segments
4. Creates run metadata in the database
5. Publishes work items to Azure Service Bus

## How It Works

### Heatmap Algorithm

The heatmap scanner analyzes diamond distribution by price to create balanced partitions:

```
Price Range Analysis:
┌────────────────────────────────────────────────────────────┐
│ $0-$20,000 (Dense Zone)                                    │
│ ████████████████████████████████ 80% of diamonds           │
│ Fixed $100 steps for fine granularity                      │
├────────────────────────────────────────────────────────────┤
│ $20,000-$250,000 (Sparse Zone)                             │
│ ████ 20% of diamonds                                       │
│ Adaptive stepping based on density                         │
└────────────────────────────────────────────────────────────┘
```

**Key Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `HEATMAP_DENSE_ZONE_THRESHOLD` | $20,000 | Price threshold for dense zone |
| `HEATMAP_DENSE_ZONE_STEP` | $100 | Fixed step size in dense zone |
| `HEATMAP_MAX_WORKERS` | 30 | Maximum parallel workers |
| `HEATMAP_MIN_RECORDS_PER_WORKER` | 1,000 | Minimum records to spawn worker |
| `RECORDS_PER_WORKER` | 5,000 | Target records per worker |

### Run Types

**Full Run:**
- Triggered when no watermark exists or on manual request
- Scans entire price range ($0-$250,000)
- Creates up to 30 worker partitions
- Clears raw_diamonds_nivoda table first

**Incremental Run:**
- Triggered when watermark exists
- Only fetches diamonds updated since last watermark
- Creates fewer partitions (up to 10 workers)
- Appends to existing raw data

### Partition Strategy

```
Example Full Run Output:
┌─────────────┬─────────────┬──────────┐
│ Partition   │ Price Range │ Est. Diamonds │
├─────────────┼─────────────┼──────────┤
│ partition-1 │ $0-$500     │ 5,200    │
│ partition-2 │ $500-$1,000 │ 4,800    │
│ partition-3 │ $1,000-$1,500│ 5,100   │
│ ...         │ ...         │ ...      │
│ partition-30│ $100k-$250k │ 3,200    │
└─────────────┴─────────────┴──────────┘
```

## Configuration

Required environment variables:

```bash
DATABASE_URL=postgresql://...
NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
NIVODA_USERNAME=your-username
NIVODA_PASSWORD=your-password
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
```

## Running

```bash
# Development (runs once and exits)
npm run dev:scheduler

# Production
npm run build
node dist/index.js
```

## Azure Deployment

Deployed as a **Container Apps Job** with cron schedule:

```hcl
schedule = "0 2 * * *"  # 2 AM UTC daily
```

The job:
- Starts at scheduled time
- Runs once to completion
- Exits when done

## Module Structure

```
src/
├── index.ts          # Entry point
├── heatmap.ts        # Density scanning algorithm
├── partitioner.ts    # Work item creation
└── watermark.ts      # Azure Blob watermark operations
```

## Watermark Management

**Location:** Azure Blob Storage `watermarks/nivoda.json`

```json
{
  "lastUpdatedAt": "2024-01-15T02:00:00.000Z",
  "lastRunId": "abc-123-def",
  "lastRunCompletedAt": "2024-01-15T02:45:00.000Z"
}
```

**Watermark Flow:**
1. Scheduler **reads** watermark at start
2. If exists → incremental run (filter by `updated_at > lastUpdatedAt`)
3. If not exists → full run
4. Watermark is **only advanced** by consolidator on successful completion

## Work Item Message

Published to `work-items` queue:

```typescript
interface WorkItemMessage {
  runId: string;
  partitionId: string;
  priceMin: number;      // in dollars
  priceMax: number;      // in dollars
  expectedRecords: number;
  isIncremental: boolean;
  watermarkBefore?: string;
}
```

## Run Metadata

Created in database before publishing work items:

```sql
INSERT INTO run_metadata (
  run_id,
  run_type,           -- 'full' or 'incremental'
  expected_workers,   -- number of partitions
  watermark_before    -- for incremental runs
)
```

## Assumptions

1. **Nivoda API availability**: Scheduler assumes API is reachable for count queries
2. **Diamond distribution**: Most diamonds are in $0-$20,000 range (80%+)
3. **Count accuracy**: Uses `diamonds_by_query_count` (not paginated total_count)
4. **Single scheduler**: Only one scheduler instance runs at a time
5. **Idempotent runs**: If scheduler crashes mid-run, next run starts fresh

## Error Handling

| Error | Behavior |
|-------|----------|
| Nivoda API unreachable | Log error, exit with code 1 |
| Service Bus unavailable | Retry 3 times with backoff, then fail |
| Database unreachable | Log error, exit with code 1 |
| Empty inventory | Log warning, create 0 work items |

## Monitoring

Key metrics to watch:

- **Partition count**: Should be 1-30 for full runs
- **Estimated records**: Should match actual Nivoda inventory
- **Run duration**: Typically 1-5 minutes for scanning
- **Heatmap API calls**: ~50-200 count queries per run

## Debugging

```bash
# Check last run in database
SELECT * FROM run_metadata ORDER BY started_at DESC LIMIT 1;

# Check watermark blob
az storage blob download \
  --container-name watermarks \
  --name nivoda.json \
  --file /dev/stdout

# View scheduler logs
az containerapp logs show --name diamond-scheduler --resource-group rg-diamond
```
