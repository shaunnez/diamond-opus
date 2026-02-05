import { query } from "../client.js";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window (default: 2) */
  maxRequestsPerWindow: number;
  /** Window duration in milliseconds (default: 1000ms = 1 second) */
  windowDurationMs: number;
  /** Maximum wait time before giving up (default: 10000ms) */
  maxWaitMs: number;
  /** Base delay between retry attempts (default: 100ms) */
  baseDelayMs: number;
  /** Maximum jitter to add to delays (default: 50ms) */
  maxJitterMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerWindow: 2,
  windowDurationMs: 1000,
  maxWaitMs: 10000,
  baseDelayMs: 100,
  maxJitterMs: 50,
};

/**
 * Result of attempting to acquire a rate limit token
 */
export interface AcquireResult {
  acquired: boolean;
  currentCount: number;
  windowStart: Date;
  waitMs?: number;
}

/**
 * Attempts to acquire a rate limit token using atomic database operations.
 * Uses fixed window token bucket pattern.
 *
 * Returns immediately with acquired=true if token is available,
 * or acquired=false with suggested wait time if limit exceeded.
 */
export async function tryAcquireRateLimitToken(
  key: string = "nivoda_global",
  config: Partial<RateLimitConfig> = {}
): Promise<AcquireResult> {
  const { maxRequestsPerWindow, windowDurationMs } = { ...DEFAULT_CONFIG, ...config };

  // Atomic operation: reset window if expired, then try to increment
  // Uses a single query with conditional logic to avoid race conditions
  const result = await query<{
    acquired: boolean;
    request_count: number;
    window_start: Date;
    window_remaining_ms: number;
  }>(
    `
    WITH current_state AS (
      SELECT
        key,
        window_start,
        request_count,
        EXTRACT(EPOCH FROM (NOW() - window_start)) * 1000 AS elapsed_ms
      FROM rate_limit
      WHERE key = $1
      FOR UPDATE
    ),
    updated AS (
      UPDATE rate_limit
      SET
        -- Reset window if expired, otherwise keep current
        window_start = CASE
          WHEN (SELECT elapsed_ms FROM current_state) >= $2 THEN NOW()
          ELSE window_start
        END,
        -- Reset count if window expired and under limit, or increment if under limit
        request_count = CASE
          WHEN (SELECT elapsed_ms FROM current_state) >= $2 THEN 1
          WHEN request_count < $3 THEN request_count + 1
          ELSE request_count
        END,
        last_request_at = CASE
          WHEN (SELECT elapsed_ms FROM current_state) >= $2 THEN NOW()
          WHEN request_count < $3 THEN NOW()
          ELSE last_request_at
        END
      WHERE key = $1
      RETURNING
        key,
        window_start,
        request_count,
        -- Check if we actually got a token
        CASE
          WHEN (SELECT elapsed_ms FROM current_state) >= $2 THEN true
          WHEN (SELECT request_count FROM current_state) < $3 THEN true
          ELSE false
        END AS acquired,
        -- Calculate remaining time in current window
        GREATEST(0, $2 - EXTRACT(EPOCH FROM (NOW() - window_start)) * 1000)::integer AS window_remaining_ms
    )
    SELECT
      acquired,
      request_count,
      window_start,
      window_remaining_ms
    FROM updated
    `,
    [key, windowDurationMs, maxRequestsPerWindow]
  );

  if (result.rows.length === 0) {
    // Row doesn't exist, create it and return acquired
    await query(
      `
      INSERT INTO rate_limit (key, window_start, request_count, last_request_at)
      VALUES ($1, NOW(), 1, NOW())
      ON CONFLICT (key) DO NOTHING
      `,
      [key]
    );
    return {
      acquired: true,
      currentCount: 1,
      windowStart: new Date(),
    };
  }

  const row = result.rows[0];
  return {
    acquired: row.acquired,
    currentCount: row.request_count,
    windowStart: row.window_start,
    waitMs: row.acquired ? undefined : row.window_remaining_ms,
  };
}

/**
 * Acquires a rate limit token, waiting if necessary.
 * Blocks until a token is acquired or maxWaitMs is exceeded.
 *
 * @throws Error if unable to acquire token within maxWaitMs
 */
export async function acquireRateLimitToken(
  key: string = "nivoda_global",
  config: Partial<RateLimitConfig> = {}
): Promise<void> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  while (Date.now() - startTime < opts.maxWaitMs) {
    const result = await tryAcquireRateLimitToken(key, opts);

    if (result.acquired) {
      return;
    }

    // Calculate wait time with jitter
    const baseWait = Math.min(result.waitMs ?? opts.baseDelayMs, opts.baseDelayMs * 2);
    const jitter = Math.random() * opts.maxJitterMs;
    const waitTime = baseWait + jitter;

    // Check if waiting would exceed our budget
    if (Date.now() - startTime + waitTime > opts.maxWaitMs) {
      throw new Error(
        `Rate limit exceeded: unable to acquire token within ${opts.maxWaitMs}ms`
      );
    }

    await sleep(waitTime);
  }

  throw new Error(
    `Rate limit exceeded: unable to acquire token within ${opts.maxWaitMs}ms`
  );
}

/**
 * Gets the current rate limit status without modifying it.
 * Useful for monitoring and debugging.
 */
export async function getRateLimitStatus(
  key: string = "nivoda_global"
): Promise<{
  key: string;
  windowStart: Date;
  requestCount: number;
  lastRequestAt: Date | null;
} | null> {
  const result = await query<{
    key: string;
    window_start: Date;
    request_count: number;
    last_request_at: Date | null;
  }>(
    `SELECT key, window_start, request_count, last_request_at FROM rate_limit WHERE key = $1`,
    [key]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    key: row.key,
    windowStart: row.window_start,
    requestCount: row.request_count,
    lastRequestAt: row.last_request_at,
  };
}

/**
 * Resets the rate limit for a key (useful for testing or manual intervention).
 */
export async function resetRateLimit(key: string = "nivoda_global"): Promise<void> {
  await query(
    `
    UPDATE rate_limit
    SET window_start = NOW(), request_count = 0, last_request_at = NULL
    WHERE key = $1
    `,
    [key]
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
