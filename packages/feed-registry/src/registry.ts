import type { FeedAdapter } from './types.js';

/**
 * Central registry for all feed adapters.
 * Pipeline components (scheduler, worker, consolidator) use this to resolve
 * the correct adapter for a given feed ID.
 */
export class FeedRegistry {
  private adapters = new Map<string, FeedAdapter>();

  register(adapter: FeedAdapter): void {
    if (this.adapters.has(adapter.feedId)) {
      throw new Error(`Feed adapter already registered: ${adapter.feedId}`);
    }
    this.adapters.set(adapter.feedId, adapter);
  }

  get(feedId: string): FeedAdapter {
    const adapter = this.adapters.get(feedId);
    if (!adapter) {
      const available = Array.from(this.adapters.keys()).join(', ');
      throw new Error(`Unknown feed: '${feedId}'. Available feeds: ${available}`);
    }
    return adapter;
  }

  has(feedId: string): boolean {
    return this.adapters.has(feedId);
  }

  getAll(): FeedAdapter[] {
    return Array.from(this.adapters.values());
  }

  getFeedIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}
