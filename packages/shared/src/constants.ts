export const RECORDS_PER_WORKER = 5000;
export const WORKER_PAGE_SIZE = 30;
/** Number of raw diamonds to fetch per consolidation cycle */
export const CONSOLIDATOR_BATCH_SIZE = 2000;
/** Number of diamonds per batch upsert (balances query size vs round-trips) */
export const CONSOLIDATOR_UPSERT_BATCH_SIZE = 100;
/**
 * Concurrent batch upserts - env override via CONSOLIDATOR_CONCURRENCY.
 * Should not exceed PG_POOL_MAX to avoid connection exhaustion.
 * Default: 2 (safe for multi-replica with PG_POOL_MAX=2)
 */
export const CONSOLIDATOR_CONCURRENCY = parseInt(
  process.env.CONSOLIDATOR_CONCURRENCY ?? '2',
  10
);
/** TTL in minutes for stuck claim recovery. Claims older than this are reset to pending. */
export const CONSOLIDATOR_CLAIM_TTL_MINUTES = 30;
/** Minimum success rate (0-1) for auto-starting consolidation when some workers fail */
export const AUTO_CONSOLIDATION_SUCCESS_THRESHOLD = 0.70;
/** Delay in minutes before auto-starting consolidation on partial success */
export const AUTO_CONSOLIDATION_DELAY_MINUTES = 5;
export const NIVODA_MAX_LIMIT = 50;

export const TOKEN_LIFETIME_MS = 6 * 60 * 60 * 1000; // 6 hours
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export const HMAC_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

// Rate limiting configuration for Nivoda API
/** Maximum requests per second globally across all workers (conservative start) */
export const RATE_LIMIT_MAX_REQUESTS_PER_WINDOW = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS ?? '2',
  10
);
/** Rate limit window duration in milliseconds */
export const RATE_LIMIT_WINDOW_MS = 1000;
/** Maximum time to wait for a rate limit token before giving up */
export const RATE_LIMIT_MAX_WAIT_MS = 30000;
/** Base delay between rate limit retry attempts */
export const RATE_LIMIT_BASE_DELAY_MS = 100;

// Request timeout configuration
/** Default timeout for Nivoda API requests in milliseconds */
export const NIVODA_REQUEST_TIMEOUT_MS = parseInt(
  process.env.NIVODA_REQUEST_TIMEOUT_MS ?? '45000',
  10
);

// Worker desynchronization
/** Random delay range before API calls to desynchronize workers (milliseconds) */
export const WORKER_DESYNC_MIN_MS = 100;
export const WORKER_DESYNC_MAX_MS = 500;

export const DIAMOND_SHAPES = [
  'ROUND',
  'OVAL',
  'EMERALD',
  'CUSHION',
  'CUSHION B',
  'CUSHION MODIFIED',
  'CUSHION BRILLIANT',
  'ASSCHER',
  'RADIANT',
  'MARQUISE',
  'PEAR',
  'PRINCESS',
  'ROSE',
  'OLD MINER',
  'TRILLIANT',
  'HEXAGONAL',
  'HEART',
] as const;

export const AVAILABILITY_STATUSES = [
  'available',
  'on_hold',
  'sold',
  'unavailable',
] as const;

export const SERVICE_BUS_QUEUES = {
  WORK_ITEMS: 'work-items',
  WORK_DONE: 'work-done',
  CONSOLIDATE: 'consolidate',
} as const;

export const BLOB_CONTAINERS = {
  WATERMARKS: 'watermarks',
} as const;

export const WATERMARK_BLOB_NAME = 'nivoda.json';

// Heatmap scanner configuration
/** Maximum total records to process (0 = unlimited). Use for staging caps. */
export const MAX_SCHEDULER_RECORDS = 0;
export const HEATMAP_MIN_PRICE = 0;
export const HEATMAP_MAX_PRICE = 250000;
/** Price threshold below which we use fixed small steps (dense zone) */
export const HEATMAP_DENSE_ZONE_THRESHOLD = 20000;
/** Fixed step size in dense zone (dollars) */
export const HEATMAP_DENSE_ZONE_STEP = 100;
/** Initial step size for adaptive scanning above dense zone (larger for efficiency) */
export const HEATMAP_INITIAL_STEP = 500;
/** Target records per scan chunk for adaptive stepping */
export const HEATMAP_TARGET_RECORDS_PER_CHUNK = 500;
/** Maximum workers for a full run */
export const HEATMAP_MAX_WORKERS = 1000;
/** Minimum records needed to spawn an additional worker */
export const HEATMAP_MIN_RECORDS_PER_WORKER = 1000;

// Nivoda query date filtering
/**
 * Start date for full runs - ensures we capture all historical diamonds.
 * Using 2000-01-01 as a safe date before Nivoda's existence.
 */
export const FULL_RUN_START_DATE = '2000-01-01T00:00:00.000Z';

/**
 * Safety buffer in minutes for incremental runs.
 * Subtracts this from the watermark's lastUpdatedAt to ensure no diamonds
 * are missed due to timing issues at the boundary.
 */
export const INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES = 15;
