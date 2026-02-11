import { FeedRegistry } from '@diamond/feed-registry';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';

/**
 * Creates a FeedRegistry with all available feed adapters registered.
 * Workers handle messages from ANY feed, so all adapters are registered.
 *
 * Rate limiting is handled at the API proxy layer (in-memory token bucket),
 * so workers no longer need a client-side rate limiter.
 */
export function createFeedRegistry(): FeedRegistry {
  const registry = new FeedRegistry();

  // Register Nivoda feed with worker-specific config (desync delay enabled)
  registry.register(new NivodaFeedAdapter({
    enableDesyncDelay: true,
  }));

  // Register Demo feed
  registry.register(new DemoFeedAdapter());

  return registry;
}
