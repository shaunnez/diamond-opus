import type { Diamond } from '@diamond/shared';

/**
 * Generic query structure for any feed.
 * Each feed adapter translates this into its native query format.
 */
export interface FeedQuery {
  /** Price range filter in dollars */
  priceRange?: { from: number; to: number };
  /** Date range filter for updated records (ISO 8601) */
  updatedRange?: { from: string; to: string };
  /** Shape filter */
  shapes?: string[];
  /** Carat/size range */
  sizeRange?: { from: number; to: number };
}

export interface FeedSearchOptions {
  offset: number;
  limit: number;
  order?: { type: string; direction: 'ASC' | 'DESC' };
}

export interface FeedSearchResult {
  items: Record<string, unknown>[];
  totalCount: number;
}

export interface FeedBulkRawDiamond {
  supplierStoneId: string;
  offerId: string;
  payload: Record<string, unknown>;
  sourceUpdatedAt?: Date;
}

/** Diamond type without computed/DB-generated fields */
export type MappedDiamond = Omit<
  Diamond,
  'id' | 'createdAt' | 'updatedAt' | 'retailPrice' | 'markupRatio' | 'rating'
>;

/**
 * Heatmap configuration that a feed can override.
 * Imported from the heatmap module for type re-export.
 */
export interface HeatmapConfigOverrides {
  minPrice?: number;
  maxPrice?: number;
  denseZoneThreshold?: number;
  denseZoneStep?: number;
  initialStep?: number;
  targetRecordsPerChunk?: number;
  maxWorkers?: number;
  minRecordsPerWorker?: number;
  concurrency?: number;
  useTwoPassScan?: boolean;
  coarseStep?: number;
  maxTotalRecords?: number;
}

/**
 * Core abstraction for a diamond data feed.
 *
 * Each feed (Nivoda, demo, future APIs, CSV imports) implements this interface.
 * The pipeline components (scheduler, worker, consolidator) are feed-agnostic
 * and operate through this contract.
 */
export interface FeedAdapter {
  /** Unique feed identifier (e.g., 'nivoda', 'demo') */
  readonly feedId: string;

  /** Database table for raw storage (e.g., 'raw_diamonds_nivoda') */
  readonly rawTableName: string;

  /** Azure Blob name for watermark (e.g., 'nivoda.json') */
  readonly watermarkBlobName: string;

  /** Max items per search request (e.g., Nivoda=50, Demo=1000) */
  readonly maxPageSize: number;

  /** Default page size for workers (should be <= maxPageSize) */
  readonly workerPageSize: number;

  /** Heatmap configuration overrides for this feed */
  readonly heatmapConfig: HeatmapConfigOverrides;

  // --- Scheduler methods ---

  /** Get count of diamonds matching query (for heatmap density scanning) */
  getCount(query: FeedQuery): Promise<number>;

  /** Build the base query for a run (shapes, sizes, date range) */
  buildBaseQuery(updatedFrom: string, updatedTo: string): FeedQuery;

  // --- Worker methods ---

  /** Search for diamonds with pagination */
  search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult>;

  /** Extract identity fields from a raw item for raw table storage */
  extractIdentity(item: Record<string, unknown>): FeedBulkRawDiamond;

  // --- Consolidator methods ---

  /** Map raw payload to canonical Diamond (minus computed pricing fields) */
  mapRawToDiamond(payload: Record<string, unknown>): MappedDiamond;

  // --- Lifecycle ---

  /** Initialize adapter (auth, connections, etc.) */
  initialize(): Promise<void>;

  /** Cleanup resources */
  dispose?(): Promise<void>;
}

/**
 * Allowed raw table names for SQL injection prevention.
 * Every feed must register its raw table name here.
 */
export const ALLOWED_RAW_TABLES = new Set([
  'raw_diamonds_nivoda',
  'raw_diamonds_demo',
]);
