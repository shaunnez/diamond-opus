# Worker Continuation Pattern Implementation

## Overview

This document describes the refactoring of the worker to use a continuation pattern for Azure Service Bus work items. The goal is to prevent lock expiry and redelivery issues by processing one page per message instead of looping through all pages in a single message.

## Problem Statement

### Before (Old Behavior)
- Worker received one `WORK_ITEM` message per partition
- Worker looped through all pages for that partition (30-40 minutes)
- Long processing time caused Service Bus lock expiry
- Lock expiry led to message redelivery and duplicate processing
- No clear progress tracking for failed/interrupted partitions

### After (New Behavior)
- One Service Bus message processes exactly **one page** only
- Each message completes quickly (under 60 seconds)
- Worker enqueues the next page as a new `WORK_ITEM` message
- Processing continues until partition is complete
- Idempotency guards prevent duplicate processing
- Database is the source of truth for progress

## Architecture

### Message Flow

```
Scheduler
    ↓
[WORK_ITEM offset=0, limit=30] → Worker → Process Page 0
    ↓                                            ↓
    |                             Update DB Progress (offset=30)
    |                                            ↓
    |                          [WORK_ITEM offset=30, limit=30] → Worker → Process Page 1
    |                                            ↓
    |                             Update DB Progress (offset=60)
    |                                            ↓
    |                          [WORK_ITEM offset=60, limit=30] → Worker → Process Page 2
    |                                            ↓
    |                                      Last Page Detected
    |                                            ↓
    |                                   Mark Partition Complete
    |                                            ↓
    ↓                                      [WORK_DONE] → Consolidator
```

### Database Schema

#### New Table: `partition_progress`

```sql
CREATE TABLE partition_progress (
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (run_id, partition_id)
);
```

**Purpose:** Track pagination progress for each partition to enable continuation and idempotency.

## Key Components

### 1. WorkItemMessage Contract Changes

**Added fields:**
- `offset: number` - Current page offset (page to fetch)
- `limit: number` - Page size (typically 30)

**Existing fields retained:**
- `runId`, `traceId`, `partitionId` - For tracking
- `minPrice`, `maxPrice` - Price range filter
- `totalRecords` - Expected total (informational)
- `offsetStart`, `offsetEnd` - Legacy fields (kept for compatibility)

**Example:**
```typescript
{
  type: 'WORK_ITEM',
  runId: 'abc-123',
  partitionId: 'partition-1',
  minPrice: 1000,
  maxPrice: 2000,
  offset: 0,      // NEW: Start at page 0
  limit: 30,      // NEW: Fetch 30 records
  // ... other fields
}
```

### 2. Idempotency Guard

**Implementation in `processWorkItemPage()`:**

```typescript
// 1. Initialize or get partition progress
await initializePartitionProgress(runId, partitionId);
const progress = await getPartitionProgress(runId, partitionId);

// 2. Skip if already completed
if (progress.completed) {
  return { recordsProcessed: 0, hasMore: false };
}

// 3. Skip if offset doesn't match expected nextOffset
if (workItem.offset !== progress.nextOffset) {
  // This is a duplicate or out-of-order message
  return { recordsProcessed: 0, hasMore: false };
}
```

**Why this works:**
- PostgreSQL atomic updates ensure only one message processes each offset
- Duplicate messages are safely ignored
- Out-of-order messages are rejected
- Retries are handled gracefully

### 3. Processing Logic Per Message

```typescript
async function processWorkItemPage(workItem, workerRunId, log) {
  // 1. Idempotency guard (see above)

  // 2. Fetch exactly one page from Nivoda
  const response = await adapter.searchDiamonds(query, {
    offset: workItem.offset,
    limit: workItem.limit
  });

  // 3. Handle empty result (end of partition)
  if (response.items.length === 0) {
    await completePartition(runId, partitionId, workItem.offset);
    return { recordsProcessed: 0, hasMore: false };
  }

  // 4. Bulk upsert all items in one query
  await bulkUpsertRawDiamonds(runId, items);

  // 5. Compute new offset
  const newOffset = workItem.offset + response.items.length;
  const hasMore = response.items.length === workItem.limit;

  // 6. Update progress in database
  if (hasMore) {
    await updatePartitionOffset(runId, partitionId, workItem.offset, newOffset);
  } else {
    await completePartition(runId, partitionId, newOffset);
  }

  return { recordsProcessed: response.items.length, hasMore };
}
```

### 4. Continuation Logic

**After processing a page:**

```typescript
if (hasMore) {
  // Enqueue next page
  const nextWorkItem = {
    ...workItem,
    offset: workItem.offset + recordsProcessed
  };

  // CRITICAL: This must succeed or throw
  await sendWorkItem(nextWorkItem);
} else {
  // Last page - send WORK_DONE only once per partition
  await sendWorkDone({ ... });
  await incrementCompletedWorkers(runId);

  // Check if all workers completed
  if (completedWorkers === expectedWorkers) {
    await sendConsolidate({ runId, traceId });
  }
}
```

**Important ordering:**
1. ✅ Update database progress first (commit)
2. ✅ Then enqueue next message
3. ✅ If enqueue fails, throw (message retried by Service Bus)
4. ✅ Idempotency guard prevents double progress on retry

### 5. Service Bus Message Metadata

**Deduplication via stable messageId:**

```typescript
const messageId = `${runId}:${partitionId}:${offset}`;

await sender.sendMessages({
  body: message,
  messageId,  // Azure Service Bus uses this for deduplication
  applicationProperties: {
    runId,
    partitionId,
    offset,
    limit
  }
});
```

**Benefits:**
- Azure Service Bus deduplicates messages with same messageId
- 10-minute deduplication window (configurable in Terraform)
- Prevents duplicate messages from race conditions

### 6. Worker Run and Counter Management

**Challenge:** Ensure `incrementCompletedWorkers()` is called only once per partition.

**Solution:**
- Worker run has `UNIQUE(run_id, partition_id)` constraint
- First message creates worker run
- Continuation messages reuse existing worker run
- Only the **last page** increments completed workers counter

```typescript
if (!hasMore) {
  // This was the last page
  await updateWorkerRun(workerRun.id, "completed", recordsProcessed);
  await incrementCompletedWorkers(workItem.runId);  // Only once!
}
```

### 7. Error Handling and Retry Strategy

**Transient errors:**
- Throw to trigger Service Bus retry
- Idempotency guard prevents duplicate work on retry
- Max 5 delivery attempts (configurable in Terraform)

**Permanent errors:**
- Mark worker run as failed
- Increment failed workers counter
- Send WORK_DONE with status=failed
- Consolidation skipped if any worker failed

**Example:**
```typescript
try {
  await processWorkItemPage(workItem, workerRunId, log);
  await sendWorkItem(nextWorkItem);  // May throw
} catch (error) {
  await updateWorkerRun(workerRun.id, "failed", recordsProcessed, error.message);
  await incrementFailedWorkers(workItem.runId);
  throw error;  // Retry by Service Bus
}
```

### 8. SIGTERM and Graceful Shutdown

**Implementation:**

```typescript
process.on("SIGTERM", async () => {
  log.info("Received SIGTERM, shutting down");
  // 1. Stop receiving new messages
  await closeConnections();
  // 2. Let current processing finish (already committed)
  // 3. Close database pool
  await closePool();
  process.exit(0);
});
```

**Behavior:**
- Stop receiving new messages immediately
- Current page processing completes naturally
- Database transactions commit before shutdown
- Service Bus messages are completed or abandoned gracefully

## Performance Improvements

### Bulk Upsert

**Old:** One database query per diamond (30 queries per page)
```typescript
for (const item of response.items) {
  await upsertRawDiamond(runId, item.diamond.id, item.id, item);
}
```

**New:** One database query per page (1 query for 30 diamonds)
```typescript
await bulkUpsertRawDiamonds(runId, allItems);
```

**Implementation:**
```sql
INSERT INTO raw_diamonds_nivoda (...)
SELECT
  $1,
  UNNEST($2::TEXT[]),
  UNNEST($3::TEXT[]),
  UNNEST($4::JSONB[]),
  ...
ON CONFLICT (supplier_stone_id) DO UPDATE ...
```

**Result:** ~30x fewer database round-trips per page.

## Configuration Changes

### Terraform (Service Bus Queue)

```hcl
resource "azurerm_servicebus_queue" "work_items" {
  # Reduced lock duration (2 min instead of 5 min)
  lock_duration = "PT2M"

  # Increased max delivery count (5 instead of 3)
  max_delivery_count = 5

  # NEW: Enable duplicate detection
  requires_duplicate_detection = true
  duplicate_detection_history_time_window = "PT10M"
}
```

**Rationale:**
- **PT2M lock:** Each page processes in <60s, so 2-minute lock is safe
- **5 retries:** Better fault tolerance for transient Nivoda API errors
- **Duplicate detection:** Prevents race conditions in continuation messages

## Migration Steps

### 1. Database Migration

Run in Supabase SQL Editor:
```bash
sql/migrations/002_partition_progress.sql
```

### 2. Deploy Code

```bash
npm run build:backend
docker build -t worker:continuation .
# Deploy to Azure Container Apps
```

### 3. Apply Terraform

**⚠️ Warning:** This will **recreate** the work-items queue (data loss).

**Safe approach:**
1. Drain existing work-items queue first
2. Wait for all workers to complete
3. Apply Terraform changes:
   ```bash
   cd infrastructure/terraform/environments/staging
   terraform apply
   ```

### 4. Verify

- Check partition_progress table for progress tracking
- Monitor worker logs for continuation messages
- Verify no lock expiry errors in Azure Portal

## Testing

### Unit Tests

Run idempotency guard tests:
```bash
npm run test -w @diamond/database
```

See: `packages/database/src/queries/__tests__/partition-progress.test.ts`

### Integration Test Scenario

1. **Start a run:**
   ```bash
   npm run dev:scheduler
   ```

2. **Monitor partition progress:**
   ```sql
   SELECT * FROM partition_progress WHERE run_id = 'your-run-id';
   ```

3. **Simulate worker failure:**
   - Kill worker mid-page
   - Verify idempotency on retry
   - Check that offset doesn't regress

4. **Verify completion:**
   ```sql
   SELECT * FROM partition_progress WHERE run_id = 'your-run-id' AND completed = true;
   ```

## Monitoring

### Key Metrics

- **partition_progress.next_offset:** Track pagination progress
- **worker_runs.records_processed:** Cumulative records per partition
- **Service Bus queue depth:** Should remain low (<100 messages)
- **Message lock duration:** Should be <60s per message

### Queries

```sql
-- Active partitions
SELECT * FROM partition_progress
WHERE completed = false
ORDER BY updated_at DESC;

-- Stuck partitions (no update in 10 minutes)
SELECT * FROM partition_progress
WHERE completed = false
  AND updated_at < NOW() - INTERVAL '10 minutes';

-- Worker completion status
SELECT
  rm.run_id,
  rm.completed_workers,
  rm.expected_workers,
  rm.failed_workers
FROM run_metadata rm
WHERE rm.completed_at IS NULL;
```

## Troubleshooting

### Issue: Partition stuck at same offset

**Diagnosis:**
```sql
SELECT * FROM partition_progress WHERE partition_id = 'stuck-partition';
```

**Possible causes:**
1. Worker crashed before enqueueing next message
2. Nivoda API returning errors
3. Service Bus queue paused

**Solution:**
- Check worker logs for errors
- Manually enqueue next message if needed
- Reset partition progress if corrupted

### Issue: Duplicate processing detected

**Diagnosis:**
- Check logs for "Offset mismatch, skipping duplicate"
- Verify Service Bus duplicate detection is enabled

**Solution:**
- Idempotency guard should handle this automatically
- No manual intervention needed

### Issue: Worker run not found

**Diagnosis:**
- Worker run creation failed on first page
- Continuation message can't find worker run

**Solution:**
- Worker will fetch existing run from database
- Fallback logic implemented in `handleWorkItem()`

## Files Modified

### Core Implementation
- ✅ `packages/shared/src/types/messages.ts` - Added offset/limit to WorkItemMessage
- ✅ `packages/database/src/queries/partition-progress.ts` - New partition progress queries
- ✅ `packages/database/src/queries/raw-diamonds.ts` - Added bulkUpsertRawDiamonds
- ✅ `packages/database/src/queries/index.ts` - Export partition-progress

### Worker Changes
- ✅ `apps/worker/src/index.ts` - Refactored to continuation pattern
- ✅ `apps/worker/src/service-bus.ts` - Added sendWorkItem for continuations

### Scheduler Changes
- ✅ `apps/scheduler/src/index.ts` - Set offset=0, limit=30 on initial messages
- ✅ `apps/scheduler/src/service-bus.ts` - Added messageId for deduplication

### Infrastructure
- ✅ `sql/migrations/002_partition_progress.sql` - New table migration
- ✅ `infrastructure/terraform/modules/service-bus/main.tf` - Queue config updates

### Testing
- ✅ `packages/database/src/queries/__tests__/partition-progress.test.ts` - Test harness
- ✅ `packages/shared/src/testing/factories.ts` - Updated mock factory

## Benefits Summary

### Reliability
- ✅ No more lock expiry issues
- ✅ Graceful handling of worker crashes
- ✅ Idempotent retry logic
- ✅ Clear progress tracking

### Performance
- ✅ 30x fewer database queries (bulk upsert)
- ✅ Faster message processing (<60s vs 30-40 min)
- ✅ Better parallelism (multiple workers per partition)

### Observability
- ✅ Real-time progress tracking in database
- ✅ Clear message flow in logs
- ✅ Easy to debug stuck partitions

### Maintainability
- ✅ Simpler worker logic (process one page)
- ✅ Easier to test (smaller units)
- ✅ Better separation of concerns

## Conclusion

The continuation pattern transforms the worker from a long-running, fragile process into a fast, resilient, and scalable microservice. Each message is small, predictable, and idempotent. The database serves as the authoritative source of truth for progress, enabling robust retry logic and clear observability.

**Key principle:** Database progress first, then enqueue next message. If enqueue fails, retry. Idempotency guard prevents duplicate work.
