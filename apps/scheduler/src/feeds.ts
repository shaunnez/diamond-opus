import { FeedRegistry } from '@diamond/feed-registry';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';

/**
 * Creates a FeedRegistry with all available feed adapters registered.
 * Used by the scheduler to resolve the adapter for the configured FEED env var.
 *
 * Rate limiting is handled at the API proxy layer (in-memory token bucket),
 * so the scheduler no longer needs a client-side rate limiter.
 */
export function createFeedRegistry(): FeedRegistry {
  const registry = new FeedRegistry();

  // Register Nivoda feed variants (natural + labgrown)
  registry.register(new NivodaFeedAdapter({
    feedVariant: 'natural',
    enableDesyncDelay: false,
  }));
  registry.register(new NivodaFeedAdapter({
    feedVariant: 'labgrown',
    enableDesyncDelay: false,
  }));

  // Register Demo feed
  registry.register(new DemoFeedAdapter());

  return registry;
}
