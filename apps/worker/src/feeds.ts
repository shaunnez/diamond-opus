import { FeedRegistry } from '@diamond/feed-registry';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';
import { acquireRateLimitToken } from '@diamond/database';
import {
  RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_WAIT_MS,
  RATE_LIMIT_BASE_DELAY_MS,
} from '@diamond/shared';

/**
 * Creates a FeedRegistry with all available feed adapters registered.
 * Workers handle messages from ANY feed, so all adapters are registered.
 */
export function createFeedRegistry(): FeedRegistry {
  const registry = new FeedRegistry();

  // Rate limiter for Nivoda
  const rateLimitConfig = {
    maxRequestsPerWindow: RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
    windowDurationMs: RATE_LIMIT_WINDOW_MS,
    maxWaitMs: RATE_LIMIT_MAX_WAIT_MS,
    baseDelayMs: RATE_LIMIT_BASE_DELAY_MS,
  };
  const acquireRateLimit = () => acquireRateLimitToken("nivoda_global", rateLimitConfig);

  // Register Nivoda feed with worker-specific config (desync delay enabled)
  registry.register(new NivodaFeedAdapter({
    enableDesyncDelay: true,
    rateLimiter: acquireRateLimit,
  }));

  // Register Demo feed
  registry.register(new DemoFeedAdapter());

  return registry;
}
