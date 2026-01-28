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
  WORKER_PAGE_SIZE,
  DIAMOND_SHAPES,
  withRetry,
  createLogger,
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
  upsertRawDiamond,
  closePool,
} from "@diamond/database";
import {
  NivodaAdapter,
  type NivodaQuery,
} from "@diamond/nivoda";
import {
  receiveWorkItem,
  sendWorkDone,
  sendConsolidate,
  closeConnections,
} from "./service-bus.js";

const baseLogger = createLogger({ service: "worker" });
const workerId = randomUUID();

async function processWorkItem(
  workItem: WorkItemMessage,
  workerRunId: string,
  log: Logger
): Promise<number> {
  log.info("Processing partition", {
    partitionId: workItem.partitionId,
    priceRange: { min: workItem.minPrice, max: workItem.maxPrice },
    expectedRecords: workItem.totalRecords,
  });

  const adapter = new NivodaAdapter();
  let recordsProcessed = 0;

  // Apply price range filter from the work item
  const query: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
    dollar_value: { from: workItem.minPrice, to: workItem.maxPrice },
  };

  let currentOffset = 0;
  const targetEnd = workItem.totalRecords;

  while (currentOffset < targetEnd) {
    const limit = Math.min(WORKER_PAGE_SIZE, targetEnd - currentOffset);

    log.debug("Fetching page", { offset: currentOffset, limit });

    const response = await withRetry(
      () => adapter.searchDiamonds(query, { offset: currentOffset, limit }),
      {
        onRetry: (error, attempt) => {
          log.warn("Retrying search diamonds", {
            attempt,
            offset: currentOffset,
            error: error.message,
          });
        },
      },
    );

    if (response.items.length === 0) {
      log.info("No more items returned, ending pagination");
      break;
    }

    for (const item of response.items) {
      await upsertRawDiamond(
        workItem.runId,
        item.diamond.id,
        item.id,
        item as unknown as Record<string, unknown>,
      );
      recordsProcessed++;
    }

    // Update progress in database after each page
    await updateWorkerProgress(workerRunId, recordsProcessed);

    log.debug("Page processed", {
      recordsProcessed,
      pageSize: response.items.length,
    });
    currentOffset += response.items.length;

    if (response.items.length < limit) {
      break;
    }
  }

  return recordsProcessed;
}

async function handleWorkItem(workItem: WorkItemMessage): Promise<void> {
  const log = baseLogger.child({
    runId: workItem.runId,
    traceId: workItem.traceId,
    workerId,
    partitionId: workItem.partitionId,
  });

  log.info("Starting work item processing");

  const workerRun = await createWorkerRun(
    workItem.runId,
    workItem.partitionId,
    workerId,
    workItem as unknown as Record<string, unknown>,
  );

  let status: "completed" | "failed" = "completed";
  let recordsProcessed = 0;
  let errorMessage: string | undefined;

  try {
    recordsProcessed = await processWorkItem(workItem, workerRun.id, log);
    log.info("Work item completed successfully", { recordsProcessed });
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    // Log only error message and type to avoid large payloads
    log.error("Worker failed", {
      errorType: error instanceof Error ? error.name : "unknown",
      errorMessage,
      recordsProcessed,
    });
  }

  await updateWorkerRun(workerRun.id, status, recordsProcessed, errorMessage);

  if (status === "failed") {
    await incrementFailedWorkers(workItem.runId);
  }

  const workDoneMessage: WorkDoneMessage = {
    type: "WORK_DONE",
    runId: workItem.runId,
    traceId: workItem.traceId,
    workerId,
    partitionId: workItem.partitionId,
    recordsProcessed,
    status: status === "completed" ? "success" : "failed",
    error: errorMessage,
  };

  await sendWorkDone(workDoneMessage);

  if (status === "completed") {
    const { completedWorkers, expectedWorkers, failedWorkers } =
      await incrementCompletedWorkers(workItem.runId);

    log.info("Worker progress updated", {
      completedWorkers,
      expectedWorkers,
      failedWorkers,
    });

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
