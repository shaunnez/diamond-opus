import { describe, it, expect, beforeAll } from 'vitest';
import { NivodaAdapter } from '../src/adapter.js';
import type { NivodaQuery, NivodaOrder } from '../src/types.js';

/**
 * Integration tests for Nivoda API.
 * These tests hit the real Nivoda staging API.
 *
 * To run these tests, set environment variables:
 *   NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
 *   NIVODA_USERNAME=<your-username>
 *   NIVODA_PASSWORD=<your-password>
 *
 * Run with: npm run test -w @diamond/nivoda -- --run adapter.integration
 */

const hasCredentials = !!(
  process.env.NIVODA_ENDPOINT &&
  process.env.NIVODA_USERNAME &&
  process.env.NIVODA_PASSWORD
);

describe.skipIf(!hasCredentials)('NivodaAdapter Integration', () => {
  let adapter: NivodaAdapter;

  beforeAll(() => {
    adapter = new NivodaAdapter(
      process.env.NIVODA_ENDPOINT,
      process.env.NIVODA_USERNAME,
      process.env.NIVODA_PASSWORD
    );
  });

  describe('authentication', () => {
    it('should authenticate successfully', async () => {
      // getDiamondsCount will trigger authentication
      const count = await adapter.getDiamondsCount({
        shapes: ['ROUND'],
        sizes: { from: 1, to: 2 },
        dollar_value: { from: 1000, to: 2000 },
      });

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDiamondsCount', () => {
    it('should return count for basic query', async () => {
      const count = await adapter.getDiamondsCount({
        shapes: ['ROUND'],
        sizes: { from: 0.4, to: 15.01 },
      });

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`Basic query count: ${count}`);
    });

    it('should return count with updated filter', async () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const query: NivodaQuery = {
        shapes: ['ROUND'],
        sizes: { from: 0.4, to: 15.01 },
        updated: {
          from: oneMonthAgo.toISOString(),
          to: now.toISOString(),
        },
      };

      const count = await adapter.getDiamondsCount(query);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`Count with updated (last 30 days): ${count}`);
    });

    it('should return lower count for narrow updated range', async () => {
      const now = new Date();
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Wide range (1 year)
      const wideCount = await adapter.getDiamondsCount({
        shapes: ['ROUND'],
        sizes: { from: 0.5, to: 5 },
        dollar_value: { from: 1000, to: 10000 },
        updated: {
          from: oneYearAgo.toISOString(),
          to: now.toISOString(),
        },
      });

      // Narrow range (1 hour)
      const narrowCount = await adapter.getDiamondsCount({
        shapes: ['ROUND'],
        sizes: { from: 0.5, to: 5 },
        dollar_value: { from: 1000, to: 10000 },
        updated: {
          from: oneHourAgo.toISOString(),
          to: now.toISOString(),
        },
      });

      console.log(`Wide range (1 year): ${wideCount}, Narrow range (1 hour): ${narrowCount}`);

      // Narrow range should be <= wide range
      expect(narrowCount).toBeLessThanOrEqual(wideCount);
    });
  });

  describe('searchDiamonds', () => {
    it('should return diamonds with basic query', async () => {
      const response = await adapter.searchDiamonds(
        {
          shapes: ['ROUND'],
          sizes: { from: 1, to: 2 },
          dollar_value: { from: 5000, to: 10000 },
        },
        { limit: 5 }
      );

      expect(response.items).toBeDefined();
      expect(Array.isArray(response.items)).toBe(true);
      expect(response.items.length).toBeLessThanOrEqual(5);
      console.log(`Search returned ${response.items.length} items`);

      if (response.items.length > 0) {
        const item = response.items[0];
        expect(item.id).toBeDefined(); // offer_id
        expect(item.diamond).toBeDefined();
        expect(item.diamond.id).toBeDefined(); // supplier_stone_id
      }
    });

    it('should return diamonds with updated filter', async () => {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const query: NivodaQuery = {
        shapes: ['ROUND', 'OVAL'],
        sizes: { from: 0.5, to: 5 },
        dollar_value: { from: 1000, to: 50000 },
        updated: {
          from: oneWeekAgo.toISOString(),
          to: now.toISOString(),
        },
      };

      const response = await adapter.searchDiamonds(query, { limit: 10 });

      expect(response.items).toBeDefined();
      expect(Array.isArray(response.items)).toBe(true);
      console.log(`Search with updated returned ${response.items.length} items`);
    });

    it('should respect order parameter', async () => {
      const query: NivodaQuery = {
        shapes: ['ROUND'],
        sizes: { from: 1, to: 3 },
        dollar_value: { from: 5000, to: 20000 },
      };

      const order: NivodaOrder = { type: 'createdAt', direction: 'ASC' };

      const response = await adapter.searchDiamonds(query, {
        limit: 10,
        order,
      });

      expect(response.items).toBeDefined();
      expect(Array.isArray(response.items)).toBe(true);
      console.log(`Search with order returned ${response.items.length} items`);
    });

    it('should support pagination with offset', async () => {
      const query: NivodaQuery = {
        shapes: ['ROUND'],
        sizes: { from: 1, to: 2 },
        dollar_value: { from: 5000, to: 15000 },
      };

      const order: NivodaOrder = { type: 'createdAt', direction: 'ASC' };

      // Get first page
      const page1 = await adapter.searchDiamonds(query, {
        offset: 0,
        limit: 5,
        order,
      });

      // Get second page
      const page2 = await adapter.searchDiamonds(query, {
        offset: 5,
        limit: 5,
        order,
      });

      console.log(`Page 1: ${page1.items.length} items, Page 2: ${page2.items.length} items`);

      // If we have items on both pages, they should be different
      if (page1.items.length > 0 && page2.items.length > 0) {
        const page1Ids = page1.items.map((i) => i.id);
        const page2Ids = page2.items.map((i) => i.id);

        // No overlap between pages
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it('should work with full query including updated and order', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const query: NivodaQuery = {
        shapes: ['ROUND', 'OVAL', 'CUSHION'],
        sizes: { from: 0.5, to: 5 },
        dollar_value: { from: 1000, to: 50000 },
        updated: {
          from: thirtyDaysAgo.toISOString(),
          to: now.toISOString(),
        },
      };

      const order: NivodaOrder = { type: 'createdAt', direction: 'ASC' };

      const response = await adapter.searchDiamonds(query, {
        offset: 0,
        limit: 30,
        order,
      });

      expect(response.items).toBeDefined();
      expect(response.total_count).toBeDefined();
      console.log(`Full query: ${response.items.length} items, total_count: ${response.total_count}`);
    });
  });

  describe('full run simulation', () => {
    it('should work with FULL_RUN_START_DATE filter', async () => {
      const FULL_RUN_START_DATE = '2000-01-01T00:00:00.000Z';
      const now = new Date();

      const query: NivodaQuery = {
        shapes: ['ROUND'],
        sizes: { from: 1, to: 2 },
        dollar_value: { from: 5000, to: 10000 },
        updated: {
          from: FULL_RUN_START_DATE,
          to: now.toISOString(),
        },
      };

      const count = await adapter.getDiamondsCount(query);
      expect(typeof count).toBe('number');
      console.log(`Full run date range count: ${count}`);

      const response = await adapter.searchDiamonds(query, {
        limit: 5,
        order: { type: 'createdAt', direction: 'ASC' },
      });
      expect(response.items).toBeDefined();
      console.log(`Full run date range search: ${response.items.length} items`);
    });
  });
});
