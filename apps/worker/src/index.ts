import { randomUUID } from "node:crypto";

// Only load dotenv in development - production uses container env vars
if (process.env.NODE_ENV !== 'production') {
  const { config } = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rootDir = resolve(__dirname, '../../..');

  config({ path: resolve(rootDir, '.env.local') });
  config({ path: resolve(rootDir, '.env') });
}
import {
  DIAMOND_SHAPES,
  withRetry,
  createLogger,
  RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_WAIT_MS,
  RATE_LIMIT_BASE_DELAY_MS,
  type WorkItemMessage,
  type WorkDoneMessage,
  type Logger,
} from "@diamond/shared";
import {
  createWorkerRun,
  updateWorkerRun,
  updateWorkerProgress,
  incrementCompletedWorkers,
  incrementFailedWorkers,
  bulkUpsertRawDiamonds,
  type BulkRawDiamond,
  initializePartitionProgress,
  getPartitionProgress,
  updatePartitionOffset,
  completePartition,
  markPartitionFailed,
  closePool,
  acquireRateLimitToken,
} from "@diamond/database";
import {
  NivodaAdapter,
  type NivodaQuery,
  type NivodaOrder,
} from "@diamond/nivoda";
import {
  receiveWorkItem,
  sendWorkDone,
  sendConsolidate,
  sendWorkItem,
  closeConnections,
} from "./service-bus.js";

const baseLogger = createLogger({ service: "worker" });
const workerId = randomUUID();

// Rate limiter configuration for Nivoda API
const rateLimitConfig = {
  maxRequestsPerWindow: RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  windowDurationMs: RATE_LIMIT_WINDOW_MS,
  maxWaitMs: RATE_LIMIT_MAX_WAIT_MS,
  baseDelayMs: RATE_LIMIT_BASE_DELAY_MS,
};

// Rate limiter function to pass to adapter and retries
const acquireRateLimit = () => acquireRateLimitToken("nivoda_global", rateLimitConfig);

// Singleton NivodaAdapter - reused across all work items to preserve token cache
// This dramatically reduces authentication calls and prevents auth storms
// Configured with:
// - enableDesyncDelay: adds random delay before API calls to desynchronize workers
// - rateLimiter: integrates with global rate limiter to smooth request bursts
const nivodaAdapter = new NivodaAdapter(undefined, undefined, undefined, {
  enableDesyncDelay: true,
  rateLimiter: acquireRateLimit,
});

/**
 * Process exactly one page for continuation pattern.
 * Returns the number of records processed in this page.
 *
 * The `skipped` flag indicates if the message was skipped due to idempotency guards.
 * When skipped=true, the caller should NOT trigger completion logic - just ack the message.
 */
async function processWorkItemPage(
  workItem: WorkItemMessage,
  workerRunId: string,
  log: Logger
): Promise<{ recordsProcessed: number; hasMore: boolean; skipped: boolean }> {
  log.info("Processing page", {
    partitionId: workItem.partitionId,
    offset: workItem.offset,
    limit: workItem.limit,
    priceRange: { min: workItem.minPrice, max: workItem.maxPrice },
  });

  // Initialize or get partition progress for idempotency guard
  await initializePartitionProgress(workItem.runId, workItem.partitionId);
  const progress = await getPartitionProgress(workItem.runId, workItem.partitionId);

  // Idempotency guard: skip if already completed
  // IMPORTANT: Return skipped=true so caller doesn't trigger false completion
  if (progress.completed) {
    log.info("Partition already completed, skipping", {
      partitionId: workItem.partitionId,
    });
    return { recordsProcessed: 0, hasMore: false, skipped: true };
  }

  // Idempotency guard: skip if offset doesn't match expected nextOffset
  // This handles duplicate/redelivered messages from Service Bus
  // IMPORTANT: Return skipped=true so caller doesn't trigger false completion
  if (workItem.offset !== progress.nextOffset) {
    log.warn("Offset mismatch, skipping duplicate or out-of-order message", {
      messageOffset: workItem.offset,
      expectedOffset: progress.nextOffset,
      partitionId: workItem.partitionId,
    });
    return { recordsProcessed: 0, hasMore: false, skipped: true };
  }

  // Use singleton adapter (created at module scope) to preserve token cache
  // This prevents authentication storms when processing many pages

  // Build query with all filters from the work item
  // - Price range from heatmap partition
  // - Date range (updatedAt) for consistent filtering with heatmap counts
  const query: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
    dollar_value: { from: workItem.minPrice, to: workItem.maxPrice },
    // Use the same date range filter as the heatmap for consistency
    updatedAt: workItem.updatedFrom && workItem.updatedTo
      ? { from: workItem.updatedFrom, to: workItem.updatedTo }
      : undefined,
  };

  // Order by createdAt ASC for deterministic pagination
  // This ensures diamonds don't shift between pages during the run
  const order: NivodaOrder = { type: 'createdAt', direction: 'ASC' };

  log.debug("Fetching page from Nivoda", {
    offset: workItem.offset,
    limit: workItem.limit,
    updatedAt: query.updatedAt,
  });

  const response = await withRetry(
    () => nivodaAdapter.searchDiamonds(query, { offset: workItem.offset, limit: workItem.limit, order }),
    {
      onRetry: (error, attempt, delayMs) => {
        log.warn("Retrying search diamonds", {
          attempt,
          offset: workItem.offset,
          delayMs: Math.round(delayMs),
          error: error.message,
        });
      },
    },
  );

  if (response.items.length === 0) {
    log.info("No items returned, marking partition as completed");

    // Mark partition as completed
    const marked = await completePartition(
      workItem.runId,
      workItem.partitionId,
      workItem.offset
    );

    if (!marked) {
      log.warn("Failed to mark partition as completed (already completed or offset mismatch)");
    }

    return { recordsProcessed: 0, hasMore: false, skipped: false };
  }

  // Bulk upsert all items from this page
  const bulkDiamonds: BulkRawDiamond[] = response.items.map((item) => ({
    supplierStoneId: item.diamond.id,
    offerId: item.id,
    payload: item as unknown as Record<string, unknown>,
    sourceUpdatedAt: undefined,
  }));

  await bulkUpsertRawDiamonds(workItem.runId, bulkDiamonds);

  log.debug("Page upserted", {
    recordsProcessed: response.items.length,
  });

  // Update worker progress (cumulative for this partition)
  await updateWorkerProgress(workerRunId, response.items.length);

  // Compute new offset
  const newOffset = workItem.offset + response.items.length;

  // Check if we have more pages
  const hasMore = response.items.length === workItem.limit;

  if (hasMore) {
    // Update partition progress to new offset
    const updated = await updatePartitionOffset(
      workItem.runId,
      workItem.partitionId,
      workItem.offset,
      newOffset
    );

    if (!updated) {
      log.warn("Failed to update partition offset (already updated or offset mismatch)");
    }
  } else {
    // Last page (partial page), mark partition as completed
    log.info("Last page processed, marking partition as completed");

    const marked = await completePartition(
      workItem.runId,
      workItem.partitionId,
      newOffset
    );

    if (!marked) {
      log.warn("Failed to mark partition as completed (already completed or offset mismatch)");
    }
  }

  return { recordsProcessed: response.items.length, hasMore, skipped: false };
}

async function handleWorkItem(workItem: WorkItemMessage): Promise<void> {
  const log = baseLogger.child({
    runId: workItem.runId,
    traceId: workItem.traceId,
    workerId,
    partitionId: workItem.partitionId,
  });

  log.info("Starting work item page processing");

  // Get or create worker run (idempotent due to unique constraint on run_id, partition_id)
  // This ensures we only create one worker run per partition
  let workerRun;
  try {
    workerRun = await createWorkerRun(
      workItem.runId,
      workItem.partitionId,
      workerId,
      workItem as unknown as Record<string, unknown>,
    );
  } catch (error) {
    // If worker run already exists, this is a continuation message
    // We still need the worker run ID for progress tracking
    log.info("Worker run already exists (continuation message)");
    // For now, we'll fetch it - in production you might cache this
    const existingRuns = await import("@diamond/database").then(m => m.getWorkerRunsByRunId(workItem.runId));
    workerRun = existingRuns.find(r => r.partitionId === workItem.partitionId);
    if (!workerRun) {
      throw new Error(`Worker run not found for partition ${workItem.partitionId}`);
    }
  }

  let recordsProcessed = 0;
  let hasMore = false;
  let errorOccurred = false;
  let errorMessage: string | undefined;

  try {
    const result = await processWorkItemPage(workItem, workerRun.id, log);
    recordsProcessed = result.recordsProcessed;
    hasMore = result.hasMore;

    // If message was skipped due to idempotency guards (duplicate/redelivered message),
    // just ack the message without any state changes - another worker is handling this partition
    if (result.skipped) {
      log.info("Message skipped due to idempotency guard, acknowledging without state changes");
      return;
    }

    log.info("Page processed successfully", {
      recordsProcessed,
      hasMore,
    });

    // Advance database progress first (already done in processWorkItemPage)
    // Now enqueue next message if there are more pages
    if (hasMore) {
      const nextWorkItem: WorkItemMessage = {
        ...workItem,
        offset: workItem.offset + recordsProcessed,
      };

      log.info("Enqueueing next page", {
        nextOffset: nextWorkItem.offset,
      });

      // Critical: This must succeed or throw
      await sendWorkItem(nextWorkItem);

      log.info("Next page enqueued successfully");
    } else {
      // This was the last page for this partition
      log.info("Partition completed, no more pages");

      // Update worker run status to completed
      await updateWorkerRun(workerRun.id, "completed");

      // Send WORK_DONE message only once per partition
      const workDoneMessage: WorkDoneMessage = {
        type: "WORK_DONE",
        runId: workItem.runId,
        traceId: workItem.traceId,
        workerId,
        partitionId: workItem.partitionId,
        recordsProcessed,
        status: "success",
      };

      await sendWorkDone(workDoneMessage);

      // Increment completed workers only once per partition
      const { completedWorkers, expectedWorkers, failedWorkers } =
        await incrementCompletedWorkers(workItem.runId);

      log.info("Worker completed", {
        completedWorkers,
        expectedWorkers,
        failedWorkers,
      });

      // Trigger consolidation if all workers completed successfully
      if (completedWorkers === expectedWorkers && failedWorkers === 0) {
        log.info("All workers completed successfully, triggering consolidation");
        await sendConsolidate({
          type: "CONSOLIDATE",
          runId: workItem.runId,
          traceId: workItem.traceId,
        });
      } else if (completedWorkers + failedWorkers === expectedWorkers) {
        log.warn("All workers finished but some failed, skipping consolidation", {
          failedWorkers,
        });
      }
    }
  } catch (error) {
    errorOccurred = true;
    errorMessage = error instanceof Error ? error.message : String(error);

    // Log error message and type to avoid large payloads
    log.error("Worker page processing failed", {
      errorType: error instanceof Error ? error.name : "unknown",
      errorMessage,
      offset: workItem.offset,
    });

    // Update worker run status to failed
    await updateWorkerRun(workerRun.id, "failed", errorMessage);

    // Atomically mark partition as failed and increment failed workers
    // markPartitionFailed returns true only on first failure (idempotent)
    // This replaces the fragile offset === 0 check with proper database-level idempotency
    const isFirstFailure = await markPartitionFailed(workItem.runId, workItem.partitionId);
    if (isFirstFailure) {
      await incrementFailedWorkers(workItem.runId);
      log.info("Partition marked as failed, incremented failed workers");
    } else {
      log.info("Partition already marked as failed, not double-counting");
    }

    // Send WORK_DONE failure message
    const workDoneMessage: WorkDoneMessage = {
      type: "WORK_DONE",
      runId: workItem.runId,
      traceId: workItem.traceId,
      workerId,
      partitionId: workItem.partitionId,
      recordsProcessed,
      status: "failed",
      error: errorMessage,
    };

    await sendWorkDone(workDoneMessage);

    // Re-throw so the message is retried by Service Bus
    throw error;
  }
}

async function run(): Promise<void> {
  const log = baseLogger.child({ workerId });
  log.info("Worker starting");

  while (true) {
    const received = await receiveWorkItem();

    if (!received) {
      log.debug("No work items available, waiting");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    try {
      await handleWorkItem(received.message);
      await received.complete();
    } catch (error) {
      // Log only error message to avoid large payloads
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error("Error processing work item", {
        errorMessage: errorMsg,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await received.abandon();
    }
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    // Log only error message to avoid large payloads
    const errorMsg = error instanceof Error ? error.message : String(error);
    baseLogger.error("Worker failed", {
      errorMessage: errorMsg,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

process.on("SIGTERM", async () => {
  baseLogger.info("Received SIGTERM, shutting down");
  await closeConnections();
  await closePool();
  process.exit(0);
});

process.on("SIGINT", async () => {
  baseLogger.info("Received SIGINT, shutting down");
  await closeConnections();
  await closePool();
  process.exit(0);
});

main();
