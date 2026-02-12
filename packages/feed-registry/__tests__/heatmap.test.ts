import { describe, it, expect } from 'vitest';
import {
  scanHeatmap,
  createPartitions,
  calculateWorkerCount,
  type DensityChunk,
} from '../src/heatmap.js';
import type { FeedAdapter, FeedQuery, FeedSearchOptions, FeedSearchResult, FeedBulkRawDiamond, MappedDiamond } from '../src/types.js';

/**
 * Tests for the heatmap scanner and partition creation logic.
 *
 * Verifies that:
 * 1. Partition boundaries have no gaps or overlaps (half-open → inclusive conversion)
 * 2. Sum of partition totalRecords equals heatmap totalRecords
 * 3. Worker count stays within bounds
 * 4. The queryWithPriceRange -1 conversion is consistent (integer dollar_per_carat)
 */

// --- Mock FeedAdapter ---

interface MockInventoryItem {
  stone_id: string;
  price: number;
}

/**
 * Creates a mock FeedAdapter that stores diamonds in-memory and
 * responds to count/search queries with correct price filtering.
 * Uses inclusive price boundaries (asking_price_usd >= min AND <= max),
 * matching the demo-feed-api behavior.
 */
function createMockAdapter(items: MockInventoryItem[]): FeedAdapter {
  return {
    feedId: 'test',
    rawTableName: 'raw_diamonds_test',
    watermarkBlobName: 'test.json',
    maxPageSize: 1000,
    workerPageSize: 100,
    heatmapConfig: {},

    async getCount(query: FeedQuery): Promise<number> {
      let filtered = items;
      if (query.priceRange) {
        filtered = filtered.filter(
          i => i.price >= query.priceRange!.from && i.price <= query.priceRange!.to
        );
      }
      return filtered.length;
    },

    buildBaseQuery(): FeedQuery {
      return {};
    },

    async search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult> {
      let filtered = [...items];
      if (query.priceRange) {
        filtered = filtered.filter(
          i => i.price >= query.priceRange!.from && i.price <= query.priceRange!.to
        );
      }
      filtered.sort((a, b) => a.price - b.price || a.stone_id.localeCompare(b.stone_id));
      const page = filtered.slice(options.offset, options.offset + options.limit);
      return { items: page as unknown as Record<string, unknown>[], totalCount: page.length };
    },

    extractIdentity(item: Record<string, unknown>): FeedBulkRawDiamond {
      return {
        supplierStoneId: item.stone_id as string,
        offerId: item.stone_id as string,
        payload: item,
      };
    },

    mapRawToDiamond(): MappedDiamond {
      throw new Error('Not used in heatmap tests');
    },

    async initialize(): Promise<void> {},
    async dispose(): Promise<void> {},
  };
}

/**
 * Generates N inventory items with prices uniformly distributed across [priceMin, priceMax].
 */
function generateItems(count: number, priceMin: number, priceMax: number): MockInventoryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    stone_id: `ITEM-${String(i + 1).padStart(7, '0')}`,
    price: Math.round(priceMin + (priceMax - priceMin) * (i / Math.max(count - 1, 1))),
  }));
}

// --- Tests ---

describe('calculateWorkerCount', () => {
  it('should return 0 for 0 records', () => {
    expect(calculateWorkerCount(0, 100, 500)).toBe(0);
  });

  it('should return 1 for records below minRecordsPerWorker', () => {
    expect(calculateWorkerCount(100, 100, 500)).toBe(1);
  });

  it('should cap at maxWorkers', () => {
    expect(calculateWorkerCount(1_000_000, 10, 500)).toBe(10);
  });

  it('should compute ceiling division correctly', () => {
    // 2500 / 500 = 5 workers
    expect(calculateWorkerCount(2500, 100, 500)).toBe(5);
    // 2501 / 500 = 6 workers (ceiling)
    expect(calculateWorkerCount(2501, 100, 500)).toBe(6);
  });
});

describe('createPartitions', () => {
  it('should return empty for empty density map', () => {
    expect(createPartitions([], 5)).toEqual([]);
  });

  it('should return empty for 0 desired workers', () => {
    const chunks: DensityChunk[] = [{ min: 0, max: 100, count: 50 }];
    expect(createPartitions(chunks, 0)).toEqual([]);
  });

  it('should create a single partition for single chunk', () => {
    const chunks: DensityChunk[] = [{ min: 0, max: 500, count: 100 }];
    const partitions = createPartitions(chunks, 1);

    expect(partitions).toHaveLength(1);
    expect(partitions[0].partitionId).toBe('partition-0');
    expect(partitions[0].minPrice).toBe(0);
    expect(partitions[0].maxPrice).toBe(499); // chunk.max - 1
    expect(partitions[0].totalRecords).toBe(100);
  });

  it('partition totalRecords should sum to density map total', () => {
    const chunks: DensityChunk[] = [
      { min: 0, max: 100, count: 300 },
      { min: 100, max: 200, count: 500 },
      { min: 200, max: 500, count: 200 },
      { min: 500, max: 1000, count: 400 },
      { min: 1000, max: 5000, count: 100 },
    ];
    const totalExpected = chunks.reduce((s, c) => s + c.count, 0);
    const partitions = createPartitions(chunks, 5);

    const totalPartitioned = partitions.reduce((s, p) => s + p.totalRecords, 0);
    expect(totalPartitioned).toBe(totalExpected);
  });

  it('partition boundaries should have no gaps when using inclusive maxPrice', () => {
    // Simulates the full heatmap → partition → worker flow.
    // Half-open chunks: [0,100), [100,200), [200,500)
    // Partitions convert to inclusive: maxPrice = chunk.max - 1
    // So partition 0 covers [0, 99], partition 1 covers [100, 199], etc.
    const chunks: DensityChunk[] = [
      { min: 0, max: 100, count: 50 },
      { min: 100, max: 200, count: 50 },
      { min: 200, max: 500, count: 50 },
    ];
    const partitions = createPartitions(chunks, 3);

    expect(partitions).toHaveLength(3);

    // Verify no gaps: partition[N+1].minPrice should be partition[N].maxPrice + 1
    for (let i = 0; i < partitions.length - 1; i++) {
      const gap = partitions[i + 1].minPrice - partitions[i].maxPrice;
      // gap should be 1 (dollar_per_carat is an integer range)
      expect(gap).toBe(1);
    }
  });

  it('partition maxPrice should always be chunk.max - 1', () => {
    const chunks: DensityChunk[] = [
      { min: 0, max: 1000, count: 500 },
      { min: 1000, max: 5000, count: 500 },
    ];
    const partitions = createPartitions(chunks, 2);

    expect(partitions[0].maxPrice).toBe(999);
    expect(partitions[1].maxPrice).toBe(4999);
  });

  it('should handle maxTotalRecords cap', () => {
    const chunks: DensityChunk[] = [
      { min: 0, max: 100, count: 600 },
      { min: 100, max: 200, count: 600 },
    ];
    const partitions = createPartitions(chunks, 2, undefined, 1000);

    const totalPartitioned = partitions.reduce((s, p) => s + p.totalRecords, 0);
    expect(totalPartitioned).toBeLessThanOrEqual(1000);
  });
});

describe('scanHeatmap', () => {
  it('should scan and partition correctly for uniform price distribution', async () => {
    const items = generateItems(1000, 100, 5000);
    const adapter = createMockAdapter(items);

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 6000,
      denseZoneThreshold: 2000,
      denseZoneStep: 50,
      initialStep: 200,
      maxWorkers: 10,
      minRecordsPerWorker: 50,
    });

    // All 1000 items should be accounted for
    expect(result.totalRecords).toBe(1000);
    expect(result.workerCount).toBe(result.partitions.length);
    expect(result.partitions.length).toBeGreaterThan(0);
    expect(result.partitions.length).toBeLessThanOrEqual(10);

    // Sum of partition totals should match heatmap total
    const partitionSum = result.partitions.reduce((s, p) => s + p.totalRecords, 0);
    expect(partitionSum).toBe(result.totalRecords);
  });

  it('should return 0 records for empty dataset', async () => {
    const adapter = createMockAdapter([]);
    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 10000,
    });

    expect(result.totalRecords).toBe(0);
    expect(result.partitions).toHaveLength(0);
    expect(result.workerCount).toBe(0);
  });

  it('partition price ranges should cover all diamonds without overlap', async () => {
    const items = generateItems(500, 100, 3000);
    const adapter = createMockAdapter(items);

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 4000,
      denseZoneThreshold: 1000,
      denseZoneStep: 50,
      initialStep: 200,
      maxWorkers: 20,
      minRecordsPerWorker: 20,
    });

    // No two partitions should have overlapping price ranges
    const sorted = [...result.partitions].sort((a, b) => a.minPrice - b.minPrice);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].maxPrice).toBeLessThan(sorted[i + 1].minPrice);
    }

    // Every diamond should fall within exactly one partition
    for (const item of items) {
      const matchingPartitions = result.partitions.filter(
        p => item.price >= p.minPrice && item.price <= p.maxPrice
      );
      expect(matchingPartitions.length).toBe(1);
    }
  });

  it('every diamond should be fetchable by exactly one partition price range', async () => {
    // This test verifies the critical invariant: no diamond is missed or double-counted
    // by the partition boundaries. This was the root cause of the demo feed mismatches.
    const items = generateItems(200, 50, 2000);
    const adapter = createMockAdapter(items);

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 3000,
      denseZoneThreshold: 500,
      denseZoneStep: 25,
      initialStep: 100,
      maxWorkers: 20,
      minRecordsPerWorker: 10,
    });

    // For each partition, count how many items from our set fall in its range
    let totalCoveredByPartitions = 0;
    const coveredStoneIds = new Set<string>();

    for (const partition of result.partitions) {
      const inRange = items.filter(
        i => i.price >= partition.minPrice && i.price <= partition.maxPrice
      );
      totalCoveredByPartitions += inRange.length;
      for (const item of inRange) {
        // Each stone_id should only appear in one partition (no overlaps)
        expect(coveredStoneIds.has(item.stone_id)).toBe(false);
        coveredStoneIds.add(item.stone_id);
      }
    }

    // All items should be covered
    expect(coveredStoneIds.size).toBe(200);
    expect(totalCoveredByPartitions).toBe(200);
  });
});
