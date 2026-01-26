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
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  createLogger,
  generateTraceId,
  type WorkItemMessage,
  type RunType,
} from "@diamond/shared";
import { createRunMetadata, closePool } from "@diamond/database";
import { NivodaAdapter, type NivodaQuery } from "@diamond/nivoda";
import { getWatermark } from "./watermark.js";
import { sendWorkItems, closeConnections } from "./service-bus.js";
import { scanHeatmap, type HeatmapConfig } from "./heatmap.js";

const logger = createLogger({ service: "scheduler" });

async function run(): Promise<void> {
  const traceId = generateTraceId();
  const log = logger.child({ traceId });

  log.info("Starting scheduler");

  const watermark = await getWatermark();
  const runType: RunType = watermark ? "incremental" : "full";
  const watermarkBefore = watermark
    ? new Date(watermark.lastUpdatedAt)
    : undefined;

  log.info("Run configuration determined", {
    runType,
    watermarkBefore: watermarkBefore?.toISOString(),
  });

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

  log.info("Starting heatmap scan", { heatmapConfig });
  const heatmapResult = await scanHeatmap(adapter, baseQuery, heatmapConfig, log);

  if (heatmapResult.totalRecords === 0) {
    log.info("No diamonds to process, exiting");
    return;
  }

  log.info("Heatmap scan completed", {
    totalRecords: heatmapResult.totalRecords,
    workerCount: heatmapResult.workerCount,
    stats: heatmapResult.stats,
  });

  log.info("Creating run metadata");
  const runMetadata = await createRunMetadata(
    runType,
    heatmapResult.workerCount,
    watermarkBefore,
  );

  const runLog = log.child({ runId: runMetadata.runId });
  runLog.info("Run created", { expectedWorkers: heatmapResult.workerCount });

  const now = new Date();
  const workItems: WorkItemMessage[] = heatmapResult.partitions.map(
    (partition) => ({
      type: "WORK_ITEM" as const,
      runId: runMetadata.runId,
      traceId,
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

  runLog.info("Enqueueing work items", { count: workItems.length });
  await sendWorkItems(workItems);
  runLog.info("Work items enqueued successfully");

  runLog.info("Scheduler completed");
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error("Scheduler failed", error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

main();
