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

// Early console log before any package imports (helps debug import failures)
console.log('[scheduler] Starting module initialization...');

import {
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  MAX_SCHEDULER_RECORDS,
  createServiceLogger,
  generateTraceId,
  safeLogError,
  notify,
  NotifyCategory,
  type WorkItemMessage,
  type RunType,
  FULL_RUN_START_DATE,
  INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES,
} from "@diamond/shared";

console.log('[scheduler] @diamond/shared imported successfully');

import { createRunMetadata, closePool,  insertErrorLog } from "@diamond/database";

console.log('[scheduler] @diamond/database imported successfully');

import { scanHeatmap, type HeatmapConfig } from "@diamond/feed-registry";

console.log('[scheduler] @diamond/feed-registry imported successfully');

import { getWatermark } from "./watermark.js";

console.log('[scheduler] watermark module imported successfully');

import { sendWorkItems, closeConnections } from "./service-bus.js";

console.log('[scheduler] service-bus module imported successfully');

import { createFeedRegistry } from "./feeds.js";

console.log('[scheduler] feeds module imported successfully');
console.log('[scheduler] All imports complete, creating logger...');

const logger = createServiceLogger('scheduler');

console.log('[scheduler] Logger created, defining run function...');

async function run(): Promise<void> {
  const traceId = generateTraceId();
  const log = logger.withContext({ traceId });

  // Determine which feed to run
  const feedId = process.env.FEED ?? 'nivoda-natural';
  log.info("Feed selected", { feedId });

  // Resolve feed adapter from registry
  const registry = createFeedRegistry();
  const adapter = registry.get(feedId);

  log.info("Initializing feed adapter", { feedId });
  await adapter.initialize();

  log.info("Starting scheduler run function");

  log.info("Fetching watermark from Azure Storage...", { blobName: adapter.watermarkBlobName });
  const watermark = await getWatermark(adapter.watermarkBlobName);
  log.info("Watermark fetched", {
    hasWatermark: !!watermark,
    watermarkData: watermark ? {
      lastUpdatedAt: watermark.lastUpdatedAt,
      lastRunId: watermark.lastRunId,
    } : null,
  });

  // Check if RUN_TYPE is explicitly set (e.g., from API trigger)
  // If not, auto-detect based on watermark state
  let runType: RunType;
  const explicitRunType = process.env.RUN_TYPE as RunType | undefined;

  log.info("Checking RUN_TYPE environment variable", {
    explicitRunType,
    hasExplicitRunType: !!explicitRunType,
  });

  if (explicitRunType && ["full", "incremental"].includes(explicitRunType)) {
    runType = explicitRunType;
    log.info("Run type explicitly set via RUN_TYPE environment variable", { runType });
  } else {
    // Auto-detect: if watermark exists, do incremental; otherwise full
    runType = watermark ? "incremental" : "full";
    log.info("Run type auto-detected from watermark state", { runType, hasWatermark: !!watermark });
  }

  // Calculate the run's time window (updatedTo is fixed at run start for consistency)
  log.info("Calculating date range for queries...");
  const now = new Date();
  const updatedTo = now.toISOString();

  log.info("Current time calculated", { updatedTo });

  // Calculate updatedFrom based on run type
  let updatedFrom: string;
  if (runType === "full") {
    log.info("Full run: using FULL_RUN_START_DATE", { FULL_RUN_START_DATE });
    updatedFrom = FULL_RUN_START_DATE;
  } else if (watermark?.lastUpdatedAt) {
    log.info("Incremental run: calculating from watermark with safety buffer", {
      watermarkLastUpdatedAt: watermark.lastUpdatedAt,
      safetyBufferMinutes: INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES,
    });
    const watermarkTime = new Date(watermark.lastUpdatedAt);
    const safetyBufferMs = INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES * 60 * 1000;
    updatedFrom = new Date(watermarkTime.getTime() - safetyBufferMs).toISOString();
    log.info("Incremental updatedFrom calculated", { updatedFrom });
  } else {
    log.warn("Incremental run requested but no watermark found, falling back to full run date range");
    updatedFrom = FULL_RUN_START_DATE;
  }

  const watermarkBefore = watermark
    ? new Date(watermark.lastUpdatedAt)
    : undefined;

  log.info("Run configuration determined", {
    feedId,
    runType,
    updatedFrom,
    updatedTo,
    watermarkBefore: watermarkBefore?.toISOString(),
    explicitRunTypeSet: !!explicitRunType,
  });

  // Build the base query using the feed adapter
  const baseQuery = adapter.buildBaseQuery(updatedFrom, updatedTo);
  log.info("Base query constructed", { baseQuery });

  // Configure heatmap based on run type
  const maxTotalRecords = parseInt(process.env.MAX_SCHEDULER_RECORDS || '', 10) || MAX_SCHEDULER_RECORDS;

  const heatmapConfig: HeatmapConfig = {
    maxWorkers: HEATMAP_MAX_WORKERS,
    minRecordsPerWorker: HEATMAP_MIN_RECORDS_PER_WORKER,
    maxTotalRecords,
    ...adapter.heatmapConfig,
  };

  if (maxTotalRecords > 0) {
    log.info("Record cap enabled", { maxTotalRecords });
  }

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

  log.info("Creating run metadata in database...");
  const runMetadata = await createRunMetadata(
    runType,
    heatmapResult.workerCount,
    watermarkBefore,
    feedId,
  );

  const runLog = log.child({ runId: runMetadata.runId });
  runLog.info("Run created", { expectedWorkers: heatmapResult.workerCount, feed: feedId });

  const workItems: WorkItemMessage[] = heatmapResult.partitions.map(
    (partition) => ({
      type: "WORK_ITEM" as const,
      feed: feedId,
      runId: runMetadata.runId,
      traceId,
      partitionId: partition.partitionId,
      minPrice: partition.minPrice,
      maxPrice: partition.maxPrice,
      estimatedRecords: partition.totalRecords,
      offset: 0,
      limit: adapter.workerPageSize,
      updatedFrom,
      updatedTo,
    })
  );

  runLog.info("Enqueueing work items", { count: workItems.length });
  await sendWorkItems(workItems);
  runLog.info("Work items enqueued successfully");

  notify({
    category: NotifyCategory.SCHEDULER_STARTED,
    title: 'Pipeline Run Started',
    message: `${runType} run started for feed "${feedId}" with ${heatmapResult.workerCount} workers covering ${heatmapResult.totalRecords.toLocaleString()} records.`,
    context: { runId: runMetadata.runId, traceId, feed: feedId, runType, workers: String(heatmapResult.workerCount), records: String(heatmapResult.totalRecords) },
  }).catch(() => {});

  runLog.info("Scheduler completed");
}

console.log('[scheduler] Run function defined, defining main function...');

async function main(): Promise<void> {
  console.log('[scheduler] main() called');
  try {
    await run();
  } catch (error) {
    logger.error("Scheduler failed", error);
    safeLogError(insertErrorLog, 'scheduler', error, undefined, logger);
    process.exitCode = 1;
  } finally {
    console.log('[scheduler] Cleaning up connections...');
    await closeConnections();
    await closePool();
    console.log('[scheduler] Cleanup complete');
  }
}

console.log('[scheduler] Starting main()...');
main();
