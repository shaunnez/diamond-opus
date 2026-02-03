# Sequence Diagram (Pipeline Execution)

This diagram shows the timeline of interactions between components during a full pipeline run.

```mermaid
sequenceDiagram
    actor Cron as Cron Trigger
    participant Scheduler
    participant WatermarkBlob as Azure Blob<br/>(watermark)
    participant Nivoda as Nivoda API
    participant WorkQueue as Service Bus<br/>(work-items)
    participant Worker1 as Worker 1
    participant Worker2 as Worker 2
    participant WorkerN as Worker N
    participant DB as Database
    participant DoneQueue as Service Bus<br/>(work-done)
    participant ConsolidateQueue as Service Bus<br/>(consolidate)
    participant Consolidator

    Note over Cron,Consolidator: STAGE 1: RAW INGESTION

    Cron->>Scheduler: Trigger (cron: 0 2 * * *)
    activate Scheduler

    Scheduler->>WatermarkBlob: Read watermark.json
    WatermarkBlob-->>Scheduler: lastUpdatedAt: 2024-01-15T02:00:00Z

    Note over Scheduler: Determine run type:<br/>incremental (has watermark)

    Scheduler->>DB: Create run_metadata
    DB-->>Scheduler: runId: abc123, expectedWorkers: 30

    Note over Scheduler,Nivoda: HEATMAP SCAN

    loop Price ranges ($0-$500K)
        Scheduler->>Nivoda: getDiamondsCount(priceRange)
        Nivoda-->>Scheduler: count: 25000
    end

    Note over Scheduler: Partition into 30 workers<br/>Target: 5000 records/worker

    loop 30 work items
        Scheduler->>WorkQueue: Enqueue WorkItemMessage<br/>{partitionId, minPrice, maxPrice}
    end

    Scheduler-->>Cron: Exit (job complete)
    deactivate Scheduler

    Note over Worker1,WorkerN: AUTO-SCALE: Workers spin up based on queue depth

    WorkQueue->>Worker1: Receive WorkItemMessage (partition-0)
    activate Worker1
    WorkQueue->>Worker2: Receive WorkItemMessage (partition-1)
    activate Worker2
    WorkQueue->>WorkerN: Receive WorkItemMessage (partition-29)
    activate WorkerN

    Worker1->>DB: Create worker_run (partition-0)
    Worker1->>DB: Initialize partition_progress
    Worker2->>DB: Create worker_run (partition-1)
    Worker2->>DB: Initialize partition_progress
    WorkerN->>DB: Create worker_run (partition-29)
    WorkerN->>DB: Initialize partition_progress

    Note over Worker1,Nivoda: CONTINUATION PATTERN: Page-by-page processing

    loop While hasMore (partition-0)
        Worker1->>Nivoda: searchDiamonds(offset, limit: 30)
        Nivoda-->>Worker1: items[30], hasMore: true
        Worker1->>DB: Bulk upsert raw_diamonds_nivoda
        Worker1->>DB: Update partition_progress.nextOffset
        Worker1->>WorkQueue: Enqueue next page WorkItemMessage
    end

    Worker1->>DB: Complete partition (partition-0)
    Worker1->>DB: Update worker_run status: completed
    Worker1->>DB: Increment completed_workers (1/30)
    Worker1->>DoneQueue: Send WORK_DONE (partition-0)
    deactivate Worker1

    loop Similar for Worker 2...N
        Worker2->>Nivoda: Fetch pages
        Worker2->>DB: Write & track progress
    end

    Worker2->>DB: Increment completed_workers (2/30)
    Worker2->>DoneQueue: Send WORK_DONE (partition-1)
    deactivate Worker2

    Note over WorkerN: LAST WORKER

    WorkerN->>Nivoda: Fetch pages
    WorkerN->>DB: Write & track progress
    WorkerN->>DB: Increment completed_workers (30/30)
    WorkerN->>DB: Check: completedWorkers == expectedWorkers?

    alt All workers succeeded (failedWorkers == 0)
        WorkerN->>ConsolidateQueue: Send CONSOLIDATE message
        WorkerN->>DoneQueue: Send WORK_DONE (partition-29)
    else Any worker failed (failedWorkers > 0)
        WorkerN->>DoneQueue: Send WORK_DONE (partition-29)
        Note over WorkerN,ConsolidateQueue: Skip consolidation<br/>Watermark NOT advanced
    end
    deactivate WorkerN

    Note over Consolidator,DB: STAGE 2: CONSOLIDATION

    ConsolidateQueue->>Consolidator: Receive CONSOLIDATE message
    activate Consolidator

    Consolidator->>DB: Get run_metadata (validate no failures)

    alt Workers failed
        Consolidator->>Consolidator: Send alert email
        Consolidator-->>ConsolidateQueue: Complete (skip processing)
        deactivate Consolidator
    else All workers succeeded
        Consolidator->>DB: Load pricing_rules

        loop Until no more unconsolidated records
            Consolidator->>DB: Fetch 2000 raw diamonds<br/>(FOR UPDATE SKIP LOCKED)

            Note over Consolidator: Process 2000 in chunks of 100<br/>Concurrency: 5

            par Batch 1-5 (parallel)
                Consolidator->>Consolidator: Map raw → canonical (100)
                Consolidator->>Consolidator: Apply pricing rules (100)
                Consolidator->>DB: Batch upsert diamonds (UNNEST)
            and Batch 6-10 (parallel)
                Consolidator->>Consolidator: Map, price, upsert
            and Batch 11-15 (parallel)
                Consolidator->>Consolidator: Map, price, upsert
            and Batch 16-20 (parallel)
                Consolidator->>Consolidator: Map, price, upsert
            end

            Consolidator->>DB: Mark 2000 as consolidated
        end

        Consolidator->>DB: Update run_metadata<br/>(watermarkAfter, completedAt)
        Consolidator->>WatermarkBlob: Save watermark<br/>(lastUpdatedAt: NOW())

        Consolidator-->>ConsolidateQueue: Complete (success)
        deactivate Consolidator
    end

    Note over Cron,Consolidator: Pipeline complete. Next run will be incremental.
```

## Timing Breakdown (500K records)

| Phase | Duration | Notes |
|-------|----------|-------|
| Scheduler | 1-2 min | Heatmap scan (~30-60 API calls) |
| Workers (30 replicas) | 5-10 min | Parallel ingestion, continuation pattern |
| Consolidation (1 replica) | 4-6 min | Sequential batches |
| Consolidation (3 replicas) | 1-2 min | Parallel batches with SKIP LOCKED |
| **Total (1 replica)** | **10-18 min** | |
| **Total (3 replicas)** | **7-13 min** | |

## Key Message Types

### WorkItemMessage
```typescript
{
  type: "WORK_ITEM",
  runId: "abc123",
  traceId: "xyz789",
  partitionId: "partition-0",
  minPrice: 0,
  maxPrice: 1000,
  totalRecords: 5000,
  offset: 0,        // Current offset (continuation)
  limit: 30,        // Page size
  updatedFrom: "2024-01-15T02:00:00Z",
  updatedTo: "2024-01-16T02:00:00Z"
}
```

### WorkDoneMessage
```typescript
{
  type: "WORK_DONE",
  runId: "abc123",
  traceId: "xyz789",
  workerId: "worker-uuid",
  partitionId: "partition-0",
  recordsProcessed: 5000,
  status: "success" | "failed",
  error?: "Error message"
}
```

### ConsolidateMessage
```typescript
{
  type: "CONSOLIDATE",
  runId: "abc123",
  traceId: "xyz789",
  force?: true  // Skip worker failure validation
}
```

## Idempotency Guarantees

1. **Worker Runs**: Unique constraint on `(run_id, partition_id)` → only one worker_run per partition
2. **Partition Progress**: CAS updates on `nextOffset` → skip duplicate/out-of-order messages
3. **Service Bus**: Duplicate detection window (10 min) → dedup continuation messages
4. **Database Upserts**: `ON CONFLICT (supplier_stone_id) DO UPDATE` → safe retries
5. **Watermark**: Only advanced on successful consolidation → no partial updates
