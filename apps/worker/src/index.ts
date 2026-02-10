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
  withRetry,
  createLogger,
  AUTO_CONSOLIDATION_SUCCESS_THRESHOLD,
  AUTO_CONSOLIDATION_DELAY_MINUTES,
  type WorkItemMessage,
  type WorkDoneMessage,
  type Logger,
} from "@diamond/shared";
import {
  createWorkerRun,
  updateWorkerRun,
  updateWorkerProgress,
  getRunWorkerCounts,
  bulkUpsertRawDiamonds,
  type BulkRawDiamond,
  initializePartitionProgress,
  getPartitionProgress,
  updatePartitionOffset,
  completePartition,
  markPartitionFailed,
  insertErrorLog,
  closePool,
} from "@diamond/database";
import type { FeedAdapter, FeedQuery } from "@diamond/feed-registry";
import {
  receiveWorkItem,
  sendWorkDone,
  sendConsolidate,
  sendWorkItem,
  closeConnections,
} from "./service-bus.js";
import { sendAlert } from "./alerts.js";
import { createFeedRegistry } from "./feeds.js";

const baseLogger = createLogger({ service: "worker" });
const workerId = randomUUID();

// Create the feed registry once at startup - adapters are reused across messages
const feedRegistry = createFeedRegistry();

// Cap error messages to prevent overly long stack traces in database
const MAX_ERROR_MESSAGE_LENGTH = 1000;
function capErrorMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }
  return message.substring(0, MAX_ERROR_MESSAGE_LENGTH) + '... (truncated)';
}

/**
 * Process exactly one page for continuation pattern.
 * Returns the number of records processed in this page.
 *
 * The `skipped` flag indicates if the message was skipped due to idempotency guards.
 * When skipped=true, the caller should NOT trigger completion logic - just ack the message.
 */
async function processWorkItemPage(
  workItem: WorkItemMessage,
  adapter: FeedAdapter,
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
  if (progress.completed) {
    log.info("Partition already completed, skipping", {
      partitionId: workItem.partitionId,
    });
    return { recordsProcessed: 0, hasMore: false, skipped: true };
  }

  // Idempotency guard: skip if offset doesn't match expected nextOffset
  if (workItem.offset !== progress.nextOffset) {
    log.warn("Offset mismatch, skipping duplicate or out-of-order message", {
      messageOffset: workItem.offset,
      expectedOffset: progress.nextOffset,
      partitionId: workItem.partitionId,
    });
    return { recordsProcessed: 0, hasMore: false, skipped: true };
  }

if (workItem.offset >= workItem.offsetEnd) {
  log.info("Offset reached offsetEnd, marking partition as completed", {
    offset: workItem.offset,
    offsetEnd: workItem.offsetEnd,
  });

  await completePartition(workItem.runId, workItem.partitionId, workItem.offset);
  return { recordsProcessed: 0, hasMore: false, skipped: false };
}

  // Build query using generic FeedQuery
  const query: FeedQuery = {
    priceRange: { from: workItem.minPrice, to: workItem.maxPrice },
    updatedRange: workItem.updatedFrom && workItem.updatedTo
      ? { from: workItem.updatedFrom, to: workItem.updatedTo }
      : undefined,
  };

  // Order by createdAt ASC for deterministic pagination
  const order = { type: 'createdAt', direction: 'ASC' as const };

  log.debug("Fetching page from feed", {
    feed: workItem.feed,
    offset: workItem.offset,
    limit: workItem.limit,
  });

  const response = await withRetry(
    () => adapter.search(query, { offset: workItem.offset, limit: workItem.limit, order }),
    {
      onRetry: (error, attempt, delayMs) => {
        log.warn("Retrying search", {
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

  // Extract identities and build bulk diamonds using feed-specific logic
  const bulkDiamonds: BulkRawDiamond[] = response.items.map((item) =>
    adapter.extractIdentity(item)
  );

  // Write to feed-specific raw table
  await bulkUpsertRawDiamonds(workItem.runId, bulkDiamonds, adapter.rawTableName);

  log.debug("Page upserted", {
    recordsProcessed: response.items.length,
  });

  // Update worker progress (cumulative for this partition)
  await updateWorkerProgress(workerRunId, response.items.length);

  // Compute new offset
  const newOffset = workItem.offset + response.items.length;

  // Check if we have more pages
  // const hasMore = response.items.length === workItem.limit;

const hasMore = response.items.length === workItem.limit && newOffset < workItem.offsetEnd;

  if (hasMore) {
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

    const updated = await updatePartitionOffset(
      workItem.runId,
      workItem.partitionId,
      workItem.offset,
      newOffset
    );

    if (!updated) {
      log.warn("Failed to update final partition offset (already updated or offset mismatch)");
    }

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
    feed: workItem.feed,
  });

  log.info("Starting work item page processing");

  // Resolve the feed adapter for this work item
  const adapter = feedRegistry.get(workItem.feed);

  // Get or create worker run (idempotent due to unique constraint on run_id, partition_id)
  let workerRun;
  try {
    workerRun = await createWorkerRun(
      workItem.runId,
      workItem.partitionId,
      workerId,
      workItem as unknown as Record<string, unknown>,
    );
  } catch (error) {
    log.info("Worker run already exists (continuation message)");
    const existingRuns = await import("@diamond/database").then(m => m.getWorkerRunsByRunId(workItem.runId));
    workerRun = existingRuns.find(r => r.partitionId === workItem.partitionId);
    if (!workerRun) {
      throw new Error(`Worker run not found for partition ${workItem.partitionId}`);
    }
  }

  let recordsProcessed = 0;
  let hasMore = false;

  try {
    const result = await processWorkItemPage(workItem, adapter, workerRun.id, log);
    recordsProcessed = result.recordsProcessed;
    hasMore = result.hasMore;

    if (result.skipped) {
      log.info("Message skipped due to idempotency guard, acknowledging without state changes");
      return;
    }

    log.info("Page processed successfully", { recordsProcessed, hasMore });

    if (hasMore) {
      const nextWorkItem: WorkItemMessage = {
        ...workItem,
        offset: workItem.offset + recordsProcessed,
      };
      log.info("Enqueueing next page", { nextOffset: nextWorkItem.offset });
      await sendWorkItem(nextWorkItem);
      log.info("Next page enqueued successfully");
    } else {
      log.info("Partition completed, no more pages");
      await updateWorkerRun(workerRun.id, "completed");

      const workDoneMessage: WorkDoneMessage = {
        type: "WORK_DONE",
        feed: workItem.feed,
        runId: workItem.runId,
        traceId: workItem.traceId,
        workerId,
        partitionId: workItem.partitionId,
        recordsProcessed,
        status: "success",
      };
      await sendWorkDone(workDoneMessage);

      const { completedWorkers, expectedWorkers, failedWorkers } =
        await getRunWorkerCounts(workItem.runId);

      log.info("Worker completed", { completedWorkers, expectedWorkers, failedWorkers });

      if (completedWorkers === expectedWorkers && failedWorkers === 0) {
        log.info("All workers completed successfully, triggering consolidation");
        await sendConsolidate({
          type: "CONSOLIDATE",
          feed: workItem.feed,
          runId: workItem.runId,
          traceId: workItem.traceId,
        });
        sendAlert(
          'Run Completed',
          `Run ${workItem.runId} (feed: ${workItem.feed}) completed successfully.\n\nWorkers: ${completedWorkers}/${expectedWorkers} succeeded\nConsolidation has been triggered.`
        ).catch(() => {});
      } else if (completedWorkers + failedWorkers >= expectedWorkers) {
        const successRate = completedWorkers / expectedWorkers;
        if (successRate >= AUTO_CONSOLIDATION_SUCCESS_THRESHOLD && completedWorkers > 0) {
          log.info("Auto-starting consolidation with partial success", {
            successRate: Math.round(successRate * 100), completedWorkers, failedWorkers, expectedWorkers,
            delayMinutes: AUTO_CONSOLIDATION_DELAY_MINUTES,
          });
          await sendConsolidate({
            type: "CONSOLIDATE", feed: workItem.feed, runId: workItem.runId, traceId: workItem.traceId, force: true,
          }, AUTO_CONSOLIDATION_DELAY_MINUTES);
          sendAlert('Run Completed (Partial Success)',
            `Run ${workItem.runId} (feed: ${workItem.feed}) finished with partial success.\n\nWorkers: ${completedWorkers}/${expectedWorkers} succeeded (${Math.round(successRate * 100)}%)\nFailed workers: ${failedWorkers}\n\nConsolidation will auto-start in ${AUTO_CONSOLIDATION_DELAY_MINUTES} minutes.`
          ).catch(() => {});
        } else {
          log.warn("All workers finished but success rate below threshold, skipping consolidation", {
            successRate: Math.round(successRate * 100), completedWorkers, failedWorkers, expectedWorkers,
            threshold: `${AUTO_CONSOLIDATION_SUCCESS_THRESHOLD * 100}%`,
          });
          sendAlert('Run Failed',
            `Run ${workItem.runId} (feed: ${workItem.feed}) failed - success rate below ${AUTO_CONSOLIDATION_SUCCESS_THRESHOLD * 100}% threshold.\n\nWorkers: ${completedWorkers}/${expectedWorkers} succeeded (${Math.round(successRate * 100)}%)\nFailed workers: ${failedWorkers}\n\nConsolidation was NOT triggered. Manual intervention may be required.`
          ).catch(() => {});
        }
      }
    }
  } catch (error) {
    const rawErrorMessage = error instanceof Error ? error.message : String(error);
    const errorMessage = capErrorMessage(rawErrorMessage);
    const errorStack = error instanceof Error ? error.stack : undefined;

    log.error("Worker page processing failed", {
      errorType: error instanceof Error ? error.name : "unknown", errorMessage, offset: workItem.offset,
    });

    insertErrorLog('worker', errorMessage, errorStack, {
      runId: workItem.runId, partitionId: workItem.partitionId, offset: String(workItem.offset),
    }).catch(() => {});

    await updateWorkerRun(workerRun.id, "failed", errorMessage);
    const isFirstFailure = await markPartitionFailed(workItem.runId, workItem.partitionId);
    if (isFirstFailure) { log.info("Partition marked as failed"); }
    else { log.info("Partition already marked as failed, not double-counting"); }

    const workDoneMessage: WorkDoneMessage = {
      type: "WORK_DONE", feed: workItem.feed, runId: workItem.runId, traceId: workItem.traceId,
      workerId, partitionId: workItem.partitionId, recordsProcessed, status: "failed", error: errorMessage,
    };
    await sendWorkDone(workDoneMessage);

    try {
      const { completedWorkers, expectedWorkers, failedWorkers } = await getRunWorkerCounts(workItem.runId);
      if (completedWorkers + failedWorkers >= expectedWorkers) {
        const successRate = completedWorkers / expectedWorkers;
        if (successRate >= AUTO_CONSOLIDATION_SUCCESS_THRESHOLD && completedWorkers > 0) {
          log.info("Auto-starting consolidation with partial success (from failure path)", {
            successRate: Math.round(successRate * 100), completedWorkers, failedWorkers, expectedWorkers,
            delayMinutes: AUTO_CONSOLIDATION_DELAY_MINUTES,
          });
          await sendConsolidate({
            type: "CONSOLIDATE", feed: workItem.feed, runId: workItem.runId, traceId: workItem.traceId, force: true,
          }, AUTO_CONSOLIDATION_DELAY_MINUTES);
          sendAlert('Run Completed (Partial Success)',
            `Run ${workItem.runId} (feed: ${workItem.feed}) finished with partial success.\n\nWorkers: ${completedWorkers}/${expectedWorkers} succeeded (${Math.round(successRate * 100)}%)\nFailed workers: ${failedWorkers}\n\nConsolidation will auto-start in ${AUTO_CONSOLIDATION_DELAY_MINUTES} minutes.`
          ).catch(() => {});
        } else {
          log.warn("All workers finished but success rate below threshold, skipping consolidation", {
            successRate: Math.round(successRate * 100), completedWorkers, failedWorkers, expectedWorkers,
            threshold: `${AUTO_CONSOLIDATION_SUCCESS_THRESHOLD * 100}%`,
          });
          sendAlert('Run Failed',
            `Run ${workItem.runId} (feed: ${workItem.feed}) failed - success rate below ${AUTO_CONSOLIDATION_SUCCESS_THRESHOLD * 100}% threshold.\n\nWorkers: ${completedWorkers}/${expectedWorkers} succeeded (${Math.round(successRate * 100)}%)\nFailed workers: ${failedWorkers}\n\nConsolidation was NOT triggered. Manual intervention may be required.`
          ).catch(() => {});
        }
      }
    } catch (checkError) {
      log.error("Failed to check auto-consolidation after worker failure", {
        error: checkError instanceof Error ? checkError.message : String(checkError),
      });
    }

    throw error;
  }
}

async function run(): Promise<void> {
  const log = baseLogger.child({ workerId });
  log.info("Worker starting", { registeredFeeds: feedRegistry.getFeedIds() });

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
      const rawErrorMsg = error instanceof Error ? error.message : String(error);
      const errorMsg = capErrorMessage(rawErrorMsg);
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
    const rawErrorMsg = error instanceof Error ? error.message : String(error);
    const errorMsg = capErrorMessage(rawErrorMsg);
    baseLogger.error("Worker failed", { errorMessage: errorMsg, errorType: error instanceof Error ? error.name : "unknown" });
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
