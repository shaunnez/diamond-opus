import { randomUUID } from 'node:crypto';
import type { Diamond } from '@diamond/shared';
import type {
  FeedAdapter,
  FeedQuery,
  FeedSearchOptions,
  FeedSearchResult,
  FeedBulkRawDiamond,
  MappedDiamond,
  HeatmapConfigOverrides,
  TradingAdapter,
  TradingHoldResult,
  TradingOrderResult,
  TradingOrderOptions,
} from '@diamond/feed-registry';
import { mapRawPayloadToDiamond } from './mapper.js';
import type { DemoFeedSearchResponse, DemoFeedCountResponse, DemoFeedItem } from './types.js';

const DEMO_FEED_MAX_PAGE_SIZE = 1000;
const DEMO_FEED_WORKER_PAGE_SIZE = 40;
const DEMO_FEED_WATERMARK_BLOB = 'demo.json';

/**
 * FeedAdapter implementation for the demo diamond feed.
 *
 * Talks to the demo-feed-api Express server which serves from demo_feed_inventory table.
 * Demonstrates a completely different API shape from Nivoda (REST vs GraphQL,
 * different field names, different pagination).
 */
/** Simulate network + processing delay like a real API */
function simulatedDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DemoFeedAdapter implements FeedAdapter, TradingAdapter {
  readonly feedId = 'demo';
  readonly rawTableName = 'raw_diamonds_demo';
  readonly watermarkBlobName = DEMO_FEED_WATERMARK_BLOB;
  readonly maxPageSize = DEMO_FEED_MAX_PAGE_SIZE;
  readonly workerPageSize = DEMO_FEED_WORKER_PAGE_SIZE;
  readonly heatmapConfig: HeatmapConfigOverrides = {
    // Demo feed has fewer diamonds, so use smaller steps
    denseZoneThreshold: 5000,
    denseZoneStep: 50,
    initialStep: 200,
    maxWorkers: 100,
    minRecordsPerWorker: 500,
    priceGranularity: 0.01, // Demo feed uses decimal prices
  };

  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.DEMO_FEED_API_URL ?? 'http://localhost:4000';
  }

  async getCount(query: FeedQuery): Promise<number> {
    const params = this.buildQueryParams(query);
    const url = `${this.baseUrl}/api/diamonds/count?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Demo feed count request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DemoFeedCountResponse;
    return data.total_count;
  }

  buildBaseQuery(updatedFrom: string, updatedTo: string): FeedQuery {
    return {
      updatedRange: { from: updatedFrom, to: updatedTo },
    };
  }

  async search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult> {
    const params = this.buildQueryParams(query);
    params.set('offset', String(options.offset));
    params.set('limit', String(Math.min(options.limit, this.maxPageSize)));

    if (options.order) {
      // Map generic order types to demo API column names
      const orderByMap: Record<string, string> = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        price: 'asking_price_usd',
      };
      params.set('order_by', orderByMap[options.order.type] ?? 'created_at');
      params.set('order_dir', options.order.direction);
    }

    const url = `${this.baseUrl}/api/diamonds?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Demo feed search request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DemoFeedSearchResponse;

    return {
      items: data.items as unknown as Record<string, unknown>[],
      totalCount: data.count,
    };
  }

  extractIdentity(item: Record<string, unknown>): FeedBulkRawDiamond {
    const demoItem = item as unknown as DemoFeedItem;
    return {
      supplierStoneId: demoItem.stone_id,
      offerId: demoItem.id,
      payload: item,
      sourceUpdatedAt: demoItem.updated_at ? new Date(demoItem.updated_at) : undefined,
    };
  }

  mapRawToDiamond(payload: Record<string, unknown>): MappedDiamond {
    return mapRawPayloadToDiamond(payload);
  }

  async initialize(): Promise<void> {
    // Verify the demo feed API is reachable
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      throw new Error(
        `Demo feed API not reachable at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async dispose(): Promise<void> {
    // No persistent resources
  }

  // --- TradingAdapter methods ---

  async createHold(_diamond: Diamond): Promise<TradingHoldResult> {
    // Simulate API call with believable delay (1.5-3s)
    await simulatedDelay(1500, 3000);
    const holdId = `demo-hold-${randomUUID()}`;
    const holdUntil = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h hold
    return {
      id: holdId,
      denied: false,
      until: holdUntil.toISOString(),
    };
  }

  async cancelHold(_feedHoldId: string): Promise<void> {
    // Simulate API call (0.5-1.5s)
    await simulatedDelay(500, 1500);
  }

  async createOrder(_diamond: Diamond, _options: TradingOrderOptions): Promise<TradingOrderResult> {
    // Simulate API call with believable delay (2-4s)
    await simulatedDelay(2000, 4000);
    const orderId = `demo-order-${randomUUID()}`;
    return { id: orderId };
  }

  async cancelOrder(_feedOrderId: string): Promise<void> {
    // Simulate API call (0.5-1.5s)
    await simulatedDelay(500, 1500);
  }

  private buildQueryParams(query: FeedQuery): URLSearchParams {
    const params = new URLSearchParams();

    if (query.priceRange) {
      params.set('price_min', String(query.priceRange.from));
      params.set('price_max', String(query.priceRange.to));
    }
    if (query.updatedRange) {
      params.set('updated_from', query.updatedRange.from);
      params.set('updated_to', query.updatedRange.to);
    }

    return params;
  }
}
