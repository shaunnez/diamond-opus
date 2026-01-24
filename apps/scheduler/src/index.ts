import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../../..");

config({ path: resolve(rootDir, ".env.local") });
config({ path: resolve(rootDir, ".env") });
import {
  DIAMOND_SHAPES,
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  type WorkItemMessage,
  type RunType,
} from "@diamond/shared";
import { createRunMetadata, closePool } from "@diamond/database";
import { NivodaAdapter, type NivodaQuery } from "@diamond/nivoda";
import { getWatermark } from "./watermark.js";
import { sendWorkItems, closeConnections } from "./service-bus.js";
import { scanHeatmap, type HeatmapConfig } from "./heatmap.js";

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

  // Configure heatmap based on run type
  // Incremental runs may have much less data, so we can use fewer workers
  const heatmapConfig: HeatmapConfig = {
    maxWorkers: runType === "incremental"
      ? Math.min(10, HEATMAP_MAX_WORKERS)
      : HEATMAP_MAX_WORKERS,
    minRecordsPerWorker: HEATMAP_MIN_RECORDS_PER_WORKER,
  };

  console.log("Starting heatmap scan to build density map...");
  const heatmapResult = await scanHeatmap(adapter, baseQuery, heatmapConfig);

  if (heatmapResult.totalRecords === 0) {
    console.log("No diamonds to process. Exiting.");
    return;
  }

  console.log(`\nTotal records found: ${heatmapResult.totalRecords}`);
  console.log(`Number of workers: ${heatmapResult.workerCount}`);

  console.log("Creating run metadata...");
  const runMetadata = await createRunMetadata(
    runType,
    heatmapResult.workerCount,
    watermarkBefore,
  );
  console.log(`Created run: ${runMetadata.runId}`);

  const now = new Date();
  const workItems: WorkItemMessage[] = heatmapResult.partitions.map(
    (partition) => ({
      type: "WORK_ITEM" as const,
      runId: runMetadata.runId,
      partitionId: partition.partitionId,
      minPrice: partition.minPrice,
      maxPrice: partition.maxPrice,
      totalRecords: partition.totalRecords,
      offsetStart: 0,
      offsetEnd: partition.totalRecords,
      updatedFrom: watermarkBefore?.toISOString(),
      updatedTo: now.toISOString(),
    })
  );

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
