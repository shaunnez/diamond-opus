export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds (default: 20000) */
  maxDelayMs: number;
  /** Maximum random jitter to add in milliseconds (default: 300) */
  jitterMs: number;
  /** Callback invoked before each retry attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  /** Custom function to determine if an error is retryable (default: isRetryableError) */
  isRetryable?: (error: Error) => boolean;
  /** Optional function to call before each attempt (e.g., rate limiter) */
  beforeAttempt?: () => Promise<void>;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 20000,
  jitterMs: 300,
};

/**
 * Determines if an error is retryable based on common patterns.
 *
 * Retryable errors:
 * - Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, etc.)
 * - Timeout errors
 * - Apollo operation timeouts
 * - HTTP 429 (rate limit)
 * - HTTP 5xx server errors
 * - GraphQL server errors
 *
 * Non-retryable errors:
 * - Validation errors
 * - Authentication errors (after token refresh attempt)
 * - Bad input (4xx except 429)
 * - GraphQL query syntax errors
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network errors - always retryable
  const networkErrors = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'enetunreach',
    'ehostunreach',
    'epipe',
    'socket hang up',
    'network error',
    'fetch failed',
    'request aborted',
  ];

  for (const netError of networkErrors) {
    if (message.includes(netError)) {
      return true;
    }
  }

  // Timeout errors - retryable
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('operation timed out') ||
    name.includes('timeout')
  ) {
    return true;
  }

  // Apollo-specific errors - retryable
  if (
    message.includes('apollo') ||
    message.includes('graphql') && message.includes('error')
  ) {
    // But not syntax/validation errors
    if (
      message.includes('syntax') ||
      message.includes('validation') ||
      message.includes('unknown field') ||
      message.includes('cannot query')
    ) {
      return false;
    }
    return true;
  }

  // HTTP status code patterns
  if (message.includes('429') || message.includes('rate limit')) {
    return true;
  }

  // Server errors (5xx)
  const serverErrorPattern = /\b5\d{2}\b/;
  if (serverErrorPattern.test(message)) {
    return true;
  }

  // Client errors (4xx except 429) - not retryable
  const clientErrorPattern = /\b4\d{2}\b/;
  if (clientErrorPattern.test(message) && !message.includes('429')) {
    return false;
  }

  // Authentication errors - not retryable (should be handled at adapter level)
  if (
    message.includes('unauthorized') ||
    message.includes('authentication failed') ||
    message.includes('invalid token') ||
    message.includes('token expired')
  ) {
    return false;
  }

  // Default: assume retryable for unknown errors (safer for external APIs)
  return true;
}

/**
 * Calculates the delay for a retry attempt using exponential backoff with jitter.
 *
 * Formula: min(maxDelay, baseDelay * 2^attempt) + random(0, jitter)
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterMs: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add random jitter to desynchronize retries across workers
  const jitter = Math.random() * jitterMs;

  return cappedDelay + jitter;
}

/**
 * Executes a function with retry logic, exponential backoff, and jitter.
 *
 * Key features:
 * - Exponential backoff starting at baseDelayMs, doubling each attempt
 * - Random jitter to prevent thundering herd
 * - Distinguishes retryable from non-retryable errors
 * - Optional rate limiter integration via beforeAttempt
 *
 * @example
 * const result = await withRetry(
 *   () => fetchData(),
 *   {
 *     maxRetries: 3,
 *     onRetry: (error, attempt) => console.log(`Retry ${attempt}: ${error.message}`),
 *     beforeAttempt: async () => await acquireRateLimitToken(),
 *   }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const isRetryable = opts.isRetryable ?? isRetryableError;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Call beforeAttempt hook if provided (e.g., rate limiter)
      if (opts.beforeAttempt) {
        await opts.beforeAttempt();
      }

      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt < opts.maxRetries && isRetryable(lastError)) {
        const delay = calculateRetryDelay(
          attempt,
          opts.baseDelayMs,
          opts.maxDelayMs,
          opts.jitterMs
        );

        opts.onRetry?.(lastError, attempt + 1, delay);
        await sleep(delay);
      } else if (!isRetryable(lastError)) {
        // Non-retryable error, throw immediately
        throw lastError;
      }
    }
  }

  throw lastError;
}

/**
 * Variant of withRetry specifically tuned for authentication.
 * Uses fewer retries and shorter delays since auth failures
 * are often not transient.
 */
export async function withAuthRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 2000,
    jitterMs: 100,
    ...options,
    // Auth errors are only retryable for transient issues
    isRetryable: (error) => {
      const message = error.message.toLowerCase();
      // Only retry network/timeout issues, not actual auth failures
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('socket')
      );
    },
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adds a random delay for desynchronization.
 * Useful before API calls to prevent thundering herd.
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await sleep(delay);
}
