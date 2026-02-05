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
  MAX_SCHEDULER_RECORDS,
  WORKER_PAGE_SIZE,
  RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_WAIT_MS,
  RATE_LIMIT_BASE_DELAY_MS,
  createLogger,
  generateTraceId,
  type WorkItemMessage,
  type RunType,
} from "@diamond/shared";
import { createRunMetadata, closePool, acquireRateLimitToken } from "@diamond/database";
import { NivodaAdapter, scanHeatmap, type NivodaQuery, type HeatmapConfig } from "@diamond/nivoda";
import { getWatermark } from "./watermark.js";
import { sendWorkItems, closeConnections } from "./service-bus.js";

const logger = createLogger({ service: "scheduler" });

async function run(): Promise<void> {
  const traceId = generateTraceId();
  const log = logger.child({ traceId });

  log.info("Starting scheduler");

  const watermark = await getWatermark();

  // Check if RUN_TYPE is explicitly set (e.g., from API trigger)
  // If not, auto-detect based on watermark state
  let runType: RunType;
  const explicitRunType = process.env.RUN_TYPE as RunType | undefined;

  if (explicitRunType && ["full", "incremental"].includes(explicitRunType)) {
    runType = explicitRunType;
    log.info("Run type explicitly set via RUN_TYPE environment variable", { runType });
  } else {
    // Auto-detect: if watermark exists, do incremental; otherwise full
    runType = watermark ? "incremental" : "full";
    log.info("Run type auto-detected from watermark state", { runType, hasWatermark: !!watermark });
  }

  const watermarkBefore = watermark
    ? new Date(watermark.lastUpdatedAt)
    : undefined;

  log.info("Run configuration determined", {
    runType,
    watermarkBefore: watermarkBefore?.toISOString(),
    explicitRunTypeSet: !!explicitRunType,
  });

  // Configure rate limiter for heatmap scanning
  const rateLimitConfig = {
    maxRequestsPerWindow: RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
    windowDurationMs: RATE_LIMIT_WINDOW_MS,
    maxWaitMs: RATE_LIMIT_MAX_WAIT_MS,
    baseDelayMs: RATE_LIMIT_BASE_DELAY_MS,
  };
  const acquireRateLimit = () => acquireRateLimitToken("nivoda_global", rateLimitConfig);

  // Create adapter with rate limiting but no desync delay (scheduler runs sequentially)
  const adapter = new NivodaAdapter(undefined, undefined, undefined, {
    enableDesyncDelay: false,
    rateLimiter: acquireRateLimit,
  });

  const baseQuery: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
  };

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
      // Continuation pattern: start at offset 0 with page size 30
      offset: 0,
      limit: WORKER_PAGE_SIZE,
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
