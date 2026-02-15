import {
  DIAMOND_SHAPES,
  WORKER_PAGE_SIZE,
  NIVODA_MAX_LIMIT,
  WATERMARK_BLOB_NAME,
  type Diamond,
} from '@diamond/shared';
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
  TradingAvailabilityResult,
} from '@diamond/feed-registry';
import { updateDiamondAvailability } from '@diamond/database';
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
    dollar_per_carat: query.priceRange
  ? { from: Math.floor(query.priceRange.from), to: Math.floor(query.priceRange.to) }
  : undefined,
    updated: query.updatedRange
      ? { from: query.updatedRange.from, to: query.updatedRange.to }
      : undefined,
    has_image: true,
    has_v360: true,
    availability: ['AVAILABLE'],
    excludeFairPoorCuts: true,
    hide_memo: true
  };
  return nivodaQuery
}

/**
 * FeedAdapter implementation for the Nivoda diamond feed.
 *
 * Wraps the existing NivodaAdapter to conform to the generic FeedAdapter interface
 * while preserving all existing behavior (token caching, rate limiting, etc.).
 */
export class NivodaFeedAdapter implements FeedAdapter, TradingAdapter {
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
      sizeRange: { from: 0.4, to: 15.01 },
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

  // --- TradingAdapter methods ---

  async createHold(diamond: Diamond): Promise<TradingHoldResult> {
    // Nivoda uses supplierStoneId (diamond.id in Nivoda terms) for holds
    const result = await this.getOrCreateAdapter().createHold(diamond.supplierStoneId);
    return { id: result.id, denied: result.denied, until: result.until };
  }

  async cancelHold(feedHoldId: string): Promise<void> {
    await this.getOrCreateAdapter().cancelHold(feedHoldId);
  }

  async createOrder(diamond: Diamond, options: TradingOrderOptions): Promise<TradingOrderResult> {
    // Nivoda uses offerId for orders
    const orderId = await this.getOrCreateAdapter().createOrder([
      {
        offerId: diamond.offerId,
        destinationId: options.destinationId,
        customer_comment: options.comments,
        customer_order_number: options.reference,
        return_option: false,
      },
    ]);
    return { id: orderId };
  }

  async cancelOrder(_feedOrderId: string): Promise<void> {
    throw new Error('Order cancellation is not supported for the Nivoda feed');
  }

  async checkAvailability(diamond: Diamond): Promise<TradingAvailabilityResult> {
    try {
      const result = await this.getOrCreateAdapter().getDiamondById(diamond.supplierStoneId);

      if (!result) {
        // Diamond not found in Nivoda - mark as unavailable in our DB
        await updateDiamondAvailability(diamond.id, 'unavailable');
        return {
          available: false,
          status: 'unavailable',
          message: 'Diamond not found in Nivoda',
        };
      }

      // Map Nivoda availability status to our canonical status
      const availability = result.availability.toUpperCase();
      let canonicalStatus: Diamond['availability'];
      let response: TradingAvailabilityResult;

      if (availability === 'AVAILABLE') {
        canonicalStatus = 'available';
        response = {
          available: true,
          status: 'available',
        };
      } else if (availability === 'ON HOLD' || availability === 'HOLD' || result.HoldId) {
        canonicalStatus = 'on_hold';
        response = {
          available: false,
          status: 'on_hold',
          message: result.HoldId ? `Diamond is on hold (Hold ID: ${result.HoldId})` : 'Diamond is on hold',
        };
      } else if (availability === 'SOLD' || availability === 'MEMO') {
        canonicalStatus = 'sold';
        response = {
          available: false,
          status: 'sold',
          message: 'Diamond has been sold',
        };
      } else {
        canonicalStatus = 'unavailable';
        response = {
          available: false,
          status: 'unavailable',
          message: `Diamond status: ${result.availability}`,
        };
      }

      // Update our database if the availability has changed
      if (diamond.availability !== canonicalStatus) {
        await updateDiamondAvailability(
          diamond.id,
          canonicalStatus,
          result.HoldId || undefined
        );
      }

      return response;
    } catch (error) {
      throw new Error(
        `Failed to check availability with Nivoda: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
