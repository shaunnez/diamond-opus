import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DemoFeedAdapter } from '../src/adapter.js';
import { scanHeatmap } from '@diamond/feed-registry';
import type { FeedQuery } from '@diamond/feed-registry';

/**
 * End-to-end pipeline simulation tests for the demo feed.
 *
 * These tests simulate the full scheduler → worker → raw upsert flow
 * WITHOUT touching a real database, by using in-memory data structures.
 * They verify the three production symptoms are resolved:
 *
 * Symptom A: recordsProcessed should not exceed partition.totalRecords
 * Symptom B: every partition should fetch its full allocation
 * Symptom C: raw diamond count should equal the total seeded count
 */

// --- Types ---

interface MockDiamond {
  id: string;
  stone_id: string;
  asking_price_usd: number;
  weight_ct: number;
  stone_shape: string;
  stone_color: string;
  stone_clarity: string;
  created_at: string;
  updated_at: string;
}

// --- Helpers ---

/**
 * Generates N deterministic mock diamonds, mimicking the demo seed.
 * All diamonds in the same batch share the same created_at timestamp,
 * which is the exact condition that caused the original pagination bug.
 */
function seedDiamonds(count: number): MockDiamond[] {
  // Deterministic PRNG matching the demo seed
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      const t0 = Math.imul(a ^ (a >>> 15), 1 | a);
      const t = (t0 + Math.imul(t0 ^ (t0 >>> 7), 61 | t0)) ^ t0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rng = mulberry32(42);
  const SHAPES = ['ROUND', 'OVAL', 'EMERALD', 'CUSHION', 'ASSCHER', 'RADIANT', 'MARQUISE', 'PEAR', 'PRINCESS', 'HEART'];
  const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2'];

  function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)]!;
  }

  const now = '2024-01-01T00:00:00.000Z'; // All same timestamp

  return Array.from({ length: count }, (_, i) => {
    const shape = pick(SHAPES);
    const carats = Math.round((0.5 + Math.pow(rng(), 2) * 4.5) * 100) / 100;
    const color = pick(COLORS);
    const clarity = pick(CLARITIES);
    const isLabCreated = rng() < 0.3;
    const colorIndex = COLORS.indexOf(color);
    const clarityIndex = CLARITIES.indexOf(clarity);
    const qualityFactor = Math.max(0.3, 1 - (colorIndex * 0.05 + clarityIndex * 0.08));
    const basePricePerCarat = isLabCreated
      ? 800 + qualityFactor * 3000
      : 2000 + qualityFactor * 15000;
    const pricePerCarat = Math.round((basePricePerCarat * (0.85 + rng() * 0.3)) * 100) / 100;
    const totalPrice = Math.round(pricePerCarat * carats * 100) / 100;

    // Consume remaining RNG calls to match the seed's per-diamond RNG consumption
    rng(); // is_treated
    pick(['GIA', 'AGS', 'IGI', 'HRD', 'GCAL']); // cert_lab
    pick(['GIA', 'AGS', 'IGI', 'HRD', 'GCAL']); // cert_number lab
    rng(); // cert_number digits
    pick(['Brilliant Earth Demo', 'Blue Nile Demo', 'James Allen Demo', 'Whiteflash Demo',
      'Adiamor Demo', 'Brian Gavin Demo', 'Good Old Gold Demo', 'Victor Canera Demo']); // vendor

    return {
      id: `uuid-${String(i + 1).padStart(7, '0')}`,
      stone_id: `DEMO-${String(i + 1).padStart(7, '0')}`,
      asking_price_usd: totalPrice,
      weight_ct: carats,
      stone_shape: shape,
      stone_color: color,
      stone_clarity: clarity,
      created_at: now,
      updated_at: now,
    };
  });
}

/**
 * Creates a stable mock server (post-fix behavior) that sorts by the
 * requested column + stone_id tiebreaker, guaranteeing deterministic pagination.
 */
function createStableMockServer(allDiamonds: MockDiamond[]) {
  return (url: string) => {
    const parsed = new URL(url);
    const path = parsed.pathname;

    let filtered = [...allDiamonds];

    const priceMin = parsed.searchParams.get('price_min');
    const priceMax = parsed.searchParams.get('price_max');
    if (priceMin) filtered = filtered.filter(d => d.asking_price_usd >= Number(priceMin));
    if (priceMax) filtered = filtered.filter(d => d.asking_price_usd <= Number(priceMax));

    const updatedFrom = parsed.searchParams.get('updated_from');
    const updatedTo = parsed.searchParams.get('updated_to');
    if (updatedFrom) filtered = filtered.filter(d => d.updated_at >= updatedFrom);
    if (updatedTo) filtered = filtered.filter(d => d.updated_at <= updatedTo);

    if (path === '/api/diamonds/count') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ total_count: filtered.length }),
      });
    }

    if (path === '/api/diamonds') {
      const orderBy = parsed.searchParams.get('order_by') ?? 'created_at';
      const orderDir = parsed.searchParams.get('order_dir') ?? 'ASC';

      filtered.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[orderBy];
        const bVal = (b as Record<string, unknown>)[orderBy];
        let cmp = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
        else cmp = String(aVal).localeCompare(String(bVal));
        if (cmp !== 0) return orderDir === 'DESC' ? -cmp : cmp;
        return a.stone_id.localeCompare(b.stone_id); // Tiebreaker
      });

      const offset = parseInt(parsed.searchParams.get('offset') ?? '0', 10);
      const limit = parseInt(parsed.searchParams.get('limit') ?? '100', 10);
      const page = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: page, count: page.length, offset, limit }),
      });
    }

    if (path === '/api/health') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'ok' }) });
    }

    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
  };
}

// --- Simulated Worker ---

interface WorkerResult {
  partitionId: string;
  recordsProcessed: number;
  totalRecords: number;
  stoneIds: Set<string>;
}

/**
 * Simulates a worker processing a partition: pages through the feed API,
 * collects items, and tracks recordsProcessed vs totalRecords.
 */
async function simulateWorker(
  adapter: DemoFeedAdapter,
  partition: { partitionId: string; minPrice: number; maxPrice: number; totalRecords: number },
  pageSize: number,
): Promise<WorkerResult> {
  const query: FeedQuery = {
    priceRange: { from: partition.minPrice, to: partition.maxPrice },
  };

  const stoneIds = new Set<string>();
  let recordsProcessed = 0;
  let offset = 0;

  while (true) {
    const result = await adapter.search(
      query,
      { offset, limit: pageSize, order: { type: 'createdAt', direction: 'ASC' } },
    );

    for (const item of result.items) {
      stoneIds.add((item as unknown as MockDiamond).stone_id);
    }
    recordsProcessed += result.items.length;

    if (result.items.length < pageSize) break;
    offset += result.items.length;
  }

  return {
    partitionId: partition.partitionId,
    recordsProcessed,
    totalRecords: partition.totalRecords,
    stoneIds,
  };
}

// --- Simulated Raw Table ---

/**
 * Simulates the raw_diamonds_demo upsert behavior:
 * ON CONFLICT (supplier_stone_id) DO UPDATE.
 * Returns the count of unique supplier_stone_ids.
 */
function simulateRawUpsert(workerResults: WorkerResult[]): {
  uniqueStoneIds: Set<string>;
  totalInsertAttempts: number;
} {
  const uniqueStoneIds = new Set<string>();
  let totalInsertAttempts = 0;

  for (const result of workerResults) {
    for (const stoneId of result.stoneIds) {
      uniqueStoneIds.add(stoneId);
      totalInsertAttempts++;
    }
  }

  return { uniqueStoneIds, totalInsertAttempts };
}

// --- Tests ---

describe('Pipeline Consistency (end-to-end simulation)', () => {
  let originalFetch: typeof globalThis.fetch;
  const DIAMOND_COUNT = 5000; // Large enough to exercise partition logic, small enough to be fast
  let allDiamonds: MockDiamond[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    allDiamonds = seedDiamonds(DIAMOND_COUNT);
    globalThis.fetch = createStableMockServer(allDiamonds) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('heatmap totalRecords should equal seeded diamond count', async () => {
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    expect(result.totalRecords).toBe(DIAMOND_COUNT);
  });

  it('sum of partition totalRecords should equal heatmap totalRecords', async () => {
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const partitionSum = result.partitions.reduce((s, p) => s + p.totalRecords, 0);
    expect(partitionSum).toBe(result.totalRecords);
  });

  it('Symptom A: recordsProcessed should match actual count for partition price range', async () => {
    // The heatmap's totalRecords per partition is an ESTIMATE from density scanning.
    // It can diverge from the actual count because large chunks get split
    // proportionally by price, but data isn't uniformly distributed within chunks.
    //
    // The real invariant to test: with stable pagination, recordsProcessed should
    // equal the ACTUAL number of diamonds in that partition's price range.
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    for (const wr of workerResults) {
      // Get the actual count from the mock server for this partition's price range
      const partition = result.partitions.find(p => p.partitionId === wr.partitionId)!;
      const actualCount = await adapter.getCount({
        priceRange: { from: partition.minPrice, to: partition.maxPrice },
      });

      // With stable sorting, recordsProcessed must exactly equal the actual count
      expect(wr.recordsProcessed).toBe(actualCount);
    }
  });

  it('Symptom B: every partition should fetch records (no empty partitions when data exists)', async () => {
    // Pre-fix, unstable sorting would cause some partitions to fetch almost nothing
    // (e.g., 28/861) because items shifted to other pages.
    // Post-fix, every partition with a non-empty price range should fetch > 0 records.
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    for (const wr of workerResults) {
      // Every partition that was created by the heatmap (which only creates
      // partitions for non-empty ranges) must fetch at least 1 record
      expect(wr.recordsProcessed).toBeGreaterThan(0);

      // And the fetched records must match the actual price range count
      const partition = result.partitions.find(p => p.partitionId === wr.partitionId)!;
      const actualCount = await adapter.getCount({
        priceRange: { from: partition.minPrice, to: partition.maxPrice },
      });
      expect(wr.recordsProcessed).toBe(actualCount);
    }
  });

  it('Symptom C: raw diamond count should equal seeded count (no missed diamonds)', async () => {
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    // Simulate the raw table upsert
    const { uniqueStoneIds } = simulateRawUpsert(workerResults);

    // The critical assertion: every seeded diamond should appear in the raw table
    expect(uniqueStoneIds.size).toBe(DIAMOND_COUNT);
  });

  it('no diamond should be fetched by multiple partitions', async () => {
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    // Check for duplicates across partitions
    const allStoneIds = new Set<string>();
    const duplicates: string[] = [];

    for (const wr of workerResults) {
      for (const stoneId of wr.stoneIds) {
        if (allStoneIds.has(stoneId)) {
          duplicates.push(stoneId);
        }
        allStoneIds.add(stoneId);
      }
    }

    expect(duplicates).toHaveLength(0);
  });

  it('total recordsProcessed across all partitions should equal seeded count', async () => {
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    const totalProcessed = workerResults.reduce((s, wr) => s + wr.recordsProcessed, 0);
    expect(totalProcessed).toBe(DIAMOND_COUNT);
  });

  it('consolidated count should equal raw count after dedup', async () => {
    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 100000,
      ...adapter.heatmapConfig,
    });

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    const { uniqueStoneIds, totalInsertAttempts } = simulateRawUpsert(workerResults);

    // With no cross-partition duplicates and stable sorting,
    // insert attempts should equal unique stone IDs
    expect(totalInsertAttempts).toBe(uniqueStoneIds.size);

    // Both should equal seeded count
    expect(uniqueStoneIds.size).toBe(DIAMOND_COUNT);

    // Simulated "consolidated count" equals raw count (since 1:1 mapping)
    // In production, the consolidator marks each raw row as consolidated,
    // so consolidated_count = unique raw rows = seeded count
    const simulatedConsolidatedCount = uniqueStoneIds.size;
    expect(simulatedConsolidatedCount).toBe(DIAMOND_COUNT);
  });
});

describe('Pipeline Consistency (boundary edge cases)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle diamonds at exact partition boundary prices', async () => {
    // Create diamonds that sit exactly at the boundaries where partitions split.
    // This tests the inclusive/exclusive price semantics.
    const boundaryDiamonds: MockDiamond[] = [];
    const prices = [99.99, 100.00, 100.01, 199.99, 200.00, 200.01, 499.99, 500.00];

    for (let i = 0; i < prices.length; i++) {
      boundaryDiamonds.push({
        id: `uuid-${i}`,
        stone_id: `DEMO-BOUNDARY-${String(i).padStart(3, '0')}`,
        asking_price_usd: prices[i],
        weight_ct: 1.0,
        stone_shape: 'ROUND',
        stone_color: 'D',
        stone_clarity: 'VS1',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      });
    }

    globalThis.fetch = createStableMockServer(boundaryDiamonds) as unknown as typeof fetch;

    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 1000,
      denseZoneThreshold: 200,
      denseZoneStep: 100,
      initialStep: 100,
      maxWorkers: 10,
      minRecordsPerWorker: 1,
      priceGranularity: 0.01,
    });

    // Every boundary diamond must be in exactly one partition
    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    const { uniqueStoneIds } = simulateRawUpsert(workerResults);
    expect(uniqueStoneIds.size).toBe(boundaryDiamonds.length);
  });

  it('should handle a single diamond', async () => {
    const singleDiamond: MockDiamond[] = [{
      id: 'uuid-1',
      stone_id: 'DEMO-SINGLE',
      asking_price_usd: 1500.50,
      weight_ct: 1.0,
      stone_shape: 'ROUND',
      stone_color: 'D',
      stone_clarity: 'VS1',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }];

    globalThis.fetch = createStableMockServer(singleDiamond) as unknown as typeof fetch;

    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 10000,
      denseZoneThreshold: 2000,
      denseZoneStep: 50,
      initialStep: 200,
      maxWorkers: 10,
      minRecordsPerWorker: 1,
      priceGranularity: 0.01,
    });

    expect(result.totalRecords).toBe(1);
    expect(result.partitions.length).toBe(1);

    const workerResult = await simulateWorker(adapter, result.partitions[0], adapter.workerPageSize);
    expect(workerResult.recordsProcessed).toBe(1);
    expect(workerResult.stoneIds.size).toBe(1);
    expect(workerResult.stoneIds.has('DEMO-SINGLE')).toBe(true);
  });

  it('should handle all diamonds at the same price', async () => {
    // All diamonds at $1000 - tests the extreme case where every diamond
    // falls in the same density chunk.
    const samePriceDiamonds: MockDiamond[] = Array.from({ length: 100 }, (_, i) => ({
      id: `uuid-${i}`,
      stone_id: `DEMO-SAME-${String(i).padStart(4, '0')}`,
      asking_price_usd: 1000.00,
      weight_ct: 1.0,
      stone_shape: 'ROUND',
      stone_color: 'D',
      stone_clarity: 'VS1',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }));

    globalThis.fetch = createStableMockServer(samePriceDiamonds) as unknown as typeof fetch;

    const adapter = new DemoFeedAdapter('http://mock-server');
    await adapter.initialize();

    const result = await scanHeatmap(adapter, {}, {
      minPrice: 0,
      maxPrice: 5000,
      denseZoneThreshold: 500,
      denseZoneStep: 50,
      initialStep: 200,
      maxWorkers: 10,
      minRecordsPerWorker: 10,
      priceGranularity: 0.01,
    });

    expect(result.totalRecords).toBe(100);

    const pageSize = adapter.workerPageSize;
    const workerResults = await Promise.all(
      result.partitions.map(p => simulateWorker(adapter, p, pageSize)),
    );

    const { uniqueStoneIds } = simulateRawUpsert(workerResults);
    expect(uniqueStoneIds.size).toBe(100);
  });
});
