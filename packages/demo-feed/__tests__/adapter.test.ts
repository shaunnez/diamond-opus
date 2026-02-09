import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DemoFeedAdapter } from '../src/adapter.js';
import type { FeedQuery } from '@diamond/feed-registry';

/**
 * Tests for DemoFeedAdapter pagination stability.
 *
 * Root cause of production count mismatches: the demo-feed-api was sorting
 * only by created_at, but all seeded diamonds share the same timestamp.
 * Without a unique tiebreaker column (stone_id), offset pagination was
 * non-deterministic - rows shifted between pages, causing some to be
 * fetched multiple times and others to be skipped entirely.
 *
 * The fix adds ", stone_id ASC" as a tiebreaker in the ORDER BY clause.
 * These tests verify the adapter correctly produces deterministic pages.
 */

// --- Helpers ---

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

/**
 * Creates N mock diamonds with the same created_at timestamp (simulating
 * the demo seed batch insert behavior). Prices are distributed across
 * the given range so partition tests can slice by price.
 */
function createMockDiamonds(count: number, options?: {
  priceMin?: number;
  priceMax?: number;
  createdAt?: string;
}): MockDiamond[] {
  const priceMin = options?.priceMin ?? 100;
  const priceMax = options?.priceMax ?? 10000;
  const createdAt = options?.createdAt ?? '2024-01-01T00:00:00.000Z';

  return Array.from({ length: count }, (_, i) => {
    const price = Math.round(
      (priceMin + (priceMax - priceMin) * (i / Math.max(count - 1, 1))) * 100
    ) / 100;

    return {
      id: `uuid-${String(i + 1).padStart(7, '0')}`,
      stone_id: `DEMO-${String(i + 1).padStart(7, '0')}`,
      asking_price_usd: price,
      weight_ct: 1.0,
      stone_shape: 'ROUND',
      stone_color: 'D',
      stone_clarity: 'VS1',
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
}

/**
 * Creates a mock server that simulates the demo-feed-api behavior.
 * Sorts by the requested order_by column + stone_id tiebreaker, then
 * applies OFFSET/LIMIT and price filters.
 */
function createMockServer(allDiamonds: MockDiamond[]) {
  return (url: string) => {
    const parsed = new URL(url);
    const path = parsed.pathname;

    // Apply price filters
    let filtered = [...allDiamonds];
    const priceMin = parsed.searchParams.get('price_min');
    const priceMax = parsed.searchParams.get('price_max');
    if (priceMin) {
      filtered = filtered.filter(d => d.asking_price_usd >= Number(priceMin));
    }
    if (priceMax) {
      filtered = filtered.filter(d => d.asking_price_usd <= Number(priceMax));
    }

    // Apply date filters
    const updatedFrom = parsed.searchParams.get('updated_from');
    const updatedTo = parsed.searchParams.get('updated_to');
    if (updatedFrom) {
      filtered = filtered.filter(d => d.updated_at >= updatedFrom);
    }
    if (updatedTo) {
      filtered = filtered.filter(d => d.updated_at <= updatedTo);
    }

    if (path === '/api/diamonds/count') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ total_count: filtered.length }),
      });
    }

    if (path === '/api/diamonds') {
      // Sort: order_by + stone_id tiebreaker (matches the fixed API)
      const orderBy = parsed.searchParams.get('order_by') ?? 'created_at';
      const orderDir = parsed.searchParams.get('order_dir') ?? 'ASC';

      filtered.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[orderBy];
        const bVal = (b as Record<string, unknown>)[orderBy];
        let cmp = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal;
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }
        if (cmp !== 0) return orderDir === 'DESC' ? -cmp : cmp;
        // Tiebreaker: stone_id ASC (matches the fix)
        return a.stone_id.localeCompare(b.stone_id);
      });

      const offset = parseInt(parsed.searchParams.get('offset') ?? '0', 10);
      const limit = parseInt(parsed.searchParams.get('limit') ?? '100', 10);
      const page = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          items: page,
          count: page.length,
          offset,
          limit,
        }),
      });
    }

    if (path === '/api/health') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      });
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
  };
}

/**
 * Creates a mock server WITHOUT the stone_id tiebreaker to demonstrate
 * how unstable sorting causes pagination issues. Uses Fisher-Yates shuffle
 * with a per-call seed so items are in a completely different order each call.
 */
function createUnstableMockServer(allDiamonds: MockDiamond[]) {
  let callCount = 0;

  // Simple seeded PRNG for deterministic-but-different shuffles per call
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

  return (url: string) => {
    const parsed = new URL(url);
    const path = parsed.pathname;

    let filtered = [...allDiamonds];
    const priceMin = parsed.searchParams.get('price_min');
    const priceMax = parsed.searchParams.get('price_max');
    if (priceMin) {
      filtered = filtered.filter(d => d.asking_price_usd >= Number(priceMin));
    }
    if (priceMax) {
      filtered = filtered.filter(d => d.asking_price_usd <= Number(priceMax));
    }

    if (path === '/api/diamonds/count') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ total_count: filtered.length }),
      });
    }

    if (path === '/api/diamonds') {
      callCount++;
      // Fisher-Yates shuffle with a different seed per call.
      // This simulates PostgreSQL returning rows in a completely different
      // physical order each time when ORDER BY has tied values.
      const rng = mulberry32(callCount * 7919);
      for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
      }

      const offset = parseInt(parsed.searchParams.get('offset') ?? '0', 10);
      const limit = parseInt(parsed.searchParams.get('limit') ?? '100', 10);
      const page = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          items: page,
          count: page.length,
          offset,
          limit,
        }),
      });
    }

    if (path === '/api/health') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      });
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
  };
}

// --- Tests ---

describe('DemoFeedAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('pagination stability (with stone_id tiebreaker)', () => {
    it('should return all diamonds exactly once when paginating through full dataset', async () => {
      const diamonds = createMockDiamonds(200);
      globalThis.fetch = createMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');
      await adapter.initialize();

      const allStoneIds = new Set<string>();
      let totalFetched = 0;
      let offset = 0;
      const limit = 30;

      while (true) {
        const result = await adapter.search(
          {},
          { offset, limit, order: { type: 'createdAt', direction: 'ASC' } },
        );

        for (const item of result.items) {
          const stoneId = (item as unknown as MockDiamond).stone_id;
          allStoneIds.add(stoneId);
        }

        totalFetched += result.items.length;

        if (result.items.length < limit) break;
        offset += result.items.length;
      }

      expect(allStoneIds.size).toBe(200);
      expect(totalFetched).toBe(200);
    });

    it('should return consistent pages across repeated queries at the same offset', async () => {
      const diamonds = createMockDiamonds(100);
      globalThis.fetch = createMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      const query: FeedQuery = {};
      const options = { offset: 30, limit: 10, order: { type: 'createdAt' as const, direction: 'ASC' as const } };

      const result1 = await adapter.search(query, options);
      const result2 = await adapter.search(query, options);

      const ids1 = result1.items.map(i => (i as unknown as MockDiamond).stone_id);
      const ids2 = result2.items.map(i => (i as unknown as MockDiamond).stone_id);

      expect(ids1).toEqual(ids2);
    });

    it('should not have overlapping stone_ids between consecutive pages', async () => {
      const diamonds = createMockDiamonds(100);
      globalThis.fetch = createMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      const page1 = await adapter.search(
        {},
        { offset: 0, limit: 50, order: { type: 'createdAt', direction: 'ASC' } },
      );
      const page2 = await adapter.search(
        {},
        { offset: 50, limit: 50, order: { type: 'createdAt', direction: 'ASC' } },
      );

      const ids1 = new Set(page1.items.map(i => (i as unknown as MockDiamond).stone_id));
      const ids2 = new Set(page2.items.map(i => (i as unknown as MockDiamond).stone_id));

      // No overlap
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }

      // Together they cover all 100
      expect(ids1.size + ids2.size).toBe(100);
    });

    it('should return correct diamond count for a price range', async () => {
      const diamonds = createMockDiamonds(100, { priceMin: 100, priceMax: 1000 });
      globalThis.fetch = createMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      const query: FeedQuery = { priceRange: { from: 100, to: 500 } };
      const count = await adapter.getCount(query);

      // Manually calculate expected: diamonds with price <= 500
      const expected = diamonds.filter(d => d.asking_price_usd >= 100 && d.asking_price_usd <= 500).length;
      expect(count).toBe(expected);
    });

    it('should have search results consistent with count for same price range', async () => {
      const diamonds = createMockDiamonds(100, { priceMin: 100, priceMax: 1000 });
      globalThis.fetch = createMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      const query: FeedQuery = { priceRange: { from: 200, to: 600 } };
      const count = await adapter.getCount(query);

      // Paginate through all results
      let totalFetched = 0;
      let offset = 0;
      const limit = 20;

      while (true) {
        const result = await adapter.search(query, { offset, limit, order: { type: 'createdAt', direction: 'ASC' } });
        totalFetched += result.items.length;
        if (result.items.length < limit) break;
        offset += result.items.length;
      }

      expect(totalFetched).toBe(count);
    });
  });

  describe('unstable sort demonstration (pre-fix behavior)', () => {
    it('should demonstrate that different sort orders per page produce duplicates', async () => {
      // This test directly demonstrates the bug: when each API call returns
      // items in a different order (simulating PostgreSQL's non-deterministic
      // behavior when ORDER BY has ties), the same diamond can appear on
      // multiple pages, causing duplicates.
      //
      // We verify this by comparing the ordered stone_ids between two calls
      // to the same offset/limit - they should differ with an unstable sort.
      const diamonds = createMockDiamonds(50);
      globalThis.fetch = createUnstableMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      // Fetch page 2 (offset=10, limit=10) twice — with unstable sort,
      // the two calls should return different sets of stone_ids.
      const result1 = await adapter.search(
        {},
        { offset: 10, limit: 10, order: { type: 'createdAt', direction: 'ASC' } },
      );
      const result2 = await adapter.search(
        {},
        { offset: 10, limit: 10, order: { type: 'createdAt', direction: 'ASC' } },
      );

      const ids1 = result1.items.map(i => (i as unknown as MockDiamond).stone_id).sort();
      const ids2 = result2.items.map(i => (i as unknown as MockDiamond).stone_id).sort();

      // With unstable sorting, the same offset/limit should return different items.
      // This is the core of the bug: page N on call 1 has different items than
      // page N on call 2, so paginating through produces duplicates and misses.
      expect(ids1).not.toEqual(ids2);
    });

    it('stable mock server should return identical results for same offset', async () => {
      // Contrast test: with stable sort (the fix), same query always returns same data.
      const diamonds = createMockDiamonds(50);
      globalThis.fetch = createMockServer(diamonds) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      const result1 = await adapter.search(
        {},
        { offset: 10, limit: 10, order: { type: 'createdAt', direction: 'ASC' } },
      );
      const result2 = await adapter.search(
        {},
        { offset: 10, limit: 10, order: { type: 'createdAt', direction: 'ASC' } },
      );

      const ids1 = result1.items.map(i => (i as unknown as MockDiamond).stone_id);
      const ids2 = result2.items.map(i => (i as unknown as MockDiamond).stone_id);

      expect(ids1).toEqual(ids2);
    });
  });

  describe('extractIdentity', () => {
    it('should use stone_id as supplierStoneId', () => {
      const adapter = new DemoFeedAdapter('http://mock-server');
      const item: Record<string, unknown> = {
        id: 'uuid-123',
        stone_id: 'DEMO-0000001',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const identity = adapter.extractIdentity(item);

      expect(identity.supplierStoneId).toBe('DEMO-0000001');
      expect(identity.offerId).toBe('uuid-123');
    });
  });

  describe('buildQueryParams', () => {
    it('should set price_min and price_max from priceRange', async () => {
      const diamonds = createMockDiamonds(10);
      const fetchCalls: string[] = [];

      globalThis.fetch = ((url: string) => {
        fetchCalls.push(url);
        return createMockServer(diamonds)(url);
      }) as unknown as typeof fetch;

      const adapter = new DemoFeedAdapter('http://mock-server');

      await adapter.search(
        { priceRange: { from: 100, to: 499.99 } },
        { offset: 0, limit: 10, order: { type: 'createdAt', direction: 'ASC' } },
      );

      const searchUrl = fetchCalls.find(u => u.includes('/api/diamonds?'));
      expect(searchUrl).toBeDefined();

      const parsed = new URL(searchUrl!);
      expect(parsed.searchParams.get('price_min')).toBe('100');
      expect(parsed.searchParams.get('price_max')).toBe('499.99');
    });
  });
});
