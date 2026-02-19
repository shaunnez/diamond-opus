import { FeedRegistry } from '@diamond/feed-registry';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';

/**
 * Creates a FeedRegistry with all available feed adapters registered.
 * The consolidator resolves the adapter from the ConsolidateMessage.feed field.
 */
export function createFeedRegistry(): FeedRegistry {
  const registry = new FeedRegistry();

  // Register Nivoda feed variants (no rate limiter or desync needed for consolidator)
  registry.register(new NivodaFeedAdapter({ feedVariant: 'natural' }));
  registry.register(new NivodaFeedAdapter({ feedVariant: 'labgrown' }));

  // Register Demo feed
  registry.register(new DemoFeedAdapter());

  return registry;
}
