import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@diamond/database', () => ({
  getAllDatasetVersions: vi.fn().mockResolvedValue({ 'nivoda-natural': 1 }),
}));

describe('Cache Service', () => {
  let cacheModule: typeof import('../src/services/cache.js');

  beforeEach(async () => {
    vi.resetModules();
    vi.mock('@diamond/database', () => ({
      getAllDatasetVersions: vi.fn().mockResolvedValue({ 'nivoda-natural': 1 }),
    }));
    cacheModule = await import('../src/services/cache.js');
    await cacheModule.initCacheService();
  });

  afterEach(() => {
    cacheModule.stopCacheService();
  });

  describe('buildFilterKey', () => {
    it('should produce deterministic hash for same params', () => {
      const key1 = cacheModule.buildFilterKey({ shape: ['ROUND', 'OVAL'], color: 'G' });
      const key2 = cacheModule.buildFilterKey({ color: 'G', shape: ['OVAL', 'ROUND'] });
      expect(key1).toBe(key2);
    });

    it('should exclude pagination and sort params', () => {
      const key1 = cacheModule.buildFilterKey({ shape: 'ROUND' });
      const key2 = cacheModule.buildFilterKey({ shape: 'ROUND', page: 2, limit: 50, sortBy: 'price', sortOrder: 'asc' });
      expect(key1).toBe(key2);
    });

    it('should omit undefined and null values', () => {
      const key1 = cacheModule.buildFilterKey({ shape: 'ROUND' });
      const key2 = cacheModule.buildFilterKey({ shape: 'ROUND', color: undefined, clarity: null });
      expect(key1).toBe(key2);
    });

    it('should produce different hashes for different params', () => {
      const key1 = cacheModule.buildFilterKey({ shape: 'ROUND' });
      const key2 = cacheModule.buildFilterKey({ shape: 'OVAL' });
      expect(key1).not.toBe(key2);
    });
  });

  describe('buildSearchCacheKey', () => {
    it('should combine filter, sort, page, and limit', () => {
      const key = cacheModule.buildSearchCacheKey('abc123', 'price', 'asc', '1', 50);
      expect(key).toBe('abc123:price:asc:1:50');
    });
  });

  describe('search cache', () => {
    it('should return undefined on miss', () => {
      expect(cacheModule.getCachedSearch('nonexistent')).toBeUndefined();
    });

    it('should return cached value on hit', () => {
      cacheModule.setCachedSearch('key1', '{"data":[]}');
      expect(cacheModule.getCachedSearch('key1')).toBe('{"data":[]}');
    });

    it('should evict stale entries when version changes', async () => {
      cacheModule.setCachedSearch('key1', '{"data":[]}');
      expect(cacheModule.getCachedSearch('key1')).toBe('{"data":[]}');

      // Simulate version change via re-poll
      const { getAllDatasetVersions } = await import('@diamond/database');
      (getAllDatasetVersions as ReturnType<typeof vi.fn>).mockResolvedValue({ 'nivoda-natural': 2 });
      await cacheModule.initCacheService();

      expect(cacheModule.getCachedSearch('key1')).toBeUndefined();
    });
  });

  describe('count cache', () => {
    it('should return undefined on miss', () => {
      expect(cacheModule.getCachedCount('nonexistent')).toBeUndefined();
    });

    it('should return cached count on hit', () => {
      cacheModule.setCachedCount('filter1', 42);
      expect(cacheModule.getCachedCount('filter1')).toBe(42);
    });
  });

  describe('analytics cache', () => {
    it('should return undefined on miss', () => {
      expect(cacheModule.getCachedAnalytics('summary')).toBeUndefined();
    });

    it('should return cached value on hit', () => {
      cacheModule.setCachedAnalytics('summary', '{"total":100}');
      expect(cacheModule.getCachedAnalytics('summary')).toBe('{"total":100}');
    });
  });

  describe('getCacheStats', () => {
    it('should report zero entries initially', () => {
      const stats = cacheModule.getCacheStats();
      expect(stats.searchEntries).toBe(0);
      expect(stats.countEntries).toBe(0);
      expect(stats.analyticsEntries).toBe(0);
    });

    it('should report correct entry counts after inserts', () => {
      cacheModule.setCachedSearch('k1', 'v1');
      cacheModule.setCachedSearch('k2', 'v2');
      cacheModule.setCachedCount('f1', 10);
      cacheModule.setCachedAnalytics('a1', '{}');

      const stats = cacheModule.getCacheStats();
      expect(stats.searchEntries).toBe(2);
      expect(stats.countEntries).toBe(1);
      expect(stats.analyticsEntries).toBe(1);
    });

    it('should track hit/miss counts', () => {
      cacheModule.setCachedSearch('k1', 'v1');
      cacheModule.getCachedSearch('k1'); // hit
      cacheModule.getCachedSearch('k2'); // miss

      const stats = cacheModule.getCacheStats();
      expect(stats.searchHits).toBe(1);
      expect(stats.searchMisses).toBe(1);
      expect(stats.searchHitRate).toBe(0.5);
    });

    it('should return zero hit rate when no requests made', () => {
      const stats = cacheModule.getCacheStats();
      expect(stats.searchHitRate).toBe(0);
      expect(stats.countHitRate).toBe(0);
      expect(stats.analyticsHitRate).toBe(0);
    });

    it('should include composite version', () => {
      const stats = cacheModule.getCacheStats();
      expect(stats.version).toMatch(/^nivoda-natural:\d+$/);
    });

    it('should include config values', () => {
      const stats = cacheModule.getCacheStats();
      expect(stats.searchMaxEntries).toBeGreaterThan(0);
      expect(stats.countMaxEntries).toBeGreaterThan(0);
      expect(stats.analyticsMaxEntries).toBeGreaterThan(0);
      expect(stats.ttlMs).toBeGreaterThan(0);
    });
  });

  describe('getCompositeVersion', () => {
    it('should return sorted composite string', () => {
      const version = cacheModule.getCompositeVersion();
      expect(version).toMatch(/^nivoda-natural:\d+$/);
    });
  });

  describe('stopCacheService', () => {
    it('should clear all caches and reset counters', () => {
      cacheModule.setCachedSearch('k1', 'v1');
      cacheModule.getCachedSearch('k1');
      cacheModule.stopCacheService();

      const stats = cacheModule.getCacheStats();
      expect(stats.searchEntries).toBe(0);
      expect(stats.searchHits).toBe(0);
      expect(stats.searchMisses).toBe(0);
    });
  });
});
