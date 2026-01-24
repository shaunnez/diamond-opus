import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../../..");

config({ path: resolve(rootDir, ".env.local") });
config({ path: resolve(rootDir, ".env") });
import {
  WORKER_PAGE_SIZE,
  DIAMOND_SHAPES,
  withRetry,
  type WorkItemMessage,
  type WorkDoneMessage,
} from "@diamond/shared";
import {
  createWorkerRun,
  updateWorkerRun,
  incrementCompletedWorkers,
  incrementFailedWorkers,
  upsertRawDiamond,
  closePool,
} from "@diamond/database";
import {
  NivodaAdapter,
  type NivodaQuery,
  type NivodaItem,
} from "@diamond/nivoda";
import {
  receiveWorkItem,
  sendWorkDone,
  sendConsolidate,
  closeConnections,
} from "./service-bus.js";

const workerId = randomUUID();

async function processWorkItem(workItem: WorkItemMessage): Promise<number> {
  console.log(`Processing partition ${workItem.partitionId}`);
  console.log(`Price range: $${workItem.minPrice} - $${workItem.maxPrice}`);
  console.log(`Expected records: ${workItem.totalRecords}`);

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

    console.log(`Fetching page: offset=${currentOffset}, limit=${limit}`);

    const response = await withRetry(
      () => adapter.searchDiamonds(query, { offset: currentOffset, limit }),
      {
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} after error: ${error.message}`);
        },
      },
    );

    if (response.items.length === 0) {
      console.log("No more items returned, breaking");
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

    console.log(`Processed ${recordsProcessed} records so far`);
    currentOffset += response.items.length;

    if (response.items.length < limit) {
      break;
    }
  }

  return recordsProcessed;
}

async function handleWorkItem(workItem: WorkItemMessage): Promise<void> {
  const workerRun = await createWorkerRun(
    workItem.runId,
    workItem.partitionId,
    workerId,
  );

  let status: "completed" | "failed" = "completed";
  let recordsProcessed = 0;
  let errorMessage: string | undefined;

  try {
    recordsProcessed = await processWorkItem(workItem);
    console.log(`Completed processing ${recordsProcessed} records`);
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Worker failed: ${errorMessage}`);
  }

  await updateWorkerRun(workerRun.id, status, recordsProcessed, errorMessage);

  if (status === "failed") {
    await incrementFailedWorkers(workItem.runId);
  }

  const workDoneMessage: WorkDoneMessage = {
    type: "WORK_DONE",
    runId: workItem.runId,
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

    console.log(
      `Progress: ${completedWorkers}/${expectedWorkers} completed, ${failedWorkers} failed`,
    );

    if (completedWorkers === expectedWorkers && failedWorkers === 0) {
      console.log(
        "All workers completed successfully, triggering consolidation",
      );
      await sendConsolidate({
        type: "CONSOLIDATE",
        runId: workItem.runId,
      });
    } else if (completedWorkers + failedWorkers === expectedWorkers) {
      console.log(
        "All workers finished but some failed, skipping consolidation",
      );
    }
  }
}

async function run(): Promise<void> {
  console.log(`Worker ${workerId} starting...`);

  while (true) {
    const received = await receiveWorkItem();

    if (!received) {
      console.log("No work items available, waiting...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    try {
      await handleWorkItem(received.message);
      await received.complete();
    } catch (error) {
      console.error("Error processing work item:", error);
      await received.abandon();
    }
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error("Worker failed:", error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down...");
  await closeConnections();
  await closePool();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down...");
  await closeConnections();
  await closePool();
  process.exit(0);
});

main();
