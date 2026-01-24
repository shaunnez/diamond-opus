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
}

export interface HeatmapResult {
  densityMap: DensityChunk[];
  partitions: WorkerPartition[];
  totalRecords: number;
  /** Actual worker count (always equals partitions.length) */
  workerCount: number;
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

  console.log('[heatmap] Starting scan...');
  console.log(`[heatmap] Price range: $${minPrice} - $${maxPrice}`);
  console.log(`[heatmap] Dense zone: < $${denseZoneThreshold} (step: $${denseZoneStep})`);
  console.log(`[heatmap] Concurrency: ${concurrency}`);

  // Phase 1: Heatmap Scan with concurrent queries
  const densityMap = await buildDensityMap(adapter, baseQuery, {
    minPrice,
    maxPrice,
    denseZoneThreshold,
    denseZoneStep,
    initialStep,
    targetRecordsPerChunk,
    concurrency,
  });

  if (densityMap.length === 0) {
    console.log('[heatmap] No records found');
    return {
      densityMap: [],
      partitions: [],
      totalRecords: 0,
      workerCount: 0,
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

  return {
    densityMap,
    partitions,
    totalRecords,
    workerCount,
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
  }
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

function calculateWorkerCount(
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
 */
function createPartitions(
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
