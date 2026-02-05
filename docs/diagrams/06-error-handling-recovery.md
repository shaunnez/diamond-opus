# Error Handling & Recovery

This diagram shows failure scenarios and recovery mechanisms throughout the pipeline.

```mermaid
flowchart TB
    subgraph SchedulerErrors["Scheduler Failures"]
        S1["Scheduler Job Triggered"]
        S2{Watermark<br/>Read Error?}
        S3{Nivoda API<br/>Unavailable?}
        S4{Heatmap Scan<br/>Failed?}
        S5{Queue<br/>Send Failed?}

        S1 --> S2
        S2 -->|Error| SE1["Log Error + Exit<br/>exitCode = 1"]
        S2 -->|Success| S3

        S3 -->|Error| SE2["Retry with<br/>exponential backoff<br/>(3 attempts)"]
        SE2 -->|Still fails| SE3["Log Error + Exit<br/>Next cron will retry"]
        S3 -->|Success| S4

        S4 -->|Error| SE4["Partial heatmap?<br/>Log + Exit"]
        S4 -->|Success| S5

        S5 -->|Error| SE5["Critical: Messages lost<br/>Log + Exit<br/>Manual intervention"]
        S5 -->|Success| SSuccess["Exit Successfully<br/>Workers will process"]

        style SE1 fill:#ffcccc
        style SE3 fill:#ffcccc
        style SE4 fill:#ffcccc
        style SE5 fill:#ff9999
        style SSuccess fill:#ccffcc
    end

    subgraph WorkerErrors["Worker Failures"]
        W1["Worker Receives<br/>WorkItemMessage"]
        W2{Database<br/>Connection Error?}
        W3{Nivoda API<br/>Timeout/Error?}
        W4{Partition Already<br/>Completed?}
        W5{Offset<br/>Mismatch?}

        W1 --> W2
        W2 -->|Error| WE1["Connection pool retry<br/>(3 attempts, 1s delay)"]
        WE1 -->|Still fails| WE2["Abandon message<br/>Service Bus will retry<br/>(max 5 attempts)"]
        W2 -->|Success| W4

        W4 -->|Yes| WE3["Idempotency: Skip<br/>Complete message"]
        W4 -->|No| W5

        W5 -->|Mismatch| WE4["Out-of-order/duplicate<br/>Skip + Complete"]
        W5 -->|Match| W3

        W3 -->|Error| WE5["withRetry wrapper<br/>(3 attempts, exp backoff)"]
        WE5 -->|Still fails| WE6["Mark worker_run as failed<br/>Increment failedWorkers<br/>Send WORK_DONE (failed)<br/>Abandon message"]
        W3 -->|Success| W6["Write to<br/>raw_diamonds_nivoda"]

        W6 --> W7{More pages?}
        W7 -->|Yes| W8["Enqueue next page<br/>Update partition_progress"]
        W7 -->|No| W9["Mark partition completed<br/>Increment completedWorkers"]

        W8 --> W10{Queue send<br/>succeeded?}
        W10 -->|No| WE7["Critical: Lost continuation<br/>Mark failed<br/>Alert + Manual retry"]
        W10 -->|Yes| WSuccess1["Complete message<br/>Exit (next page will process)"]

        W9 --> W11{Last worker<br/>completed?}
        W11 -->|Yes, all success| W12["Send CONSOLIDATE"]
        W11 -->|Yes, some failed| WE8["Skip consolidation<br/>Log warning<br/>Send alert email"]
        W11 -->|No| WSuccess2["Send WORK_DONE<br/>Complete message"]

        W12 --> WSuccess3["Complete message<br/>Trigger consolidation"]

        style WE2 fill:#ffcccc
        style WE6 fill:#ffcccc
        style WE7 fill:#ff9999
        style WE8 fill:#ffcc99
        style WSuccess1 fill:#ccffcc
        style WSuccess2 fill:#ccffcc
        style WSuccess3 fill:#ccffcc
    end

    subgraph ConsolidatorErrors["Consolidator Failures"]
        C1["Consolidator Receives<br/>CONSOLIDATE message"]
        C2{Validate<br/>run_metadata}
        C3{Workers<br/>failed?}
        C4{Database<br/>connection error?}
        C5{Pricing rules<br/>load error?}
        C6{Mapping<br/>error?}
        C7{Batch upsert<br/>error?}

        C1 --> C2
        C2 -->|Run not found| CE1["Log error<br/>Complete message<br/>(invalid message)"]
        C2 -->|Valid| C3

        C3 -->|Yes, force=false| CE2["Skip consolidation<br/>Send alert email<br/>Complete message<br/>Watermark NOT advanced"]
        C3 -->|Yes, force=true| CE3["Log warning<br/>Proceed anyway"]
        C3 -->|No| C5

        CE3 --> C5

        C5 -->|Error| CE4["Critical: No pricing rules<br/>Log + Abandon<br/>Service Bus will retry"]
        C5 -->|Success| C4

        C4 -->|Error| CE5["Connection retry<br/>(3 attempts)"]
        CE5 -->|Still fails| CE6["Abandon message<br/>Service Bus retry<br/>Send alert"]
        C4 -->|Success| C6

        C6 -->|Error (single diamond)| CE7["Log error<br/>Skip diamond<br/>Continue batch"]
        C6 -->|Success| C7

        C7 -->|Error (batch)| CE8["Entire batch fails<br/>Return empty processedIds<br/>Continue to next batch"]
        C7 -->|Success| C8["Mark as consolidated<br/>Continue"]

        C8 --> C9{More batches?}
        C9 -->|Yes| C4
        C9 -->|No| C10["Update run_metadata<br/>Advance watermark"]

        C10 --> C11{Watermark<br/>save error?}
        C11 -->|Error| CE9["CRITICAL: Data consolidated<br/>but watermark not advanced<br/>Send alert<br/>Abandon message<br/>Manual fix needed"]
        C11 -->|Success| CSuccess["Complete message<br/>Pipeline complete"]

        style CE1 fill:#ffcc99
        style CE2 fill:#ffcc99
        style CE4 fill:#ff9999
        style CE6 fill:#ffcccc
        style CE7 fill:#ffffcc
        style CE8 fill:#ffcc99
        style CE9 fill:#ff0000,color:#fff
        style CSuccess fill:#ccffcc
    end

    subgraph ServiceBusErrors["Service Bus Failures"]
        SB1["Message Processing"]
        SB2{Max delivery<br/>count exceeded?}
        SB3{Lock<br/>expired?}

        SB1 --> SB2
        SB2 -->|Yes (5 attempts)| SBE1["Move to Dead Letter Queue<br/>Alert + Manual review"]
        SB2 -->|No| SB3

        SB3 -->|Yes| SBE2["Message visible again<br/>Another worker will retry"]
        SB3 -->|No| SBSuccess["Message completed"]

        style SBE1 fill:#ff9999
        style SBE2 fill:#ffcc99
        style SBSuccess fill:#ccffcc
    end

    WSuccess3 -.->|Triggers| C1
    CE9 -.->|Requires| ManualFix["Manual Intervention:<br/>1. Verify data in DB<br/>2. Manually update watermark<br/>3. Or force next run"]

    style ManualFix fill:#ff9999
```

## Failure Scenarios & Recovery

### 1. Scheduler Failures

| Scenario | Impact | Recovery | Severity |
|----------|--------|----------|----------|
| Watermark read error | Job fails, exits | Next cron retry | Low |
| Nivoda API down | Job fails, exits | Next cron retry | Low |
| Heatmap scan partial | Job fails, exits | Next cron retry | Medium |
| Queue send failure | **Messages lost** | Manual trigger | High |

**Recovery Strategy**: Cron will retry on next schedule. If persistent, check Azure connectivity.

### 2. Worker Failures

| Scenario | Impact | Recovery | Severity |
|----------|--------|----------|----------|
| Database connection lost | Worker fails | Service Bus retry (5x) | Low |
| Nivoda API timeout | Worker retries (3x) | Then fails partition | Medium |
| Offset mismatch (idempotency) | Skip processing | Complete message | Low |
| Partition already completed | Skip processing | Complete message | Low |
| Dead letter queue reached | **Partition lost** | Manual retry | High |
| Last worker sees failures | Skip consolidation | Manual force-consolidate | High |

**Recovery Strategy**:
- Service Bus automatic retry (max 5 attempts)
- Check dead letter queue for stuck messages
- Force consolidation: Send `ConsolidateMessage` with `force: true`

### 3. Consolidator Failures

| Scenario | Impact | Recovery | Severity |
|----------|--------|----------|----------|
| Workers failed (force=false) | Skip consolidation | Fix workers, retry | Medium |
| Pricing rules missing | **Critical failure** | Check DB, Service Bus retry | High |
| Database connection lost | Consolidator retries | Service Bus retry | Medium |
| Mapping error (single diamond) | Skip diamond, log error | Continue batch | Low |
| Batch upsert error | Skip batch, continue | Log for review | Medium |
| Watermark save error | **CRITICAL** | Manual watermark fix | Critical |

**Recovery Strategy**:
- Mapping errors: Review logs, fix data issues
- Watermark save failure: **MANUAL INTERVENTION REQUIRED**
  1. Verify `diamonds` table has consolidated data
  2. Check `run_metadata.completedAt`
  3. Manually upload watermark to Azure Blob
  4. Or: Delete current run, force re-run

### 4. Service Bus Failures

| Scenario | Impact | Recovery | Severity |
|----------|--------|----------|----------|
| Message lock expired (PT2M) | Re-queued automatically | Another worker processes | Low |
| Max delivery count (5) | Dead letter queue | Manual review + retry | High |
| Duplicate message | Idempotency skips | No impact | Low |
| Queue full | Throttling | Back-pressure, retry | Medium |

**Recovery Strategy**:
- Monitor dead letter queues daily
- Use `retry-partition` script to re-process failed partitions

## Error Monitoring & Alerts

### Email Alerts (via Resend)

Sent by consolidator when:

1. **Workers failed** (failedWorkers > 0):
   ```
   Subject: Consolidation Skipped
   Body:
   - Run ID
   - Expected vs completed vs failed workers
   - Action: Review worker logs, retry failed partitions
   ```

2. **Consolidation failed** (exception thrown):
   ```
   Subject: Consolidation Failed
   Body:
   - Run ID
   - Error message
   - Watermark NOT advanced
   - Action: Review logs, manual intervention
   ```

### Logging Strategy

```typescript
// All services use structured logging
logger.error("Error message", {
  errorType: error.name,
  errorMessage: error.message,
  // Context: runId, traceId, workerId, partitionId
});
```

**Key fields**:
- `runId`: Links all logs for a pipeline run
- `traceId`: End-to-end correlation ID
- `partitionId`: Identifies which price range failed
- `workerId`: Identifies which worker instance

### Azure Monitoring

- **Log Analytics**: All container logs centralized
- **Service Bus Metrics**: Queue depth, dead letter count
- **Container Apps Metrics**: Replica count, CPU, memory

## Manual Recovery Procedures

### Retry Failed Partition

```bash
# List failed workers for a run
npm run worker:retry -- --run-id abc123

# Re-enqueue specific partition
npm run worker:retry -- --run-id abc123 --partition-id partition-5
```

### Force Consolidation

```bash
# Consolidate despite worker failures
npm run consolidator:trigger -- --run-id abc123 --force
```

### Fix Watermark Desync

```bash
# 1. Verify last successful run in database
psql $DATABASE_URL -c "SELECT * FROM run_metadata WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1;"

# 2. Manually update watermark blob
echo '{"lastUpdatedAt":"2024-01-16T02:00:00Z","lastRunId":"abc123","lastRunCompletedAt":"2024-01-16T02:15:00Z"}' > /tmp/watermark.json
az storage blob upload --account-name diamondprodstore --container-name watermarks --name watermark.json --file /tmp/watermark.json
```

### Dead Letter Queue Review

```bash
# View dead letter messages (Azure Portal or CLI)
az servicebus queue show --resource-group diamond-prod-rg --namespace-name diamond-prod-servicebus --name work-items --query "countDetails.deadLetterMessageCount"

# Peek messages
az servicebus queue message peek --resource-group diamond-prod-rg --namespace-name diamond-prod-servicebus --queue-name work-items --dead-letter
```

## Idempotency Safeguards

All critical operations are idempotent to support safe retries:

| Operation | Idempotency Mechanism |
|-----------|----------------------|
| Create worker_run | `UNIQUE(run_id, partition_id)` constraint |
| Update partition_progress | CAS on `nextOffset` |
| Mark partition complete | `WHERE nextOffset = $expected AND NOT completed` |
| Increment counters | Atomic `UPDATE ... SET count = count + 1` |
| Upsert diamonds | `ON CONFLICT (supplier_stone_id) DO UPDATE` |
| Service Bus messages | Duplicate detection (10 min window) |
| Advance watermark | Only on successful consolidation |

## Retry Configuration

```typescript
// packages/shared/src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
    onRetry?: (error: Error, attempt: number) => void
  }
): Promise<T>
```

**Applied to**:
- Nivoda API calls (heatmap, search, count)
- Database connection failures
- Azure Blob Storage operations
