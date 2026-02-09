import {
  HEATMAP_MIN_PRICE,
  HEATMAP_MAX_PRICE,
  HEATMAP_DENSE_ZONE_THRESHOLD,
  HEATMAP_DENSE_ZONE_STEP,
  HEATMAP_INITIAL_STEP,
  HEATMAP_TARGET_RECORDS_PER_CHUNK,
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  withRetry,
  nullLogger,
  type Logger,
} from "@diamond/shared";
import { NivodaAdapter } from "./adapter.js";
import type { NivodaQuery } from "./types.js";

export interface DensityChunk {
  min: number;
  max: number;
  count: number;
}

export interface WorkerPartition {
  partitionId: string;
  minPrice: number;
  maxPrice: number;
  totalRecords: number;
}

export interface HeatmapConfig {
  minPrice?: number;
  maxPrice?: number;
  denseZoneThreshold?: number;
  denseZoneStep?: number;
  initialStep?: number;
  targetRecordsPerChunk?: number;
  maxWorkers?: number;
  minRecordsPerWorker?: number;
  /** Number of concurrent count queries (default: 3) */
  concurrency?: number;
  /**
   * Enable two-pass scanning with binary search refinement.
   * First pass uses coarse steps to find dense regions, then refines boundaries.
   * More efficient for large price ranges with sparse data.
   */
  useTwoPassScan?: boolean;
  /** Coarse step size for first pass when useTwoPassScan=true (default: 5000) */
  coarseStep?: number;
  /** Maximum total records to process (0 = unlimited). Partitions will be truncated to stay within this limit. */
  maxTotalRecords?: number;
}

export interface HeatmapResult {
  densityMap: DensityChunk[];
  partitions: WorkerPartition[];
  totalRecords: number;
  /** Actual worker count (always equals partitions.length) */
  workerCount: number;
  /** Scan statistics for monitoring/debugging */
  stats: ScanStats;
}

export interface ScanStats {
  /** Total API calls made during scanning */
  apiCalls: number;
  /** Time taken for the scan in milliseconds */
  scanDurationMs: number;
  /** Number of price ranges scanned */
  rangesScanned: number;
  /** Number of non-empty ranges found */
  nonEmptyRanges: number;
  /** Whether two-pass mode was used */
  usedTwoPass: boolean;
}

/** Internal context for tracking scan progress */
interface ScanContext {
  apiCalls: number;
  rangesScanned: number;
  log: Logger;
}

/**
 * Scans price ranges to build a density map, then partitions into balanced worker buckets.
 *
 * Interval semantics: Uses half-open intervals [min, max) where max is exclusive.
 * This avoids gaps and overlaps when scanning consecutive ranges.
 */
export async function scanHeatmap(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  config: HeatmapConfig = {},
  logger: Logger = nullLogger,
): Promise<HeatmapResult> {
  const minPrice = config.minPrice ?? HEATMAP_MIN_PRICE;
  const maxPrice = config.maxPrice ?? HEATMAP_MAX_PRICE;
  const denseZoneThreshold =
    config.denseZoneThreshold ?? HEATMAP_DENSE_ZONE_THRESHOLD;
  const denseZoneStep = config.denseZoneStep ?? HEATMAP_DENSE_ZONE_STEP;
  const initialStep = config.initialStep ?? HEATMAP_INITIAL_STEP;
  const targetRecordsPerChunk =
    config.targetRecordsPerChunk ?? HEATMAP_TARGET_RECORDS_PER_CHUNK;
  const maxWorkers = config.maxWorkers ?? HEATMAP_MAX_WORKERS;
  const minRecordsPerWorker =
    config.minRecordsPerWorker ?? HEATMAP_MIN_RECORDS_PER_WORKER;
  const concurrency = config.concurrency ?? 3;
  const useTwoPassScan = config.useTwoPassScan ?? false;
  const coarseStep = config.coarseStep ?? 5000;
  const maxTotalRecords = config.maxTotalRecords ?? 0;

  const startTime = Date.now();

  const log = logger.child({ component: "heatmap" });

  log.info("Starting heatmap scan", {
    priceRange: { min: minPrice, max: maxPrice },
    denseZoneThreshold,
    denseZoneStep,
    concurrency,
    useTwoPassScan,
    coarseStep: useTwoPassScan ? coarseStep : undefined,
  });

  // Track scan statistics
  const scanContext: ScanContext = {
    apiCalls: 0,
    rangesScanned: 0,
    log,
  };

  // Phase 1: Heatmap Scan
  let densityMap: DensityChunk[];

  if (useTwoPassScan) {
    densityMap = await buildDensityMapTwoPass(
      adapter,
      baseQuery,
      {
        minPrice,
        maxPrice,
        denseZoneThreshold,
        denseZoneStep,
        coarseStep,
        targetRecordsPerChunk,
        concurrency,
      },
      scanContext,
    );
  } else {
    densityMap = await buildDensityMap(
      adapter,
      baseQuery,
      {
        minPrice,
        maxPrice,
        denseZoneThreshold,
        denseZoneStep,
        initialStep,
        targetRecordsPerChunk,
        concurrency,
      },
      scanContext,
    );
  }

  const scanDurationMs = Date.now() - startTime;

  if (densityMap.length === 0) {
    log.info("No records found in heatmap scan");
    return {
      densityMap: [],
      partitions: [],
      totalRecords: 0,
      workerCount: 0,
      stats: {
        apiCalls: scanContext.apiCalls,
        scanDurationMs,
        rangesScanned: scanContext.rangesScanned,
        nonEmptyRanges: 0,
        usedTwoPass: useTwoPassScan,
      },
    };
  }

  // Phase 2: Calculate fair split
  const totalRecords = densityMap.reduce((sum, chunk) => sum + chunk.count, 0);
  log.info("Heatmap scan phase complete", { totalRecords });

  // Calculate desired worker count based on data volume
  const desiredWorkerCount = calculateWorkerCount(
    totalRecords,
    maxWorkers,
    minRecordsPerWorker,
  );
  log.info("Worker count calculated", { desiredWorkerCount, maxWorkers });

  // Phase 3: Partition into balanced worker buckets
  const partitions = createPartitions(
    densityMap,
    desiredWorkerCount,
    log,
    maxTotalRecords,
  );

  // workerCount is always the actual partition count (authoritative)
  const workerCount = partitions.length;
  if (workerCount !== desiredWorkerCount) {
    log.info("Partition count differs from desired", {
      actual: workerCount,
      desired: desiredWorkerCount,
    });
  }

  // Calculate effective total (may be capped)
  const effectiveTotalRecords = partitions.reduce(
    (sum, p) => sum + p.totalRecords,
    0,
  );

  // Build final stats
  const stats: ScanStats = {
    apiCalls: scanContext.apiCalls,
    scanDurationMs,
    rangesScanned: scanContext.rangesScanned,
    nonEmptyRanges: densityMap.length,
    usedTwoPass: useTwoPassScan,
  };

  log.info("Heatmap scan complete", {
    apiCalls: stats.apiCalls,
    rangesScanned: stats.rangesScanned,
    durationMs: stats.scanDurationMs,
    totalRecords: effectiveTotalRecords,
    capped: maxTotalRecords > 0 && totalRecords > maxTotalRecords,
  });

  return {
    densityMap,
    partitions,
    totalRecords: effectiveTotalRecords,
    workerCount,
    stats,
  };
}

interface ScanRange {
  min: number;
  max: number;
  step: number;
}

/**
 * Builds density map by scanning price ranges.
 * Uses half-open intervals [min, max) to avoid gaps.
 * Supports concurrent queries for faster scanning.
 */
async function buildDensityMap(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  config: {
    minPrice: number;
    maxPrice: number;
    denseZoneThreshold: number;
    denseZoneStep: number;
    initialStep: number;
    targetRecordsPerChunk: number;
    concurrency: number;
  },
  ctx: ScanContext,
): Promise<DensityChunk[]> {
  const densityMap: DensityChunk[] = [];
  let currentPrice = config.minPrice;
  let step = config.initialStep;
  let scannedRanges = 0;

  // For concurrent scanning, we batch ranges and execute in parallel
  while (currentPrice < config.maxPrice) {
    // Build a batch of ranges to scan concurrently
    const batch: ScanRange[] = [];
    let batchPrice = currentPrice;

    for (
      let i = 0;
      i < config.concurrency && batchPrice < config.maxPrice;
      i++
    ) {
      // In dense zone (below threshold), use fixed small steps
      if (batchPrice < config.denseZoneThreshold) {
        step = config.denseZoneStep;
      }

      // Calculate range end (exclusive upper bound)
      // Nivoda API requires integer dollar values
      let rangeMax = Math.min(batchPrice + step, config.maxPrice);
      if (rangeMax <= batchPrice) {
        rangeMax = batchPrice + 1;
      }

      batch.push({ min: batchPrice, max: rangeMax, step });

      // Next range starts exactly where this one ends (half-open interval)
      batchPrice = rangeMax;
    }

    // Execute batch concurrently with retry logic
    const results = await Promise.all(
      batch.map(async (range) => {
        ctx.apiCalls++;
        const queryWithPrice: NivodaQuery = {
          ...baseQuery,
          // Nivoda API: from is inclusive, to is inclusive (integers only)
          // We use max - 1 to simulate exclusive upper bound
          dollar_value: { from: range.min, to: range.max - 1 },
        };

        const count = await withRetry(
          () => adapter.getDiamondsCount(queryWithPrice),
          {
            onRetry: (error, attempt) => {
              ctx.log.warn("Retrying count query", {
                attempt,
                priceRange: { min: range.min, max: range.max },
                error: error.message,
              });
            },
          },
        );

        return { ...range, count };
      }),
    );

    // Process results and update adaptive stepping
    for (const result of results) {
      scannedRanges++;
      ctx.rangesScanned++;
      ctx.log.debug("Scanned price range", {
        rangeIndex: scannedRanges,
        priceRange: { min: result.min, max: result.max },
        count: result.count,
      });

      if (result.count > 0) {
        densityMap.push({
          min: result.min,
          max: result.max,
          count: result.count,
        });
      }

      // Adaptive step adjustment (only above dense zone threshold)
      // Use the last result's metrics for next batch step calculation
      if (result.min >= config.denseZoneThreshold) {
        if (result.count === 0) {
          // Zoom through empty space
          step = Math.min(step * 5, 100000);
        } else {
          // Adjust step to target records per chunk
          const ratio = config.targetRecordsPerChunk / result.count;
          const newStep = Math.floor(step * ratio);
          // Use a higher minimum step above threshold for efficiency
          step = Math.max(config.denseZoneStep * 2, Math.min(newStep, 50000));
        }
      }
    }

    // Move to end of batch
    currentPrice = batchPrice;
  }

  ctx.log.info("Density map built", {
    rangesScanned: scannedRanges,
    nonEmptyChunks: densityMap.length,
  });

  return densityMap;
}

interface DenseRegion {
  start: number;
  end: number;
}

/**
 * Two-pass density map builder:
 * 1. Coarse pass: Large steps to quickly identify dense regions
 * 2. Binary search: Find exact boundaries between empty/non-empty regions
 * 3. Fine pass: Scan dense regions with smaller steps
 */
async function buildDensityMapTwoPass(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  config: {
    minPrice: number;
    maxPrice: number;
    denseZoneThreshold: number;
    denseZoneStep: number;
    coarseStep: number;
    targetRecordsPerChunk: number;
    concurrency: number;
  },
  ctx: ScanContext,
): Promise<DensityChunk[]> {
  ctx.log.info("Phase 1: Coarse scan to identify dense regions");

  // Phase 1: Coarse scan to find which regions have data
  const coarseResults = await coarseScan(
    adapter,
    baseQuery,
    {
      minPrice: config.minPrice,
      maxPrice: config.maxPrice,
      step: config.coarseStep,
      concurrency: config.concurrency,
    },
    ctx,
  );

  if (coarseResults.length === 0) {
    ctx.log.info("No data found in coarse scan");
    return [];
  }

  // Identify dense regions (contiguous ranges with data)
  const denseRegions = identifyDenseRegions(coarseResults);
  ctx.log.info("Dense regions identified", { count: denseRegions.length });

  // Phase 2: Refine boundaries with binary search
  ctx.log.info("Phase 2: Refining region boundaries");
  const refinedRegions = await refineBoundaries(
    adapter,
    baseQuery,
    denseRegions,
    coarseResults,
    config.denseZoneStep,
    ctx,
  );

  // Phase 3: Fine scan within each refined region
  ctx.log.info("Phase 3: Fine scanning dense regions");
  const densityMap: DensityChunk[] = [];

  for (const region of refinedRegions) {
    const regionChunks = await fineScanRegion(
      adapter,
      baseQuery,
      {
        start: region.start,
        end: region.end,
        denseZoneThreshold: config.denseZoneThreshold,
        denseZoneStep: config.denseZoneStep,
        targetRecordsPerChunk: config.targetRecordsPerChunk,
        concurrency: config.concurrency,
      },
      ctx,
    );
    densityMap.push(...regionChunks);
  }

  ctx.log.info("Two-pass scan complete", { chunks: densityMap.length });
  return densityMap;
}

interface CoarseResult {
  min: number;
  max: number;
  count: number;
}

/**
 * Coarse scan: Quick pass with large steps to identify which price ranges have data
 */
async function coarseScan(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  config: {
    minPrice: number;
    maxPrice: number;
    step: number;
    concurrency: number;
  },
  ctx: ScanContext,
): Promise<CoarseResult[]> {
  const results: CoarseResult[] = [];
  let currentPrice = config.minPrice;
  let rangeCount = 0;

  while (currentPrice < config.maxPrice) {
    const batch: Array<{ min: number; max: number }> = [];
    let batchPrice = currentPrice;

    for (
      let i = 0;
      i < config.concurrency && batchPrice < config.maxPrice;
      i++
    ) {
      const rangeMax = Math.min(batchPrice + config.step, config.maxPrice);
      batch.push({ min: batchPrice, max: rangeMax });
      batchPrice = rangeMax;
    }

    const batchResults = await Promise.all(
      batch.map(async (range) => {
        ctx.apiCalls++;
        const query: NivodaQuery = {
          ...baseQuery,
          dollar_value: { from: range.min, to: range.max - 1 },
        };
        const count = await withRetry(() => adapter.getDiamondsCount(query), {
          onRetry: (error, attempt) => {
            ctx.log.warn("Retrying coarse scan", {
              attempt,
              priceRange: { min: range.min, max: range.max },
              error: error.message,
            });
          },
        });
        return { ...range, count };
      }),
    );

    for (const result of batchResults) {
      rangeCount++;
      ctx.rangesScanned++;
      ctx.log.debug("Coarse scan range", {
        rangeIndex: rangeCount,
        priceRange: { min: result.min, max: result.max },
        hasData: result.count > 0,
        count: result.count,
      });
      results.push(result);
    }

    currentPrice = batchPrice;
  }

  return results;
}

/**
 * Identify contiguous dense regions from coarse scan results
 */
function identifyDenseRegions(coarseResults: CoarseResult[]): DenseRegion[] {
  const regions: DenseRegion[] = [];
  let currentRegion: DenseRegion | null = null;

  for (const result of coarseResults) {
    if (result.count > 0) {
      if (currentRegion === null) {
        currentRegion = { start: result.min, end: result.max };
      } else {
        currentRegion.end = result.max;
      }
    } else {
      if (currentRegion !== null) {
        regions.push(currentRegion);
        currentRegion = null;
      }
    }
  }

  // Don't forget the last region
  if (currentRegion !== null) {
    regions.push(currentRegion);
  }

  return regions;
}

/**
 * Refine region boundaries using binary search to find exact empty/non-empty transitions
 */
async function refineBoundaries(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  regions: DenseRegion[],
  coarseResults: CoarseResult[],
  minStep: number,
  ctx: ScanContext,
): Promise<DenseRegion[]> {
  const refined: DenseRegion[] = [];

  for (const region of regions) {
    // Find the coarse result just before this region (if any) for start refinement
    const prevEmpty = coarseResults.find(
      (r) => r.max === region.start && r.count === 0,
    );

    // Find the coarse result just after this region (if any) for end refinement
    const nextEmpty = coarseResults.find(
      (r) => r.min === region.end && r.count === 0,
    );

    let refinedStart = region.start;
    let refinedEnd = region.end;

    // Binary search to find exact start boundary
    if (prevEmpty) {
      refinedStart = await binarySearchBoundary(
        adapter,
        baseQuery,
        prevEmpty.min,
        region.start + minStep,
        minStep,
        "start",
        ctx,
      );
      ctx.log.debug("Refined start boundary", {
        from: prevEmpty.min,
        to: refinedStart,
      });
    }

    // Binary search to find exact end boundary
    if (nextEmpty) {
      refinedEnd = await binarySearchBoundary(
        adapter,
        baseQuery,
        region.end - minStep,
        nextEmpty.max,
        minStep,
        "end",
        ctx,
      );
      ctx.log.debug("Refined end boundary", {
        from: nextEmpty.max,
        to: refinedEnd,
      });
    }

    refined.push({ start: refinedStart, end: refinedEnd });
  }

  return refined;
}

/**
 * Binary search to find the exact boundary between empty and non-empty regions
 */
async function binarySearchBoundary(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  low: number,
  high: number,
  minStep: number,
  boundaryType: "start" | "end",
  ctx: ScanContext,
): Promise<number> {
  // Stop when the range is smaller than minStep
  while (high - low > minStep) {
    const mid = (low + high) / 2;

    ctx.apiCalls++;
    const query: NivodaQuery = {
      ...baseQuery,
      dollar_value: { from: Math.floor(low), to: Math.floor(mid) - 1 },
    };

    const count = await withRetry(() => adapter.getDiamondsCount(query), {
      onRetry: (error, attempt) => {
        ctx.log.warn("Retrying binary search", {
          attempt,
          error: error.message,
        });
      },
    });

    if (boundaryType === "start") {
      // Looking for first non-empty range
      if (count > 0) {
        high = mid;
      } else {
        low = mid;
      }
    } else {
      // Looking for last non-empty range
      if (count > 0) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }

  return boundaryType === "start" ? low : high;
}

/**
 * Fine scan a specific region with adaptive stepping
 */
async function fineScanRegion(
  adapter: NivodaAdapter,
  baseQuery: NivodaQuery,
  config: {
    start: number;
    end: number;
    denseZoneThreshold: number;
    denseZoneStep: number;
    targetRecordsPerChunk: number;
    concurrency: number;
  },
  ctx: ScanContext,
): Promise<DensityChunk[]> {
  const chunks: DensityChunk[] = [];
  let currentPrice = config.start;
  let step = config.denseZoneStep;

  while (currentPrice < config.end) {
    const batch: ScanRange[] = [];
    let batchPrice = currentPrice;

    for (let i = 0; i < config.concurrency && batchPrice < config.end; i++) {
      // Use dense zone step below threshold, adaptive above
      if (batchPrice < config.denseZoneThreshold) {
        step = config.denseZoneStep;
      }

      const rangeMax = Math.min(batchPrice + step, config.end);
      batch.push({ min: batchPrice, max: rangeMax, step });
      batchPrice = rangeMax;
    }

    const results = await Promise.all(
      batch.map(async (range) => {
        ctx.apiCalls++;
        const query: NivodaQuery = {
          ...baseQuery,
          dollar_value: { from: range.min, to: range.max - 1 },
        };
        const count = await withRetry(() => adapter.getDiamondsCount(query), {
          onRetry: (error, attempt) => {
            ctx.log.warn("Retrying fine scan", {
              attempt,
              priceRange: { min: range.min, max: range.max },
              error: error.message,
            });
          },
        });
        return { ...range, count };
      }),
    );

    for (const result of results) {
      ctx.rangesScanned++;
      if (result.count > 0) {
        chunks.push({ min: result.min, max: result.max, count: result.count });
        ctx.log.debug("Fine scan chunk found", {
          priceRange: { min: result.min, max: result.max },
          count: result.count,
        });
      }

      // Adaptive step for above threshold
      if (result.min >= config.denseZoneThreshold) {
        if (result.count === 0) {
          step = Math.min(step * 2, 10000);
        } else {
          const ratio = config.targetRecordsPerChunk / result.count;
          const newStep = Math.floor(step * ratio);
          step = Math.max(config.denseZoneStep, Math.min(newStep, 10000));
        }
      }
    }

    currentPrice = batchPrice;
  }

  return chunks;
}

/**
 * Calculates the number of workers based on total records and constraints.
 * Exported for testing.
 */
export function calculateWorkerCount(
  totalRecords: number,
  maxWorkers: number,
  minRecordsPerWorker: number,
): number {
  if (totalRecords === 0) {
    return 0;
  }

  // Calculate workers needed based on minimum records per worker
  const workersNeeded = Math.ceil(totalRecords / minRecordsPerWorker);

  // Cap at maxWorkers, but ensure at least 1
  return Math.max(1, Math.min(workersNeeded, maxWorkers));
}

/**
 * Partitions density map into balanced worker buckets.
 * Each partition covers a contiguous price range with roughly equal record counts.
 * If maxTotalRecords is set (> 0), partitions will be truncated to stay within the limit.
 * Exported for testing.
 */
export function createPartitions(
  densityMap: DensityChunk[],
  desiredWorkerCount: number,
  logger: Logger = nullLogger,
  maxTotalRecords: number = 0,
): WorkerPartition[] {
  if (densityMap.length === 0 || desiredWorkerCount === 0) {
    return [];
  }

  const totalRecords = densityMap.reduce((sum, chunk) => sum + chunk.count, 0);

  // Apply maxTotalRecords cap if set
  const effectiveTotal =
    maxTotalRecords > 0
      ? Math.min(totalRecords, maxTotalRecords)
      : totalRecords;

  if (maxTotalRecords > 0 && totalRecords > maxTotalRecords) {
    logger.info("Applying maxTotalRecords cap", {
      originalTotal: totalRecords,
      cappedTotal: effectiveTotal,
      maxTotalRecords,
    });
  }

  const targetPerWorker = Math.ceil(effectiveTotal / desiredWorkerCount);

  logger.debug("Creating partitions", { targetPerWorker, effectiveTotal });

  // Flatten large chunks that would prevent achieving desired worker count
  // This allows the greedy algorithm to create partitions at finer boundaries
  const flattenedChunks: DensityChunk[] = [];
  for (const chunk of densityMap) {
    // Split chunks that are > 1.5x the target to allow better distribution
    if (chunk.count > targetPerWorker * 1.5) {
      const numSubChunks = Math.ceil(chunk.count / targetPerWorker);
      const priceStep = (chunk.max - chunk.min) / numSubChunks;
      const countPerSubChunk = Math.floor(chunk.count / numSubChunks);

      for (let j = 0; j < numSubChunks; j++) {
        const isLast = j === numSubChunks - 1;
        flattenedChunks.push({
          min: Math.floor(chunk.min + priceStep * j),
          max: isLast ? chunk.max : Math.floor(chunk.min + priceStep * (j + 1)),
          count: isLast ? chunk.count - countPerSubChunk * j : countPerSubChunk,
        });
      }

      logger.debug("Split large chunk for balancing", {
        originalPriceRange: { min: chunk.min, max: chunk.max },
        originalCount: chunk.count,
        subChunks: numSubChunks,
        targetPerWorker,
      });
    } else {
      flattenedChunks.push(chunk);
    }
  }

  // Log if we split any chunks
  if (flattenedChunks.length !== densityMap.length) {
    logger.info("Chunks flattened for better partition balance", {
      originalChunks: densityMap.length,
      flattenedChunks: flattenedChunks.length,
    });
  }

  const partitions: WorkerPartition[] = [];
  let currentWorkerId = 0;
  let currentBatchSum = 0;
  let currentBatchStart = flattenedChunks[0].min;
  let cumulativeRecords = 0;

  for (let i = 0; i < flattenedChunks.length; i++) {
    const chunk = flattenedChunks[i];

    // Check if adding this chunk would exceed the cap
    if (
      maxTotalRecords > 0 &&
      cumulativeRecords + chunk.count > maxTotalRecords
    ) {
      // Calculate how many records we can still take from this chunk
      const remainingAllowance = maxTotalRecords - cumulativeRecords;

      if (remainingAllowance > 0) {
        // Add a partial partition with the remaining allowance
        currentBatchSum += remainingAllowance;
        cumulativeRecords += remainingAllowance;

        partitions.push({
          partitionId: `partition-${currentWorkerId}`,
          minPrice: currentBatchStart,
          maxPrice: chunk.max - 1,
          totalRecords: currentBatchSum,
        });

        logger.debug("Final capped partition created", {
          partitionId: `partition-${currentWorkerId}`,
          priceRange: { min: currentBatchStart, max: chunk.max },
          records: currentBatchSum,
          capped: true,
        });
      }

      // Stop processing - we've hit the cap
      logger.info("Partitioning stopped at record cap", {
        totalPartitions: partitions.length,
        totalRecords: cumulativeRecords,
        maxTotalRecords,
      });
      break;
    }

    currentBatchSum += chunk.count;
    cumulativeRecords += chunk.count;

    // Create partition when we hit target or reach the end
    const isLastChunk = i === flattenedChunks.length - 1;
    const hitTarget = currentBatchSum >= targetPerWorker;
    const hasRemainingWorkers = currentWorkerId < desiredWorkerCount - 1;

    // Only create partition early if we have remaining workers to allocate
    if ((hitTarget && hasRemainingWorkers) || isLastChunk) {
      partitions.push({
        partitionId: `partition-${currentWorkerId}`,
        minPrice: currentBatchStart,
        maxPrice: chunk.max - 1,
        totalRecords: currentBatchSum,
      });

      logger.debug("Partition created", {
        partitionId: `partition-${currentWorkerId}`,
        priceRange: { min: currentBatchStart, max: chunk.max },
        records: currentBatchSum,
      });

      // Reset for next worker
      currentWorkerId++;
      currentBatchSum = 0;

      // Next worker starts at the next chunk's min
      if (i + 1 < flattenedChunks.length) {
        currentBatchStart = flattenedChunks[i + 1].min;
      }
    }
  }

  return partitions;
}
