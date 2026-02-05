# Dashboard Sync Issue Analysis: partition_progress vs worker_runs

## Problem Statement

After retrying failed workers, the dashboard analytics shows more failed workers than appear in the workers table:
- **Analytics** (from `run_metadata.failed_workers`): 3 failed workers
- **Workers Table** (from `worker_runs` WHERE status='failed'): 2 failed workers

## Root Cause Analysis

### Architecture Overview

The system uses **two separate tracking mechanisms** for worker failures:

1. **`partition_progress` table**: Tracks partition-level state
   - `failed` BOOLEAN flag
   - Purpose: Idempotent failure marking
   - Updated by: `markPartitionFailed()`

2. **`worker_runs` table**: Tracks individual worker execution records
   - `status` TEXT field ('running', 'completed', 'failed')
   - Purpose: Execution history and retry payloads
   - Constraint: `UNIQUE(run_id, partition_id)` - one record per partition

3. **`run_metadata` table**: Tracks aggregate counters
   - `failed_workers` INTEGER counter
   - Updated by: `incrementFailedWorkers()` and `decrementFailedWorkers()`

### The Synchronization Contract

The counters should remain synchronized as follows:
```
run_metadata.failed_workers = COUNT(*) FROM partition_progress WHERE failed=TRUE
run_metadata.failed_workers = COUNT(*) FROM worker_runs WHERE status='failed'
```

### Critical Race Condition

**The race condition occurs during retry operations when a worker is still processing a redelivered message.**

#### Failure Flow (Normal Case)
```typescript
// apps/worker/src/index.ts:348-359
await updateWorkerRun(workerRun.id, "failed", errorMessage);
const isFirstFailure = await markPartitionFailed(workItem.runId, workItem.partitionId);
if (isFirstFailure) {
  await incrementFailedWorkers(workItem.runId);
}
```

#### Retry Flow
```typescript
// packages/database/src/queries/runs.ts:172-193
export async function resetFailedWorker(runId: string, partitionId: string): Promise<void> {
  // 1. Delete worker_run record
  await query(
    `DELETE FROM worker_runs WHERE run_id = $1 AND partition_id = $2 AND status = 'failed'`,
    [runId, partitionId]
  );

  // 2. Reset partition_progress.failed flag
  await resetPartitionForRetry(runId, partitionId);

  // 3. Decrement counter
  await query(
    `UPDATE run_metadata SET failed_workers = GREATEST(0, failed_workers - 1) WHERE run_id = $1`,
    [runId]
  );
}
```

#### The Race Condition Timeline

```
Time  | Worker Thread              | User/API Thread               | State
------|----------------------------|-------------------------------|---------------------------
T0    | Worker A starts partition 1| -                             | worker_run created (running)
T1    | Worker A fails             | -                             | worker_run status=failed
      | markPartitionFailed=TRUE   |                               | partition.failed=TRUE
      | incrementFailedWorkers     |                               | failed_workers=1
      | abandon message            |                               |
T2    | Service Bus redelivers     | -                             | Message back in queue
T3    | Worker B picks up message  | -                             | -
T4    | Worker B fetches           | -                             | Finds worker_run A (failed)
      | existing worker_run        |                               |
T5    | -                          | User clicks retry             | resetFailedWorker called
      | -                          | DELETE worker_run A           | worker_run A DELETED
      | -                          | partition.failed=FALSE        | partition.failed=FALSE
      | -                          | failed_workers=0              | failed_workers decremented
      | -                          | Send new work item            |
T6    | Worker B continues         | -                             | Still has workerRun.id in memory
      | Worker B fails again       |                               |
      | updateWorkerRun(A.id, ...) |                               | UPDATE fails (row deleted!)
      | markPartitionFailed        |                               | Returns TRUE (was reset)
      | incrementFailedWorkers     |                               | failed_workers=1
T7    | -                          | -                             | DESYNC STATE:
      |                            |                               | failed_workers=1
      |                            |                               | partition.failed=TRUE
      |                            |                               | worker_runs: 0 records!
```

**Result**: The counter is incremented, but no `worker_runs` record exists because it was deleted between fetch and update.

### Additional Race Condition: Double Retry

If a user retries the same partition multiple times quickly:

```typescript
// First retry
await resetFailedWorker(runId, partitionId);  // DELETE worker_run, decrement counter

// Second retry (before worker starts)
await resetFailedWorker(runId, partitionId);  // DELETE finds nothing, BUT still decrements!
```

The `failed_workers` decrement is **unconditional**, even when no `worker_run` was deleted:

```sql
UPDATE run_metadata
SET failed_workers = GREATEST(0, failed_workers - 1)
WHERE run_id = $1
```

This can cause `failed_workers` to go negative (protected by GREATEST) or become out of sync.

## Dashboard Query Analysis

### Analytics Query (shows 3 failures)
```typescript
// packages/database/src/queries/analytics.ts:281-292
function getRunStatus(row: {
  completed_at: Date | null;
  failed_workers: number;  // <-- Uses this field
  completed_workers: number;
  expected_workers: number;
}): 'running' | 'completed' | 'failed' | 'partial'
```

**Source**: `run_metadata.failed_workers` (aggregate counter)

### Workers Table Query (shows 2 failures)
```typescript
// packages/database/src/queries/analytics.ts:320-321
SELECT * FROM worker_runs WHERE run_id = $1 ORDER BY partition_id
```

**Source**: `worker_runs` table current state

### Why They Differ

- `run_metadata.failed_workers`: Can be incremented when `worker_runs` record doesn't exist (race condition)
- `worker_runs` table: Only shows records that currently exist and have status='failed'

## Recommendations

### Option 1: Use Single Source of Truth (RECOMMENDED)

**Remove the redundant counter and compute it from partition_progress or worker_runs.**

#### Approach 1A: Compute from partition_progress
```typescript
// In getRunDetails and getRunsWithStats
SELECT
  rm.*,
  (SELECT COUNT(*) FROM partition_progress
   WHERE run_id = rm.run_id AND failed = TRUE) as failed_workers,
  (SELECT COUNT(*) FROM partition_progress
   WHERE run_id = rm.run_id AND completed = TRUE) as completed_workers
FROM run_metadata rm
```

**Pros:**
- Partition state is authoritative (has idempotency logic)
- No race conditions possible
- Always consistent

**Cons:**
- Requires JOIN or subquery
- Need to add `partition_progress` to all relevant queries

#### Approach 1B: Compute from worker_runs
```typescript
SELECT
  rm.*,
  COUNT(*) FILTER (WHERE wr.status = 'failed') as failed_workers,
  COUNT(*) FILTER (WHERE wr.status = 'completed') as completed_workers
FROM run_metadata rm
LEFT JOIN worker_runs wr ON rm.run_id = wr.run_id
GROUP BY rm.run_id
```

**Pros:**
- Worker runs already used in analytics queries
- Natural for dashboard display

**Cons:**
- Worker runs can be deleted during retry
- Need to track failed partitions differently

### Option 2: Fix Race Condition with Atomic Updates

**Make the retry operation atomic and prevent concurrent updates.**

```typescript
export async function resetFailedWorker(
  runId: string,
  partitionId: string
): Promise<void> {
  // Use a transaction to make all updates atomic
  await withTransaction(async (client) => {
    // 1. Get the current state first
    const result = await client.query(
      `SELECT * FROM worker_runs
       WHERE run_id = $1 AND partition_id = $2 AND status = 'failed'
       FOR UPDATE`,  // Lock the row
      [runId, partitionId]
    );

    if (result.rows.length === 0) {
      // No failed worker found, nothing to reset
      return;
    }

    // 2. Delete worker_run
    await client.query(
      `DELETE FROM worker_runs
       WHERE run_id = $1 AND partition_id = $2 AND status = 'failed'`,
      [runId, partitionId]
    );

    // 3. Reset partition progress
    await client.query(
      `UPDATE partition_progress
       SET failed = FALSE, updated_at = NOW()
       WHERE run_id = $1 AND partition_id = $2 AND failed = TRUE`,
      [runId, partitionId]
    );

    // 4. Decrement counter ONLY if we actually deleted something
    await client.query(
      `UPDATE run_metadata
       SET failed_workers = GREATEST(0, failed_workers - 1)
       WHERE run_id = $1`,
      [runId]
    );
  });
}
```

**Additional Protection**: Check worker_run existence before updating

```typescript
// In apps/worker/src/index.ts
try {
  await updateWorkerRun(workerRun.id, "failed", errorMessage);
} catch (error) {
  // Worker run was deleted (likely due to retry), skip failure tracking
  log.warn("Worker run no longer exists, skipping failure tracking", {
    workerRunId: workerRun.id,
  });
  throw error;  // Still fail the message
}

const isFirstFailure = await markPartitionFailed(workItem.runId, workItem.partitionId);
if (isFirstFailure) {
  await incrementFailedWorkers(workItem.runId);
}
```

### Option 3: Use Advisory Locks

**Prevent concurrent retry and worker failure updates with PostgreSQL advisory locks.**

```typescript
export async function markPartitionFailed(
  runId: string,
  partitionId: string
): Promise<boolean> {
  // Get advisory lock for this partition
  const lockKey = hashToInt64(runId + partitionId);
  await query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

  const result = await query<{ marked: boolean }>(
    `UPDATE partition_progress
     SET failed = TRUE, updated_at = NOW()
     WHERE run_id = $1 AND partition_id = $2
       AND failed = FALSE AND completed = FALSE
     RETURNING TRUE as marked`,
    [runId, partitionId]
  );

  return result.rows.length > 0;
}

export async function resetFailedWorker(
  runId: string,
  partitionId: string
): Promise<void> {
  // Get same advisory lock
  const lockKey = hashToInt64(runId + partitionId);
  await query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

  // ... rest of reset logic
}
```

## Recommended Solution

**Use Option 1A (Single Source of Truth from partition_progress)**

### Why This is Best:

1. **Eliminates race conditions entirely** - no counter to get out of sync
2. **Leverages existing idempotency logic** - `partition_progress.failed` already has atomic update semantics
3. **Minimal code changes** - just update analytics queries
4. **Backward compatible** - can keep `failed_workers` column for reference during migration

### Implementation Plan:

#### Phase 1: Add Computed Fields (packages/database/src/queries/analytics.ts)

```typescript
export async function getRunsWithStats(filters: RunsFilter = {}): Promise<{
  runs: RunWithStats[];
  total: number;
}> {
  // ... existing WHERE clause logic ...

  const [countResult, dataResult] = await Promise.all([
    // ... existing count query ...
    query<{
      run_id: string;
      run_type: string;
      expected_workers: number;
      completed_workers_actual: number;  // From partition_progress
      failed_workers_actual: number;     // From partition_progress
      watermark_before: Date | null;
      watermark_after: Date | null;
      started_at: Date;
      completed_at: Date | null;
      total_records: string;
    }>(
      `SELECT
        rm.*,
        (SELECT COUNT(*) FROM partition_progress pp
         WHERE pp.run_id = rm.run_id AND pp.completed = TRUE) as completed_workers_actual,
        (SELECT COUNT(*) FROM partition_progress pp
         WHERE pp.run_id = rm.run_id AND pp.failed = TRUE) as failed_workers_actual,
        COALESCE(SUM(wr.records_processed), 0) as total_records
       FROM run_metadata rm
       LEFT JOIN worker_runs wr ON rm.run_id = wr.run_id
       WHERE ${whereClause}
       GROUP BY rm.run_id
       ORDER BY rm.started_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    ),
  ]);

  const runs = dataResult.rows.map((row) => ({
    runId: row.run_id,
    runType: row.run_type as RunType,
    expectedWorkers: row.expected_workers,
    completedWorkers: row.completed_workers_actual,  // Use computed value
    failedWorkers: row.failed_workers_actual,        // Use computed value
    // ... rest of mapping
  }));

  return { runs, total };
}
```

#### Phase 2: Update getRunDetails Similarly

```typescript
export async function getRunDetails(runId: string): Promise<{
  run: RunWithStats | null;
  workers: WorkerRun[];
}> {
  const [runResult, workersResult, statsResult] = await Promise.all([
    query<{...}>(`SELECT * FROM run_metadata WHERE run_id = $1`, [runId]),
    query<{...}>(`SELECT * FROM worker_runs WHERE run_id = $1 ORDER BY partition_id`, [runId]),
    query<{
      completed_count: string;
      failed_count: string;
      total_records: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE pp.completed = TRUE) as completed_count,
        COUNT(*) FILTER (WHERE pp.failed = TRUE) as failed_count,
        COALESCE(SUM(wr.records_processed), 0) as total_records
       FROM partition_progress pp
       LEFT JOIN worker_runs wr ON pp.run_id = wr.run_id AND pp.partition_id = wr.partition_id
       WHERE pp.run_id = $1`,
      [runId]
    ),
  ]);

  const runRow = runResult.rows[0];
  if (!runRow) {
    return { run: null, workers: [] };
  }

  const stats = statsResult.rows[0]!;
  const run: RunWithStats = {
    runId: runRow.run_id,
    runType: runRow.run_type as RunType,
    expectedWorkers: runRow.expected_workers,
    completedWorkers: parseInt(stats.completed_count, 10),  // From partition_progress
    failedWorkers: parseInt(stats.failed_count, 10),        // From partition_progress
    // ... rest
  };

  return { run, workers };
}
```

#### Phase 3: Migration Path

1. Deploy code with computed queries (reads both old counter and new computed value)
2. Add logging to compare values and detect discrepancies
3. Run data reconciliation script to verify partition_progress is accurate
4. After validation period, remove `run_metadata.failed_workers` and `completed_workers` columns
5. Update worker code to stop calling `incrementFailedWorkers()`

## Testing Scenarios

To verify the fix, test these scenarios:

1. **Normal failure and retry**
   - Worker fails → retry → succeeds
   - Verify counts stay consistent

2. **Double retry**
   - Worker fails → retry twice quickly
   - Verify counter doesn't go negative

3. **Concurrent retry and failure**
   - Worker fails → abandon message
   - While redelivered message is processing, user retries
   - Verify counts stay consistent

4. **Multiple failures on same partition**
   - Worker fails multiple times before retry
   - Verify counter only increments once per partition

## Conclusion

The root cause is a race condition between worker failure handling and retry operations, caused by:
1. Redundant state tracking (counter vs. table records)
2. Non-atomic updates across multiple tables
3. Missing validation that worker_run still exists before updating

The recommended fix is to use `partition_progress.failed` as the single source of truth for failure counts, eliminating the race condition entirely.
