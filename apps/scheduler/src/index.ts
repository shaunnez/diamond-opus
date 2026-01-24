import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../../..");

config({ path: resolve(rootDir, ".env.local") });
config({ path: resolve(rootDir, ".env") });
import {
  RECORDS_PER_WORKER,
  DIAMOND_SHAPES,
  type WorkItemMessage,
  type RunType,
} from "@diamond/shared";
import { createRunMetadata, closePool } from "@diamond/database";
import { NivodaAdapter, type NivodaQuery } from "@diamond/nivoda";
import { getWatermark } from "./watermark.js";
import { sendWorkItems, closeConnections } from "./service-bus.js";

async function run(): Promise<void> {
  console.log("Starting scheduler...");

  const watermark = await getWatermark();
  const runType: RunType = watermark ? "incremental" : "full";
  const watermarkBefore = watermark
    ? new Date(watermark.lastUpdatedAt)
    : undefined;

  console.log(`Run type: ${runType}`);
  if (watermarkBefore) {
    console.log(`Watermark: ${watermarkBefore.toISOString()}`);
  }

  const adapter = new NivodaAdapter();

  const baseQuery: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
  };

  console.log("Fetching diamond count using diamonds_by_query_count...");
  const totalRecords = await adapter.getDiamondsCount(baseQuery);
  console.log(`Total records: ${totalRecords}`);

  if (totalRecords === 0) {
    console.log("No diamonds to process. Exiting.");
    return;
  }

  const numWorkers = Math.ceil(totalRecords / RECORDS_PER_WORKER);
  console.log(`Number of workers: ${numWorkers}`);

  console.log("    Creating run metadata...");
  const runMetadata = await createRunMetadata(
    runType,
    numWorkers,
    watermarkBefore,
  );
  console.log(`Created run: ${runMetadata.runId}`);

  const now = new Date();
  const workItems: WorkItemMessage[] = [];

  for (let i = 0; i < numWorkers; i++) {
    const offsetStart = i * RECORDS_PER_WORKER;
    const offsetEnd = Math.min((i + 1) * RECORDS_PER_WORKER, totalRecords);

    workItems.push({
      type: "WORK_ITEM",
      runId: runMetadata.runId,
      partitionId: `partition-${i}`,
      offsetStart,
      offsetEnd,
      updatedFrom: watermarkBefore?.toISOString(),
      updatedTo: now.toISOString(),
    });
  }

  console.log(`Enqueueing ${workItems.length} work items...`);
  await sendWorkItems(workItems);
  console.log("Work items enqueued successfully");

  console.log("Scheduler completed");
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error("Scheduler failed:", error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

main();
