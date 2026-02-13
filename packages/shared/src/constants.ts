export const WORKER_PAGE_SIZE = 40;
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

// Nivoda proxy rate limiting (in-memory on API proxy)
/** Max requests per second per API replica for Nivoda proxy */
export const NIVODA_PROXY_RATE_LIMIT = parseInt(
  process.env.NIVODA_PROXY_RATE_LIMIT ?? '25',
  10
);
/** Rate limit window duration in milliseconds */
export const NIVODA_PROXY_RATE_LIMIT_WINDOW_MS = 1000;
/** Maximum time a queued proxy request waits before receiving 429 */
export const NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS = parseInt(
  process.env.NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS ?? '60000',
  10
);

// Nivoda proxy timeout
/** Timeout for the API proxy's upstream fetch to Nivoda (milliseconds) */
export const NIVODA_PROXY_TIMEOUT_MS = parseInt(
  process.env.NIVODA_PROXY_TIMEOUT_MS ?? '60000',
  10
);
/** Client-side transport timeout (must be > NIVODA_PROXY_TIMEOUT_MS) */
export const NIVODA_PROXY_TRANSPORT_TIMEOUT_MS = 65_000;

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
  HEATMAPS: 'heatmaps',
} as const;

export const WATERMARK_BLOB_NAME = 'nivoda.json';

// Heatmap scanner configuration
/** Maximum total records to process (0 = unlimited). Use for staging caps. */
export const MAX_SCHEDULER_RECORDS = 0;
export const HEATMAP_MIN_PRICE = 0;
export const HEATMAP_MAX_PRICE = 100000;
/** Price-per-carat threshold below which we use fixed small steps (dense zone) */
export const HEATMAP_DENSE_ZONE_THRESHOLD = 5000;
/** Fixed step size in dense zone (dollars per carat) */
export const HEATMAP_DENSE_ZONE_STEP = 50;
/** Initial step size for adaptive scanning above dense zone (dollars per carat) */
export const HEATMAP_INITIAL_STEP = 250;
/** Target records per scan chunk for adaptive stepping */
export const HEATMAP_TARGET_RECORDS_PER_CHUNK = 500;
/** Maximum workers for a full run */
export const HEATMAP_MAX_WORKERS = 40;
/** Minimum records needed to spawn an additional worker */
export const HEATMAP_MIN_RECORDS_PER_WORKER = 1000;
/**
 * Safety multiplier for worker offset cap.
 * If offset exceeds estimatedRecords * this multiplier, the worker stops
 * paginating and completes the partition to prevent runaway ingestion.
 */
export const WORKER_OFFSET_LIMIT_MULTIPLIER = 2;

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

// Base margins by stone type (percentage)
/** Base margin for natural diamonds */
export const NATURAL_BASE_MARGIN = 40;
/** Base margin for lab-grown diamonds */
export const LAB_BASE_MARGIN = 79;
/** Base margin for fancy colored diamonds (both lab and natural) */
export const FANCY_BASE_MARGIN = 40;

// Currency conversion
export const FRANKFURTER_API_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=NZD';
export const CURRENCY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
