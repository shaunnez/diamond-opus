import {
  HEATMAP_MIN_PRICE,
  HEATMAP_MAX_PRICE,
  HEATMAP_DENSE_ZONE_THRESHOLD,
  HEATMAP_DENSE_ZONE_STEP,
  HEATMAP_INITIAL_STEP,
  HEATMAP_TARGET_RECORDS_PER_CHUNK,
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
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
}

export interface HeatmapResult {
  densityMap: DensityChunk[];
  partitions: WorkerPartition[];
  totalRecords: number;
  workerCount: number;
}

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

  console.log('Starting heatmap scan...');
  console.log(`Price range: $${minPrice} - $${maxPrice}`);
  console.log(`Dense zone threshold: $${denseZoneThreshold} (step: $${denseZoneStep})`);

  // Phase 1: Heatmap Scan
  const densityMap = await buildDensityMap(adapter, baseQuery, {
    minPrice,
    maxPrice,
    denseZoneThreshold,
    denseZoneStep,
    initialStep,
    targetRecordsPerChunk,
  });

  if (densityMap.length === 0) {
    console.log('No records found in heatmap scan');
    return {
      densityMap: [],
      partitions: [],
      totalRecords: 0,
      workerCount: 0,
    };
  }

  // Phase 2: Calculate fair split
  const totalRecords = densityMap.reduce((sum, chunk) => sum + chunk.count, 0);
  console.log(`\nHeatmap scan complete. Total records: ${totalRecords}`);

  // Calculate actual worker count based on data volume
  const workerCount = calculateWorkerCount(totalRecords, maxWorkers, minRecordsPerWorker);
  console.log(`Worker count: ${workerCount} (max: ${maxWorkers})`);

  // Phase 3: Partition into balanced worker buckets
  const partitions = createPartitions(densityMap, workerCount);

  return {
    densityMap,
    partitions,
    totalRecords,
    workerCount,
  };
}

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
  }
): Promise<DensityChunk[]> {
  const densityMap: DensityChunk[] = [];
  let currentPrice = config.minPrice;
  let step = config.initialStep;

  while (currentPrice < config.maxPrice) {
    // In dense zone (below threshold), use fixed small steps
    if (currentPrice < config.denseZoneThreshold) {
      step = config.denseZoneStep;
    }

    // Ensure we don't overshoot the max
    let rangeMax = Math.min(currentPrice + step, config.maxPrice);
    if (rangeMax <= currentPrice) {
      rangeMax = currentPrice + 1;
    }

    // Execute count query for this price range
    const queryWithPrice: NivodaQuery = {
      ...baseQuery,
      dollar_value: { from: currentPrice, to: rangeMax },
    };

    const count = await adapter.getDiamondsCount(queryWithPrice);

    process.stdout.write(
      `\rScanning: $${currentPrice} - $${rangeMax} (step: ${step}) | Found: ${count}      `
    );

    if (count > 0) {
      densityMap.push({ min: currentPrice, max: rangeMax, count });
    }

    // Adaptive step adjustment (only above dense zone threshold)
    if (currentPrice >= config.denseZoneThreshold) {
      if (count === 0) {
        // Zoom through empty space
        step = Math.min(step * 5, 100000);
      } else {
        // Adjust step to target records per chunk
        const ratio = config.targetRecordsPerChunk / count;
        const newStep = Math.floor(step * ratio);
        step = Math.max(config.denseZoneStep, Math.min(newStep, 50000));
      }
    }

    currentPrice = rangeMax + 1;
  }

  // Clear the progress line
  process.stdout.write('\n');

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

function createPartitions(
  densityMap: DensityChunk[],
  workerCount: number
): WorkerPartition[] {
  if (densityMap.length === 0 || workerCount === 0) {
    return [];
  }

  const totalRecords = densityMap.reduce((sum, chunk) => sum + chunk.count, 0);
  const targetPerWorker = Math.ceil(totalRecords / workerCount);

  console.log(`Target per worker: ~${targetPerWorker} records`);

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

    if (hitTarget || isLastChunk) {
      partitions.push({
        partitionId: `partition-${currentWorkerId}`,
        minPrice: currentBatchStart,
        maxPrice: chunk.max,
        totalRecords: currentBatchSum,
      });

      console.log(
        `Partition ${currentWorkerId}: $${currentBatchStart} - $${chunk.max} (${currentBatchSum} records)`
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
