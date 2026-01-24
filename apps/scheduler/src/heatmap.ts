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
} from '@diamond/shared';
import { NivodaAdapter, type NivodaQuery } from '@diamond/nivoda';

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
  config: HeatmapConfig = {}
): Promise<HeatmapResult> {
  const minPrice = config.minPrice ?? HEATMAP_MIN_PRICE;
  const maxPrice = config.maxPrice ?? HEATMAP_MAX_PRICE;
  const denseZoneThreshold = config.denseZoneThreshold ?? HEATMAP_DENSE_ZONE_THRESHOLD;
  const denseZoneStep = config.denseZoneStep ?? HEATMAP_DENSE_ZONE_STEP;
  const initialStep = config.initialStep ?? HEATMAP_INITIAL_STEP;
  const targetRecordsPerChunk = config.targetRecordsPerChunk ?? HEATMAP_TARGET_RECORDS_PER_CHUNK;
  const maxWorkers = config.maxWorkers ?? HEATMAP_MAX_WORKERS;
  const minRecordsPerWorker = config.minRecordsPerWorker ?? HEATMAP_MIN_RECORDS_PER_WORKER;
  const concurrency = config.concurrency ?? 3;
  const useTwoPassScan = config.useTwoPassScan ?? false;
  const coarseStep = config.coarseStep ?? 5000;

  const startTime = Date.now();

  console.log('[heatmap] Starting scan...');
  console.log(`[heatmap] Price range: $${minPrice} - $${maxPrice}`);
  console.log(`[heatmap] Dense zone: < $${denseZoneThreshold} (step: $${denseZoneStep})`);
  console.log(`[heatmap] Concurrency: ${concurrency}`);
  if (useTwoPassScan) {
    console.log(`[heatmap] Two-pass mode enabled (coarse step: $${coarseStep})`);
  }

  // Track scan statistics
  const scanContext: ScanContext = {
    apiCalls: 0,
    rangesScanned: 0,
  };

  // Phase 1: Heatmap Scan
  let densityMap: DensityChunk[];

  if (useTwoPassScan) {
    densityMap = await buildDensityMapTwoPass(adapter, baseQuery, {
      minPrice,
      maxPrice,
      denseZoneThreshold,
      denseZoneStep,
      coarseStep,
      targetRecordsPerChunk,
      concurrency,
    }, scanContext);
  } else {
    densityMap = await buildDensityMap(adapter, baseQuery, {
      minPrice,
      maxPrice,
      denseZoneThreshold,
      denseZoneStep,
      initialStep,
      targetRecordsPerChunk,
      concurrency,
    }, scanContext);
  }

  const scanDurationMs = Date.now() - startTime;

  if (densityMap.length === 0) {
    console.log('[heatmap] No records found');
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
  console.log(`[heatmap] Scan complete. Total records: ${totalRecords}`);

  // Calculate desired worker count based on data volume
  const desiredWorkerCount = calculateWorkerCount(totalRecords, maxWorkers, minRecordsPerWorker);
  console.log(`[heatmap] Desired workers: ${desiredWorkerCount} (max: ${maxWorkers})`);

  // Phase 3: Partition into balanced worker buckets
  const partitions = createPartitions(densityMap, desiredWorkerCount);

  // workerCount is always the actual partition count (authoritative)
  const workerCount = partitions.length;
  if (workerCount !== desiredWorkerCount) {
    console.log(`[heatmap] Note: Created ${workerCount} partitions (desired: ${desiredWorkerCount})`);
  }

  // Build final stats
  const stats: ScanStats = {
    apiCalls: scanContext.apiCalls,
    scanDurationMs,
    rangesScanned: scanContext.rangesScanned,
    nonEmptyRanges: densityMap.length,
    usedTwoPass: useTwoPassScan,
  };

  console.log(`[heatmap] Stats: ${stats.apiCalls} API calls, ${stats.rangesScanned} ranges in ${stats.scanDurationMs}ms`);

  return {
    densityMap,
    partitions,
    totalRecords,
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
  ctx: ScanContext
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

    for (let i = 0; i < config.concurrency && batchPrice < config.maxPrice; i++) {
      // In dense zone (below threshold), use fixed small steps
      if (batchPrice < config.denseZoneThreshold) {
        step = config.denseZoneStep;
      }

      // Calculate range end (exclusive upper bound)
      // Use 0.01 precision to support decimal prices
      let rangeMax = Math.min(batchPrice + step, config.maxPrice);
      if (rangeMax <= batchPrice) {
        rangeMax = batchPrice + 0.01;
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
          // Nivoda API: from is inclusive, to is inclusive
          // We use max - 0.01 to simulate exclusive upper bound
          dollar_value: { from: range.min, to: range.max - 0.01 },
        };

        const count = await withRetry(
          () => adapter.getDiamondsCount(queryWithPrice),
          {
            onRetry: (error, attempt) => {
              console.log(`[heatmap] Retry ${attempt} for range $${range.min}-$${range.max}: ${error.message}`);
            },
          }
        );

        return { ...range, count };
      })
    );

    // Process results and update adaptive stepping
    for (const result of results) {
      scannedRanges++;
      ctx.rangesScanned++;
      console.log(
        `[heatmap] Range ${scannedRanges}: $${result.min.toFixed(2)} - $${result.max.toFixed(2)} | Count: ${result.count}`
      );

      if (result.count > 0) {
        densityMap.push({ min: result.min, max: result.max, count: result.count });
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

  console.log(`[heatmap] Scanned ${scannedRanges} ranges, found ${densityMap.length} non-empty chunks`);

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
  ctx: ScanContext
): Promise<DensityChunk[]> {
  console.log('[heatmap] Phase 1: Coarse scan to identify dense regions...');

  // Phase 1: Coarse scan to find which regions have data
  const coarseResults = await coarseScan(adapter, baseQuery, {
    minPrice: config.minPrice,
    maxPrice: config.maxPrice,
    step: config.coarseStep,
    concurrency: config.concurrency,
  }, ctx);

  if (coarseResults.length === 0) {
    console.log('[heatmap] No data found in coarse scan');
    return [];
  }

  // Identify dense regions (contiguous ranges with data)
  const denseRegions = identifyDenseRegions(coarseResults, config.minPrice, config.maxPrice);
  console.log(`[heatmap] Found ${denseRegions.length} dense region(s)`);

  // Phase 2: Refine boundaries with binary search
  console.log('[heatmap] Phase 2: Refining region boundaries...');
  const refinedRegions = await refineBoundaries(
    adapter,
    baseQuery,
    denseRegions,
    coarseResults,
    config.denseZoneStep,
    ctx
  );

  // Phase 3: Fine scan within each refined region
  console.log('[heatmap] Phase 3: Fine scanning dense regions...');
  const densityMap: DensityChunk[] = [];

  for (const region of refinedRegions) {
    const regionChunks = await fineScanRegion(adapter, baseQuery, {
      start: region.start,
      end: region.end,
      denseZoneThreshold: config.denseZoneThreshold,
      denseZoneStep: config.denseZoneStep,
      targetRecordsPerChunk: config.targetRecordsPerChunk,
      concurrency: config.concurrency,
    }, ctx);
    densityMap.push(...regionChunks);
  }

  console.log(`[heatmap] Two-pass scan complete. Found ${densityMap.length} chunks`);
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
  ctx: ScanContext
): Promise<CoarseResult[]> {
  const results: CoarseResult[] = [];
  let currentPrice = config.minPrice;
  let rangeCount = 0;

  while (currentPrice < config.maxPrice) {
    const batch: Array<{ min: number; max: number }> = [];
    let batchPrice = currentPrice;

    for (let i = 0; i < config.concurrency && batchPrice < config.maxPrice; i++) {
      const rangeMax = Math.min(batchPrice + config.step, config.maxPrice);
      batch.push({ min: batchPrice, max: rangeMax });
      batchPrice = rangeMax;
    }

    const batchResults = await Promise.all(
      batch.map(async (range) => {
        ctx.apiCalls++;
        const query: NivodaQuery = {
          ...baseQuery,
          dollar_value: { from: range.min, to: range.max - 0.01 },
        };
        const count = await withRetry(() => adapter.getDiamondsCount(query), {
          onRetry: (error, attempt) => {
            console.log(`[heatmap] Retry ${attempt} for coarse range $${range.min}-$${range.max}: ${error.message}`);
          },
        });
        return { ...range, count };
      })
    );

    for (const result of batchResults) {
      rangeCount++;
      ctx.rangesScanned++;
      const hasData = result.count > 0 ? 'yes' : 'no';
      console.log(
        `[heatmap] Coarse ${rangeCount}: $${result.min.toFixed(0)} - $${result.max.toFixed(0)} | Data: ${hasData} (${result.count})`
      );
      results.push(result);
    }

    currentPrice = batchPrice;
  }

  return results;
}

/**
 * Identify contiguous dense regions from coarse scan results
 */
function identifyDenseRegions(
  coarseResults: CoarseResult[],
  minPrice: number,
  maxPrice: number
): DenseRegion[] {
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
  ctx: ScanContext
): Promise<DenseRegion[]> {
  const refined: DenseRegion[] = [];

  for (const region of regions) {
    // Find the coarse result just before this region (if any) for start refinement
    const prevEmpty = coarseResults.find(
      (r) => r.max === region.start && r.count === 0
    );

    // Find the coarse result just after this region (if any) for end refinement
    const nextEmpty = coarseResults.find(
      (r) => r.min === region.end && r.count === 0
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
        'start',
        ctx
      );
      console.log(`[heatmap] Refined start boundary: $${prevEmpty.min} -> $${refinedStart.toFixed(2)}`);
    }

    // Binary search to find exact end boundary
    if (nextEmpty) {
      refinedEnd = await binarySearchBoundary(
        adapter,
        baseQuery,
        region.end - minStep,
        nextEmpty.max,
        minStep,
        'end',
        ctx
      );
      console.log(`[heatmap] Refined end boundary: $${nextEmpty.max} -> $${refinedEnd.toFixed(2)}`);
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
  boundaryType: 'start' | 'end',
  ctx: ScanContext
): Promise<number> {
  // Stop when the range is smaller than minStep
  while (high - low > minStep) {
    const mid = (low + high) / 2;

    ctx.apiCalls++;
    const query: NivodaQuery = {
      ...baseQuery,
      dollar_value: { from: low, to: mid - 0.01 },
    };

    const count = await withRetry(() => adapter.getDiamondsCount(query), {
      onRetry: (error, attempt) => {
        console.log(`[heatmap] Retry ${attempt} for binary search: ${error.message}`);
      },
    });

    if (boundaryType === 'start') {
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

  return boundaryType === 'start' ? low : high;
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
  ctx: ScanContext
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
          dollar_value: { from: range.min, to: range.max - 0.01 },
        };
        const count = await withRetry(() => adapter.getDiamondsCount(query), {
          onRetry: (error, attempt) => {
            console.log(`[heatmap] Retry ${attempt} for fine scan $${range.min}-$${range.max}: ${error.message}`);
          },
        });
        return { ...range, count };
      })
    );

    for (const result of results) {
      ctx.rangesScanned++;
      if (result.count > 0) {
        chunks.push({ min: result.min, max: result.max, count: result.count });
        console.log(
          `[heatmap] Fine: $${result.min.toFixed(2)} - $${result.max.toFixed(2)} | Count: ${result.count}`
        );
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
  minRecordsPerWorker: number
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
 * Exported for testing.
 */
export function createPartitions(
  densityMap: DensityChunk[],
  desiredWorkerCount: number
): WorkerPartition[] {
  if (densityMap.length === 0 || desiredWorkerCount === 0) {
    return [];
  }

  const totalRecords = densityMap.reduce((sum, chunk) => sum + chunk.count, 0);
  const targetPerWorker = Math.ceil(totalRecords / desiredWorkerCount);

  console.log(`[heatmap] Target per worker: ~${targetPerWorker} records`);

  const partitions: WorkerPartition[] = [];
  let currentWorkerId = 0;
  let currentBatchSum = 0;
  let currentBatchStart = densityMap[0].min;

  for (let i = 0; i < densityMap.length; i++) {
    const chunk = densityMap[i];
    currentBatchSum += chunk.count;

    // Create partition when we hit target or reach the end
    const isLastChunk = i === densityMap.length - 1;
    const hitTarget = currentBatchSum >= targetPerWorker;
    const hasRemainingWorkers = currentWorkerId < desiredWorkerCount - 1;

    // Only create partition early if we have remaining workers to allocate
    if ((hitTarget && hasRemainingWorkers) || isLastChunk) {
      partitions.push({
        partitionId: `partition-${currentWorkerId}`,
        minPrice: currentBatchStart,
        maxPrice: chunk.max,
        totalRecords: currentBatchSum,
      });

      console.log(
        `[heatmap] Partition ${currentWorkerId}: $${currentBatchStart.toFixed(2)} - $${chunk.max.toFixed(2)} (${currentBatchSum} records)`
      );

      // Reset for next worker
      currentWorkerId++;
      currentBatchSum = 0;

      // Next worker starts at the next chunk's min
      if (i + 1 < densityMap.length) {
        currentBatchStart = densityMap[i + 1].min;
      }
    }
  }

  return partitions;
}
