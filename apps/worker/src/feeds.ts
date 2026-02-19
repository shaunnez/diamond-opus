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

  // Register Nivoda feed variants with worker-specific config (desync delay enabled)
  registry.register(new NivodaFeedAdapter({
    feedVariant: 'natural',
    enableDesyncDelay: true,
  }));
  registry.register(new NivodaFeedAdapter({
    feedVariant: 'labgrown',
    enableDesyncDelay: true,
  }));

  // Register Demo feed
  registry.register(new DemoFeedAdapter());

  return registry;
}
