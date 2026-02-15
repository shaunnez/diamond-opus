import { createHash } from 'node:crypto';
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  CACHE_VERSION_POLL_INTERVAL_MS,
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
// LRU Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  version: string;
  createdAt: number;
}

/**
 * Simple LRU cache using Map insertion order.
 * Keys are accessed by deleting and re-inserting to move them to the end.
 */
class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string, currentVersion: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Version mismatch — stale
    if (entry.version !== currentVersion) {
      this.cache.delete(key);
      return undefined;
    }

    // TTL expired
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, version: string): void {
    // If key exists, delete first to reset position
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      version,
      createdAt: Date.now(),
    });
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Search cache instances
// ---------------------------------------------------------------------------

/** Cache for full search responses (data + pagination), keyed by version:filters:sort:page:limit */
const searchCache = new LRUCache<string>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);

/** Cache for count-only results, keyed by version:filters (shared across pages) */
const countCache = new LRUCache<number>(Math.ceil(CACHE_MAX_ENTRIES / 2), CACHE_TTL_MS);

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
  page: number,
  limit: number,
): string {
  return `${filterKey}:${sortBy}:${sortOrder}:${page}:${limit}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCachedSearch(cacheKey: string): string | undefined {
  const version = getCompositeVersion();
  return searchCache.get(cacheKey, version);
}

export function setCachedSearch(cacheKey: string, responseJson: string): void {
  const version = getCompositeVersion();
  searchCache.set(cacheKey, responseJson, version);
}

export function getCachedCount(filterKey: string): number | undefined {
  const version = getCompositeVersion();
  return countCache.get(filterKey, version);
}

export function setCachedCount(filterKey: string, count: number): void {
  const version = getCompositeVersion();
  countCache.set(filterKey, count, version);
}

export function getCacheStats(): { searchEntries: number; countEntries: number; version: string } {
  return {
    searchEntries: searchCache.size,
    countEntries: countCache.size,
    version: getCompositeVersion(),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

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

  logger.info('Cache service initialized', { version: getCompositeVersion() });
}

export function stopCacheService(): void {
  if (versionPollTimer) {
    clearInterval(versionPollTimer);
    versionPollTimer = null;
  }
  searchCache.clear();
  countCache.clear();
}
