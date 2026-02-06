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
  DIAMOND_SHAPES,
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  MAX_SCHEDULER_RECORDS,
  WORKER_PAGE_SIZE,
  RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_WAIT_MS,
  RATE_LIMIT_BASE_DELAY_MS,
  FULL_RUN_START_DATE,
  INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES,
  createLogger,
  generateTraceId,
  type WorkItemMessage,
  type RunType,
} from "@diamond/shared";

console.log('[scheduler] @diamond/shared imported successfully');

import { createRunMetadata, closePool, acquireRateLimitToken, insertErrorLog } from "@diamond/database";

console.log('[scheduler] @diamond/database imported successfully');

import { NivodaAdapter, scanHeatmap, type NivodaQuery, type HeatmapConfig } from "@diamond/nivoda";

console.log('[scheduler] @diamond/nivoda imported successfully');

import { getWatermark } from "./watermark.js";

console.log('[scheduler] watermark module imported successfully');

import { sendWorkItems, closeConnections } from "./service-bus.js";

console.log('[scheduler] service-bus module imported successfully');
console.log('[scheduler] All imports complete, creating logger...');

const logger = createLogger({ service: "scheduler" });

console.log('[scheduler] Logger created, defining run function...');

async function run(): Promise<void> {
  const traceId = generateTraceId();
  const log = logger.child({ traceId });

  log.info("Starting scheduler run function");

  log.info("Fetching watermark from Azure Storage...");
  const watermark = await getWatermark();
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
  log.info("Calculating date range for Nivoda queries...");
  const now = new Date();
  const updatedTo = now.toISOString();

  log.info("Current time calculated", { updatedTo });

  // Calculate updatedFrom based on run type
  let updatedFrom: string;
  if (runType === "full") {
    // Full run: capture all historical data from a safe start date
    log.info("Full run: using FULL_RUN_START_DATE", { FULL_RUN_START_DATE });
    updatedFrom = FULL_RUN_START_DATE;
  } else if (watermark?.lastUpdatedAt) {
    // Incremental run: use watermark with safety buffer
    log.info("Incremental run: calculating from watermark with safety buffer", {
      watermarkLastUpdatedAt: watermark.lastUpdatedAt,
      safetyBufferMinutes: INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES,
    });
    const watermarkTime = new Date(watermark.lastUpdatedAt);
    const safetyBufferMs = INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES * 60 * 1000;
    updatedFrom = new Date(watermarkTime.getTime() - safetyBufferMs).toISOString();
    log.info("Incremental updatedFrom calculated", { updatedFrom });
  } else {
    // Edge case: incremental requested but no watermark exists
    // Fall back to full run behavior
    log.warn("Incremental run requested but no watermark found, falling back to full run date range");
    updatedFrom = FULL_RUN_START_DATE;
  }

  // For backwards compatibility, also keep watermarkBefore for run metadata
  const watermarkBefore = watermark
    ? new Date(watermark.lastUpdatedAt)
    : undefined;

  log.info("Run configuration determined", {
    runType,
    updatedFrom,
    updatedTo,
    watermarkBefore: watermarkBefore?.toISOString(),
    explicitRunTypeSet: !!explicitRunType,
  });

  // Configure rate limiter for heatmap scanning
  log.info("Configuring rate limiter...");
  const rateLimitConfig = {
    maxRequestsPerWindow: RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
    windowDurationMs: RATE_LIMIT_WINDOW_MS,
    maxWaitMs: RATE_LIMIT_MAX_WAIT_MS,
    baseDelayMs: RATE_LIMIT_BASE_DELAY_MS,
  };
  log.info("Rate limiter configured", { rateLimitConfig });

  const acquireRateLimit = () => acquireRateLimitToken("nivoda_global", rateLimitConfig);

  // Create adapter with rate limiting but no desync delay (scheduler runs sequentially)
  log.info("Creating Nivoda adapter...");
  const adapter = new NivodaAdapter(undefined, undefined, undefined, {
    enableDesyncDelay: false,
    rateLimiter: acquireRateLimit,
  });
  log.info("Nivoda adapter created");

  // Base query includes date range filter for consistent heatmap counts
  // This ensures partition sizes match actual filtered results
  const baseQuery: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
    updated: { from: updatedFrom, to: updatedTo },
  };
  log.info("Base query constructed", {
    shapesCount: baseQuery.shapes?.length,
    sizes: baseQuery.sizes,
    updated: baseQuery.updated,
  });

  // Configure heatmap based on run type
  // Incremental runs may have much less data, so we can use fewer workers
  // MAX_SCHEDULER_RECORDS env var allows capping total records (useful for staging)
  const maxTotalRecords = parseInt(process.env.MAX_SCHEDULER_RECORDS || '', 10) || MAX_SCHEDULER_RECORDS;

  const heatmapConfig: HeatmapConfig = {
    maxWorkers: runType === "incremental"
      ? Math.min(10, HEATMAP_MAX_WORKERS)
      : HEATMAP_MAX_WORKERS,
    minRecordsPerWorker: HEATMAP_MIN_RECORDS_PER_WORKER,
    maxTotalRecords,
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
  );

  const runLog = log.child({ runId: runMetadata.runId });
  runLog.info("Run created", { expectedWorkers: heatmapResult.workerCount });

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
      // Continuation pattern: start at offset 0 with page size 30
      offset: 0,
      limit: WORKER_PAGE_SIZE,
      // Pass the same date range used in heatmap for consistent filtering
      updatedFrom,
      updatedTo,
    })
  );

  runLog.info("Enqueueing work items", { count: workItems.length });
  await sendWorkItems(workItems);
  runLog.info("Work items enqueued successfully");

  runLog.info("Scheduler completed");
}

console.log('[scheduler] Run function defined, defining main function...');

async function main(): Promise<void> {
  console.log('[scheduler] main() called');
  try {
    await run();
  } catch (error) {
    logger.error("Scheduler failed", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    insertErrorLog('scheduler', errorMessage, errorStack).catch(() => {});
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
