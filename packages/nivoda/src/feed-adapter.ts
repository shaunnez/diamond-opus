import {
  DIAMOND_SHAPES,
  WORKER_PAGE_SIZE,
  NIVODA_MAX_LIMIT,
  WATERMARK_BLOB_NAME,
} from '@diamond/shared';
import type {
  FeedAdapter,
  FeedQuery,
  FeedSearchOptions,
  FeedSearchResult,
  FeedBulkRawDiamond,
  MappedDiamond,
  HeatmapConfigOverrides,
} from '@diamond/feed-registry';
import { NivodaAdapter, type NivodaAdapterConfig } from './adapter.js';
import { mapRawPayloadToDiamond } from './mapper.js';
import type { NivodaQuery, NivodaItem } from './types.js';

/**
 * Converts a generic FeedQuery into a Nivoda-specific query.
 */
function toNivodaQuery(query: FeedQuery): NivodaQuery {
  const nivodaQuery = {
    shapes: query.shapes ? [...query.shapes] : [...DIAMOND_SHAPES],
    sizes: query.sizeRange
      ? { from: query.sizeRange.from, to: query.sizeRange.to }
      : undefined,
    dollar_value: query.priceRange
  ? { from: Math.floor(query.priceRange.from), to: Math.floor(query.priceRange.to) }
  : undefined,
    updated: query.updatedRange
      ? { from: query.updatedRange.from, to: query.updatedRange.to }
      : undefined,
    has_image: true,
    has_video: true,
    availability: ['AVAILABLE'],
    excludeFairPoorCuts: true,
    hideMemo: true
  };
  console.log('Converted FeedQuery to NivodaQuery:', JSON.stringify(nivodaQuery, null, 2));
  return nivodaQuery
}

/**
 * FeedAdapter implementation for the Nivoda diamond feed.
 *
 * Wraps the existing NivodaAdapter to conform to the generic FeedAdapter interface
 * while preserving all existing behavior (token caching, rate limiting, etc.).
 */
export class NivodaFeedAdapter implements FeedAdapter {
  readonly feedId = 'nivoda';
  readonly rawTableName = 'raw_diamonds_nivoda';
  readonly watermarkBlobName = WATERMARK_BLOB_NAME;
  readonly maxPageSize = NIVODA_MAX_LIMIT;
  readonly workerPageSize = WORKER_PAGE_SIZE;
  readonly heatmapConfig: HeatmapConfigOverrides = {};

  private adapter: NivodaAdapter | null = null;
  private adapterConfig?: NivodaAdapterConfig;

  constructor(config?: NivodaAdapterConfig) {
    this.adapterConfig = config;
  }

  /**
   * Lazily creates the NivodaAdapter on first use.
   * This avoids requiring Nivoda API credentials (NIVODA_ENDPOINT, NIVODA_USERNAME,
   * NIVODA_PASSWORD) in services that only use mapping/metadata (e.g. consolidator).
   */
  private getOrCreateAdapter(): NivodaAdapter {
    if (!this.adapter) {
      this.adapter = new NivodaAdapter(undefined, undefined, undefined, this.adapterConfig);
    }
    return this.adapter;
  }

  /** Access the underlying NivodaAdapter for operations not covered by FeedAdapter */
  getNivodaAdapter(): NivodaAdapter {
    return this.getOrCreateAdapter();
  }

  async getCount(query: FeedQuery): Promise<number> {
    return this.getOrCreateAdapter().getDiamondsCount(toNivodaQuery(query));
  }

  buildBaseQuery(updatedFrom: string, updatedTo: string): FeedQuery {
    return {
      shapes: [...DIAMOND_SHAPES],
      sizeRange: { from: 0.5, to: 10 },
      updatedRange: { from: updatedFrom, to: updatedTo },
    };
  }

  async search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult> {
    const nivodaOrder = options.order
      ? { type: options.order.type as 'createdAt', direction: options.order.direction }
      : undefined;

    const response = await this.getOrCreateAdapter().searchDiamonds(
      toNivodaQuery(query),
      { offset: options.offset, limit: options.limit, order: nivodaOrder },
    );

    return {
      items: response.items as unknown as Record<string, unknown>[],
      totalCount: response.total_count,
    };
  }

  extractIdentity(item: Record<string, unknown>): FeedBulkRawDiamond {
    const nivodaItem = item as unknown as NivodaItem;
    return {
      supplierStoneId: nivodaItem.diamond.id,
      offerId: nivodaItem.id,
      payload: item,
      sourceUpdatedAt: undefined,
    };
  }

  mapRawToDiamond(payload: Record<string, unknown>): MappedDiamond {
    return mapRawPayloadToDiamond(payload);
  }

  async initialize(): Promise<void> {
    // NivodaAdapter handles lazy authentication
  }

  async dispose(): Promise<void> {
    // No persistent resources to clean up
  }
}
