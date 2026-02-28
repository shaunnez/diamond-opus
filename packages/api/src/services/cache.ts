import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  CACHE_VERSION_POLL_INTERVAL_MS,
  ANALYTICS_CACHE_MAX_ENTRIES,
  ANALYTICS_CACHE_TTL_MS,
  createServiceLogger,
} from '@diamond/shared';
import { getAllDatasetVersions } from '@diamond/database';

const logger = createServiceLogger('api', { component: 'cache' });

// ---------------------------------------------------------------------------
// Dataset version tracking
// ---------------------------------------------------------------------------

/** Current dataset versions keyed by feed. Updated by polling. */
let datasetVersions: Record<string, number> = {};
let versionPollTimer: ReturnType<typeof setInterval> | null = null;

/** Returns a composite version string across all feeds (e.g. "nivoda:42,demo:3"). */
export function getCompositeVersion(): string {
  const entries = Object.entries(datasetVersions).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '0';
  return entries.map(([feed, v]) => `${feed}:${v}`).join(',');
}

async function pollVersions(): Promise<void> {
  try {
    const versions = await getAllDatasetVersions();
    const oldComposite = getCompositeVersion();
    datasetVersions = versions;
    const newComposite = getCompositeVersion();

    if (oldComposite !== newComposite) {
      logger.info('Dataset version changed', { old: oldComposite, new: newComposite });
    }
  } catch (error) {
    logger.error('Failed to poll dataset versions', error);
  }
}

// ---------------------------------------------------------------------------
// Versioned value wrapper
// ---------------------------------------------------------------------------

/** Wraps a cached value with the dataset version it was stored at. */
interface Versioned<T> {
  value: T;
  version: string;
}

// ---------------------------------------------------------------------------
// Observability counters
// ---------------------------------------------------------------------------

let searchHits = 0;
let searchMisses = 0;
let countHits = 0;
let countMisses = 0;
let analyticsHits = 0;
let analyticsMisses = 0;

// ---------------------------------------------------------------------------
// Cache instances (lru-cache v11)
// ---------------------------------------------------------------------------

/** Cache for full search responses (data + pagination) */
const searchCache = new LRUCache<string, Versioned<string>>({
  max: CACHE_MAX_ENTRIES,
  ttl: CACHE_TTL_MS,
  allowStale: false,
  updateAgeOnGet: false,
});

/** Cache for count-only results (shared across pages for same filter) */
const countCache = new LRUCache<string, Versioned<number>>({
  max: Math.ceil(CACHE_MAX_ENTRIES / 2),
  ttl: CACHE_TTL_MS,
  allowStale: false,
  updateAgeOnGet: false,
});

/** Cache for analytics endpoint responses */
const analyticsCache = new LRUCache<string, Versioned<string>>({
  max: ANALYTICS_CACHE_MAX_ENTRIES,
  ttl: ANALYTICS_CACHE_TTL_MS,
  allowStale: false,
  updateAgeOnGet: false,
});

// ---------------------------------------------------------------------------
// Version-checked helpers
// ---------------------------------------------------------------------------

function versionedGet<T>(
  cache: LRUCache<string, Versioned<T>>,
  key: string,
  currentVersion: string,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  // Version mismatch — treat as stale
  if (entry.version !== currentVersion) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function versionedSet<T>(
  cache: LRUCache<string, Versioned<T>>,
  key: string,
  value: T,
  currentVersion: string,
): void {
  cache.set(key, { value, version: currentVersion });
}

// ---------------------------------------------------------------------------
// Cache key building
// ---------------------------------------------------------------------------

/**
 * Normalize search params into a deterministic filter fingerprint.
 * Array params are sorted, undefined values omitted, then SHA256'd.
 */
export function buildFilterKey(params: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    // Skip pagination/sort params — these vary between cache layers
    if (['page', 'limit', 'sortBy', 'sortOrder'].includes(key)) continue;

    if (Array.isArray(value)) {
      const sorted = [...value].map(String).sort();
      if (sorted.length > 0) normalized[key] = sorted;
    } else {
      normalized[key] = value;
    }
  }

  const json = JSON.stringify(normalized, Object.keys(normalized).sort());
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

export function buildSearchCacheKey(
  filterKey: string,
  sortBy: string,
  sortOrder: string,
  pageKey: string | number,
  limit: number,
  fields?: string,
): string {
  const base = `${filterKey}:${sortBy}:${sortOrder}:${pageKey}:${limit}`;
  return fields ? `${base}:${fields}` : base;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCachedSearch(cacheKey: string): string | undefined {
  const version = getCompositeVersion();
  const result = versionedGet(searchCache, cacheKey, version);
  if (result !== undefined) {
    searchHits++;
  } else {
    searchMisses++;
  }
  return result;
}

export function setCachedSearch(cacheKey: string, responseJson: string): void {
  const version = getCompositeVersion();
  versionedSet(searchCache, cacheKey, responseJson, version);
}

export function getCachedCount(filterKey: string): number | undefined {
  const version = getCompositeVersion();
  const result = versionedGet(countCache, filterKey, version);
  if (result !== undefined) {
    countHits++;
  } else {
    countMisses++;
  }
  return result;
}

export function setCachedCount(filterKey: string, count: number): void {
  const version = getCompositeVersion();
  versionedSet(countCache, filterKey, count, version);
}

export function getCachedAnalytics(key: string): string | undefined {
  const version = getCompositeVersion();
  const result = versionedGet(analyticsCache, key, version);
  if (result !== undefined) {
    analyticsHits++;
  } else {
    analyticsMisses++;
  }
  return result;
}

export function setCachedAnalytics(key: string, json: string): void {
  const version = getCompositeVersion();
  versionedSet(analyticsCache, key, json, version);
}

export function getCacheStats() {
  const searchTotal = searchHits + searchMisses;
  const countTotal = countHits + countMisses;
  const analyticsTotal = analyticsHits + analyticsMisses;

  return {
    searchEntries: searchCache.size,
    searchMaxEntries: CACHE_MAX_ENTRIES,
    countEntries: countCache.size,
    countMaxEntries: Math.ceil(CACHE_MAX_ENTRIES / 2),
    analyticsEntries: analyticsCache.size,
    analyticsMaxEntries: ANALYTICS_CACHE_MAX_ENTRIES,
    version: getCompositeVersion(),
    ttlMs: CACHE_TTL_MS,
    searchHits,
    searchMisses,
    searchHitRate: searchTotal > 0 ? searchHits / searchTotal : 0,
    countHits,
    countMisses,
    countHitRate: countTotal > 0 ? countHits / countTotal : 0,
    analyticsHits,
    analyticsMisses,
    analyticsHitRate: analyticsTotal > 0 ? analyticsHits / analyticsTotal : 0,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let statsLogTimer: ReturnType<typeof setInterval> | null = null;

export async function initCacheService(): Promise<void> {
  logger.info('Initializing cache service', {
    maxEntries: CACHE_MAX_ENTRIES,
    ttlMs: CACHE_TTL_MS,
    pollIntervalMs: CACHE_VERSION_POLL_INTERVAL_MS,
  });

  // Initial version load
  await pollVersions();

  // Start polling
  versionPollTimer = setInterval(pollVersions, CACHE_VERSION_POLL_INTERVAL_MS);
  if (versionPollTimer.unref) {
    versionPollTimer.unref();
  }

  // Log cache stats every 60 seconds
  statsLogTimer = setInterval(() => {
    const stats = getCacheStats();
    if (stats.searchHits + stats.searchMisses > 0) {
      logger.info('Cache stats', {
        searchHitRate: Math.round(stats.searchHitRate * 100),
        searchEntries: stats.searchEntries,
        searchHits: stats.searchHits,
        searchMisses: stats.searchMisses,
        countHitRate: Math.round(stats.countHitRate * 100),
        countEntries: stats.countEntries,
        analyticsHitRate: Math.round(stats.analyticsHitRate * 100),
        analyticsEntries: stats.analyticsEntries,
        version: stats.version,
      });
    }
  }, 60_000);
  if (statsLogTimer.unref) {
    statsLogTimer.unref();
  }

  logger.info('Cache service initialized', { version: getCompositeVersion() });
}

export function stopCacheService(): void {
  if (versionPollTimer) {
    clearInterval(versionPollTimer);
    versionPollTimer = null;
  }
  if (statsLogTimer) {
    clearInterval(statsLogTimer);
    statsLogTimer = null;
  }
  searchCache.clear();
  countCache.clear();
  analyticsCache.clear();

  // Reset counters
  searchHits = searchMisses = 0;
  countHits = countMisses = 0;
  analyticsHits = analyticsMisses = 0;
}
