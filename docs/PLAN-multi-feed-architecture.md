# Multi-Feed Architecture Plan

## Goal

Generalize the pipeline from a single Nivoda feed to support multiple diamond data feeds. Prove the architecture with a **demo feed**: a mock API backed by a Supabase table serving 100k fake diamonds, running through the full scheduler → workers → consolidator pipeline.

## Design Principles

1. **Feed as a first-class concept** — every pipeline component is feed-aware
2. **FeedAdapter interface** — each feed implements a standard contract
3. **Separate raw tables per feed** — different payload schemas, independent claim/consolidation
4. **Separate runs per feed** — independent failure handling and watermarks
5. **Shared canonical `diamonds` table** — all feeds merge into one table, differentiated by `feed` column (already exists with `UNIQUE(feed, supplier_stone_id)`)

---

## Architecture Overview

```
┌──────────────┐      ┌──────────────┐
│  Scheduler   │      │  Scheduler   │
│ (feed=nivoda)│      │ (feed=demo)  │
└──────┬───────┘      └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────────────────────────────┐
│         Service Bus (work-items)     │
│   Messages now include feed field    │
└──────────────┬───────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌──────────────┐ ┌──────────────┐
│   Workers    │ │   Workers    │
│ (feed=nivoda)│ │ (feed=demo)  │
│ → NivodaAPI  │ │ → DemoAPI    │
│ → raw_nivoda │ │ → raw_demo   │
└──────┬───────┘ └──────┬───────┘
       │                │
       ▼                ▼
┌──────────────────────────────────────┐
│      Service Bus (consolidate)       │
│   Messages now include feed field    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│          Consolidator                │
│  feed → FeedRegistry → adapter      │
│  adapter.mapper() → canonical       │
│  → pricing engine → diamonds table  │
└──────────────────────────────────────┘
```

---

## Phase 1: FeedAdapter Interface & Registry

### New package: `packages/feed-registry/`

Define the abstraction that all feeds must implement.

```typescript
// packages/feed-registry/src/types.ts

export interface FeedQuery {
  /** Price range filter (dollars) */
  priceRange?: { from: number; to: number };
  /** Date range filter for updated records */
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

export interface FeedAdapter {
  /** Unique feed identifier (e.g., 'nivoda', 'demo') */
  readonly feedId: string;

  /** Database table for raw storage (e.g., 'raw_diamonds_nivoda') */
  readonly rawTableName: string;

  /** Azure Blob name for watermark (e.g., 'nivoda.json') */
  readonly watermarkBlobName: string;

  /** Max items per search request (e.g., Nivoda=50, Demo=1000) */
  readonly maxPageSize: number;

  /** Default page size for workers */
  readonly workerPageSize: number;

  /** Heatmap configuration overrides for this feed */
  readonly heatmapConfig: Partial<HeatmapConfig>;

  // --- Scheduler methods ---

  /** Get count of diamonds matching query (for heatmap) */
  getCount(query: FeedQuery): Promise<number>;

  /** Build the base query for a run (shapes, sizes, date range) */
  buildBaseQuery(updatedFrom: string, updatedTo: string): FeedQuery;

  // --- Worker methods ---

  /** Search for diamonds with pagination */
  search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult>;

  /** Extract identity fields from a raw item for storage */
  extractIdentity(item: Record<string, unknown>): {
    supplierStoneId: string;
    offerId: string;
    sourceUpdatedAt?: Date;
  };

  // --- Consolidator methods ---

  /** Map raw payload to canonical Diamond (minus computed fields) */
  mapRawToDiamond(payload: Record<string, unknown>): Omit<Diamond,
    'id' | 'createdAt' | 'updatedAt' | 'priceModelPrice' | 'markupRatio' | 'rating'
  >;

  // --- Lifecycle ---

  /** Initialize adapter (auth, connections, etc.) */
  initialize(): Promise<void>;

  /** Cleanup resources */
  dispose?(): Promise<void>;
}
```

### Feed Registry

```typescript
// packages/feed-registry/src/registry.ts

export class FeedRegistry {
  private adapters = new Map<string, FeedAdapter>();

  register(adapter: FeedAdapter): void {
    this.adapters.set(adapter.feedId, adapter);
  }

  get(feedId: string): FeedAdapter {
    const adapter = this.adapters.get(feedId);
    if (!adapter) throw new Error(`Unknown feed: ${feedId}`);
    return adapter;
  }

  getAll(): FeedAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(feedId: string): boolean {
    return this.adapters.has(feedId);
  }
}
```

### Tasks

- [ ] Create `packages/feed-registry/` package with types and registry
- [ ] Add to workspace in root `package.json`
- [ ] Export `FeedAdapter`, `FeedQuery`, `FeedSearchResult`, `FeedRegistry`

---

## Phase 2: Wrap Nivoda as a FeedAdapter

Refactor `@diamond/nivoda` to implement the `FeedAdapter` interface while preserving all existing functionality.

```typescript
// packages/nivoda/src/feed-adapter.ts

export class NivodaFeedAdapter implements FeedAdapter {
  readonly feedId = 'nivoda';
  readonly rawTableName = 'raw_diamonds_nivoda';
  readonly watermarkBlobName = 'nivoda.json';
  readonly maxPageSize = NIVODA_MAX_LIMIT; // 50
  readonly workerPageSize = WORKER_PAGE_SIZE; // 30
  readonly heatmapConfig = {};

  private adapter: NivodaAdapter;

  constructor(config?: NivodaAdapterConfig) {
    this.adapter = new NivodaAdapter(undefined, undefined, undefined, config);
  }

  async getCount(query: FeedQuery): Promise<number> {
    return this.adapter.getDiamondsCount(toNivodaQuery(query));
  }

  buildBaseQuery(updatedFrom: string, updatedTo: string): FeedQuery {
    return {
      shapes: [...DIAMOND_SHAPES],
      sizeRange: { from: 0.5, to: 10 },
      updatedRange: { from: updatedFrom, to: updatedTo },
    };
  }

  async search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult> {
    const response = await this.adapter.searchDiamonds(toNivodaQuery(query), options);
    return {
      items: response.items as unknown as Record<string, unknown>[],
      totalCount: response.total_count,
    };
  }

  extractIdentity(item: Record<string, unknown>) {
    const nivodaItem = item as unknown as NivodaItem;
    return {
      supplierStoneId: nivodaItem.diamond.id,
      offerId: nivodaItem.id,
      sourceUpdatedAt: undefined,
    };
  }

  mapRawToDiamond(payload: Record<string, unknown>) {
    return mapRawPayloadToDiamond(payload);
  }

  async initialize() {
    // NivodaAdapter handles lazy auth
  }
}

// Helper to convert FeedQuery → NivodaQuery
function toNivodaQuery(query: FeedQuery): NivodaQuery {
  return {
    shapes: query.shapes ?? [...DIAMOND_SHAPES],
    sizes: query.sizeRange ? { from: query.sizeRange.from, to: query.sizeRange.to } : undefined,
    dollar_value: query.priceRange ? { from: query.priceRange.from, to: query.priceRange.to } : undefined,
    updated: query.updatedRange ? { from: query.updatedRange.from, to: query.updatedRange.to } : undefined,
  };
}
```

### Tasks

- [ ] Create `packages/nivoda/src/feed-adapter.ts` implementing `FeedAdapter`
- [ ] Add `toNivodaQuery()` helper to translate generic → Nivoda-specific
- [ ] Export `NivodaFeedAdapter` from package
- [ ] Existing `NivodaAdapter`, mapper, heatmap remain unchanged (no breaking changes)

---

## Phase 3: Generalize the Heatmap

The heatmap currently takes a `NivodaAdapter` directly. Generalize it to work with any `FeedAdapter`.

```typescript
// packages/feed-registry/src/heatmap.ts (moved from packages/nivoda/)

export async function scanHeatmap(
  adapter: FeedAdapter,  // Was: NivodaAdapter
  baseQuery: FeedQuery,  // Was: NivodaQuery
  config: HeatmapConfig,
  logger: Logger,
): Promise<HeatmapResult>
```

Internally, the heatmap only calls `adapter.getCount(query)` with price range modifications. The algorithm itself (density scanning, partitioning) is completely feed-agnostic.

### Tasks

- [ ] Copy heatmap from `packages/nivoda/src/heatmap.ts` to `packages/feed-registry/src/heatmap.ts`
- [ ] Replace `NivodaAdapter` parameter with `FeedAdapter`
- [ ] Replace `NivodaQuery` with `FeedQuery`
- [ ] Adapt price range modification to use `FeedQuery.priceRange`
- [ ] Keep the original in `packages/nivoda/` as a re-export for backwards compat (or remove if nothing else imports it)
- [ ] Update heatmap tests

---

## Phase 4: Database Changes

### Migration: `sql/migrations/002_multi_feed.sql`

```sql
-- 1. Add feed column to run_metadata
ALTER TABLE run_metadata ADD COLUMN feed TEXT NOT NULL DEFAULT 'nivoda';
CREATE INDEX idx_run_metadata_feed ON run_metadata(feed);

-- 2. Add consolidation_status + claim columns to raw_diamonds_nivoda
--    (if not already present from a previous migration)
--    Already exists per current schema exploration.

-- 3. Create raw_diamonds_demo table (same structure as nivoda)
CREATE TABLE raw_diamonds_demo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  supplier_stone_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  consolidated BOOLEAN DEFAULT FALSE,
  consolidation_status TEXT DEFAULT 'pending',
  claimed_at TIMESTAMPTZ,
  claimed_by UUID,
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(supplier_stone_id)
);

CREATE INDEX idx_raw_demo_consolidated ON raw_diamonds_demo(consolidated) WHERE NOT consolidated;
CREATE INDEX idx_raw_demo_run_id ON raw_diamonds_demo(run_id);
CREATE INDEX idx_raw_demo_unconsolidated_created ON raw_diamonds_demo(created_at ASC)
  WHERE NOT consolidated;

-- 4. Demo feed inventory table (mock API backing store)
CREATE TABLE demo_feed_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_id TEXT NOT NULL UNIQUE,
  vendor_sku TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  stone_shape TEXT NOT NULL,
  weight_ct DECIMAL(6,2) NOT NULL,
  color_grade TEXT,
  clarity_grade TEXT,
  cut_grade TEXT,
  polish_grade TEXT,
  symmetry_grade TEXT,
  fluorescence_intensity TEXT,
  is_lab_created BOOLEAN DEFAULT FALSE,
  asking_price_usd DECIMAL(12,2) NOT NULL,
  price_per_carat_usd DECIMAL(12,2),
  availability_status TEXT DEFAULT 'available',
  cert_lab TEXT,
  cert_number TEXT,
  image_link TEXT,
  video_link TEXT,
  measurements JSONB,
  additional_attributes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_demo_inventory_price ON demo_feed_inventory(asking_price_usd);
CREATE INDEX idx_demo_inventory_updated ON demo_feed_inventory(updated_at);
CREATE INDEX idx_demo_inventory_shape ON demo_feed_inventory(stone_shape);
CREATE INDEX idx_demo_inventory_availability ON demo_feed_inventory(availability_status);
```

### Generalize raw diamond queries

Currently `packages/database/src/queries/raw-diamonds.ts` hardcodes `raw_diamonds_nivoda`. Generalize to accept table name.

```typescript
// All existing functions gain an optional tableName parameter
// Default remains 'raw_diamonds_nivoda' for backwards compatibility

export async function bulkUpsertRawDiamonds(
  runId: string,
  diamonds: BulkRawDiamond[],
  tableName = 'raw_diamonds_nivoda'
): Promise<void>

export async function claimUnconsolidatedRawDiamonds(
  limit: number,
  claimedBy: string,
  tableName = 'raw_diamonds_nivoda'
): Promise<ClaimedRawDiamond[]>

// etc.
```

> **Note**: Table names come from the `FeedAdapter.rawTableName` property, not user input, so SQL injection is not a concern — but we should still validate against an allowlist.

### Tasks

- [ ] Create `sql/migrations/002_multi_feed.sql`
- [ ] Add `feed` column to `run_metadata` table
- [ ] Create `raw_diamonds_demo` table
- [ ] Create `demo_feed_inventory` table
- [ ] Generalize raw diamond queries to accept table name parameter
- [ ] Add `feed` parameter to `createRunMetadata()` query
- [ ] Validate table names against allowlist in query functions

---

## Phase 5: Generalize Messages

### Add `feed` to message types

```typescript
// packages/shared/src/types/messages.ts

export interface WorkItemMessage {
  type: 'WORK_ITEM';
  feed: string;           // NEW
  runId: string;
  traceId: string;
  partitionId: string;
  minPrice: number;
  maxPrice: number;
  totalRecords: number;
  offsetStart: number;
  offsetEnd: number;
  offset: number;
  limit: number;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface ConsolidateMessage {
  type: 'CONSOLIDATE';
  feed: string;           // NEW
  runId: string;
  traceId: string;
  force?: boolean;
}

// WorkDoneMessage gets feed too (for observability)
export interface WorkDoneMessage {
  type: 'WORK_DONE';
  feed: string;           // NEW
  runId: string;
  traceId: string;
  workerId: string;
  partitionId: string;
  recordsProcessed: number;
  status: 'success' | 'failed';
  error?: string;
}
```

### Tasks

- [ ] Add `feed` field to all three message types
- [ ] Update message sending/receiving in scheduler, worker, consolidator
- [ ] Include `feed` in Service Bus `applicationProperties` for filtering/routing

---

## Phase 6: Generalize Scheduler

The scheduler currently creates a `NivodaAdapter` directly. Change it to accept a `FEED` env var and use the registry.

```typescript
// apps/scheduler/src/index.ts

const feedId = process.env.FEED ?? 'nivoda';
const adapter = feedRegistry.get(feedId);
await adapter.initialize();

const baseQuery = adapter.buildBaseQuery(updatedFrom, updatedTo);

const heatmapConfig: HeatmapConfig = {
  maxWorkers: runType === 'incremental' ? 10 : HEATMAP_MAX_WORKERS,
  minRecordsPerWorker: HEATMAP_MIN_RECORDS_PER_WORKER,
  maxTotalRecords,
  ...adapter.heatmapConfig, // Feed-specific overrides
};

const heatmapResult = await scanHeatmap(adapter, baseQuery, heatmapConfig, log);

// Create run with feed
const runMetadata = await createRunMetadata({
  runType,
  expectedWorkers: heatmapResult.workerCount,
  watermarkBefore: watermark?.lastUpdatedAt,
  feed: feedId,  // NEW
});

// Work items include feed
const workItems: WorkItemMessage[] = heatmapResult.partitions.map(p => ({
  type: 'WORK_ITEM',
  feed: feedId,  // NEW
  runId: runMetadata.runId,
  // ... rest unchanged
  limit: adapter.workerPageSize,  // Feed-specific page size
}));
```

Each feed runs as a **separate scheduler invocation** (different cron job or Container Apps Job with different `FEED` env var). This keeps runs independent.

### Tasks

- [ ] Add `FEED` env var support (default: `'nivoda'`)
- [ ] Replace direct `NivodaAdapter` creation with registry lookup
- [ ] Use `adapter.buildBaseQuery()` instead of hardcoded shapes/sizes
- [ ] Use `adapter.workerPageSize` instead of hardcoded `WORKER_PAGE_SIZE`
- [ ] Pass `feed` to `createRunMetadata()`
- [ ] Include `feed` in work item messages
- [ ] Read watermark from `adapter.watermarkBlobName`

---

## Phase 7: Generalize Worker

The worker currently creates a `NivodaAdapter` and calls `searchDiamonds` directly. Change it to resolve the adapter from the message's `feed` field.

```typescript
// apps/worker/src/index.ts

async function processWorkItemPage(workItem: WorkItemMessage) {
  const adapter = feedRegistry.get(workItem.feed);

  // Build query from work item (same structure, just uses FeedQuery)
  const query: FeedQuery = {
    shapes: [...DIAMOND_SHAPES], // Or adapter could provide these
    sizeRange: { from: 0.5, to: 10 },
    priceRange: { from: workItem.minPrice, to: workItem.maxPrice },
    updatedRange: workItem.updatedFrom && workItem.updatedTo
      ? { from: workItem.updatedFrom, to: workItem.updatedTo }
      : undefined,
  };

  const response = await withRetry(
    () => adapter.search(query, {
      offset: workItem.offset,
      limit: workItem.limit,
      order: { type: 'createdAt', direction: 'ASC' },
    }),
  );

  // Extract identity using feed-specific logic
  const bulkDiamonds: BulkRawDiamond[] = response.items.map(item => ({
    ...adapter.extractIdentity(item),
    payload: item,
  }));

  // Write to feed-specific raw table
  await bulkUpsertRawDiamonds(workItem.runId, bulkDiamonds, adapter.rawTableName);
}
```

**Key consideration**: Workers are long-running processes that handle messages from ANY feed. The adapter is resolved per-message, not per-process. All feed adapters are registered at startup.

### Tasks

- [ ] Register all feed adapters at worker startup
- [ ] Resolve adapter from `workItem.feed` per message
- [ ] Replace `nivodaAdapter.searchDiamonds()` with `adapter.search()`
- [ ] Replace hardcoded identity extraction with `adapter.extractIdentity()`
- [ ] Pass `adapter.rawTableName` to `bulkUpsertRawDiamonds()`
- [ ] Include `feed` in work-done and consolidate messages

---

## Phase 8: Generalize Consolidator

The consolidator currently imports `mapRawPayloadToDiamond` directly from `@diamond/nivoda`. Change it to resolve the mapper from the feed.

```typescript
// apps/consolidator/src/index.ts

async function handleConsolidateMessage(message: ConsolidateMessage) {
  const adapter = feedRegistry.get(message.feed);

  // Reset stuck claims on the correct raw table
  await resetStuckClaims(CONSOLIDATOR_CLAIM_TTL_MINUTES, adapter.rawTableName);

  while (true) {
    const rawDiamonds = await claimUnconsolidatedRawDiamonds(
      CONSOLIDATOR_BATCH_SIZE,
      instanceId,
      adapter.rawTableName,  // Feed-specific table
    );
    if (rawDiamonds.length === 0) break;

    // Map using feed-specific mapper
    for (const raw of rawDiamonds) {
      const baseDiamond = adapter.mapRawToDiamond(raw.payload);
      const pricedDiamond = pricingEngine.applyPricing(baseDiamond);
      diamonds.push(pricedDiamond);
    }

    // Upsert to shared diamonds table (feed is in the diamond object)
    await upsertDiamondsBatch(diamonds);

    // Mark consolidated on the correct raw table
    await markAsConsolidated(successIds, adapter.rawTableName);
  }

  // Save watermark to feed-specific blob
  await saveWatermark(adapter.watermarkBlobName, newWatermark);
}
```

### Tasks

- [ ] Register all feed adapters at consolidator startup
- [ ] Resolve adapter from `message.feed`
- [ ] Replace direct `mapRawPayloadToDiamond` import with `adapter.mapRawToDiamond()`
- [ ] Pass `adapter.rawTableName` to claim, mark, and reset queries
- [ ] Use `adapter.watermarkBlobName` for watermark storage
- [ ] Include `feed` in consolidation logs and metrics

---

## Phase 9: Demo Feed Mock API

### New app: `apps/demo-feed-api/`

A lightweight Express server that serves diamond data from `demo_feed_inventory` table, mimicking an external supplier API.

**Endpoints:**

```
GET /api/v1/diamonds/count
  ?price_from=0&price_to=5000
  &updated_from=2024-01-01T00:00:00Z&updated_to=2024-12-31T23:59:59Z
  → { "count": 12345 }

GET /api/v1/diamonds/search
  ?price_from=0&price_to=5000
  &updated_from=...&updated_to=...
  &offset=0&limit=1000
  &sort=created_at&direction=asc
  → {
      "total": 12345,
      "items": [{ "stone_id": "DEMO-001", "weight_ct": 1.5, ... }],
      "pagination": { "offset": 0, "limit": 1000, "has_more": true }
    }
```

**Constraints:**
- Max 1000 items per request (enforced server-side)
- Supports price range filtering (for heatmap)
- Supports date range filtering on `updated_at` (for incremental runs)
- Supports offset/limit pagination with deterministic ordering
- Returns a deliberately **different schema** than Nivoda to prove the mapper abstraction

**Response schema** (intentionally different field names from Nivoda):

```json
{
  "stone_id": "DEMO-00001",
  "vendor_sku": "VS-12345",
  "vendor_name": "Demo Supplier Co",
  "stone_shape": "Round",
  "weight_ct": 1.52,
  "color_grade": "G",
  "clarity_grade": "VS1",
  "cut_grade": "Excellent",
  "polish_grade": "Excellent",
  "symmetry_grade": "Very Good",
  "fluorescence_intensity": "None",
  "is_lab_created": false,
  "asking_price_usd": 8500.00,
  "price_per_carat_usd": 5592.11,
  "availability_status": "available",
  "cert_lab": "GIA",
  "cert_number": "1234567890",
  "image_link": null,
  "video_link": null,
  "measurements": { "length": 7.35, "width": 7.38, "depth": 4.52 },
  "additional_attributes": { "eye_clean": true }
}
```

### Tasks

- [ ] Create `apps/demo-feed-api/` Express app
- [ ] Implement `/api/v1/diamonds/count` with price + date filtering
- [ ] Implement `/api/v1/diamonds/search` with pagination (max 1000)
- [ ] Add dev script: `npm run dev:demo-api`
- [ ] Dockerfile for deployment

---

## Phase 10: Demo Feed Data Seed Script

### New script: `apps/demo-feed-seed/`

Generates 100k realistic fake diamonds and bulk inserts into `demo_feed_inventory`.

**Data generation strategy:**
- Realistic distribution: more round shapes, more common colors (D-J), common clarities
- Price range: $200 - $150,000 (matches typical diamond market)
- Weight: 0.30 - 8.00 carats (heavier on 0.5-3.0 range)
- ~70% natural, ~30% lab-grown
- Deterministic seed for reproducibility (full run = idempotent)
- Incremental mode: generates new stones with `created_at` > last run

**Implementation:**
- Uses `crypto.randomUUID()` for stone_id generation
- Seeded PRNG for reproducible data (full run regenerates same stones)
- Batch inserts of 1000 records at a time
- Upserts on `stone_id` for idempotency (full runs)
- `--mode full|incremental` flag
- `--count 100000` flag (default 100k)

### Tasks

- [ ] Create `apps/demo-feed-seed/` package
- [ ] Implement realistic diamond data generation with proper distributions
- [ ] Implement seeded PRNG for full-run idempotency
- [ ] Implement incremental mode (new stones only)
- [ ] Batch insert with `ON CONFLICT (stone_id)` upsert
- [ ] Add script: `npm run seed:demo-feed`

---

## Phase 11: Demo Feed Adapter

### New package: `packages/demo-feed/`

Implements `FeedAdapter` for the demo feed, talking to the mock API.

```typescript
// packages/demo-feed/src/feed-adapter.ts

export class DemoFeedAdapter implements FeedAdapter {
  readonly feedId = 'demo';
  readonly rawTableName = 'raw_diamonds_demo';
  readonly watermarkBlobName = 'demo.json';
  readonly maxPageSize = 1000;
  readonly workerPageSize = 1000;
  readonly heatmapConfig = {
    maxWorkers: 200,           // Fewer workers needed (1000 per page)
    minRecordsPerWorker: 1000,
  };

  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.DEMO_FEED_API_URL ?? 'http://localhost:3001';
  }

  async getCount(query: FeedQuery): Promise<number> {
    const params = new URLSearchParams();
    if (query.priceRange) {
      params.set('price_from', String(query.priceRange.from));
      params.set('price_to', String(query.priceRange.to));
    }
    if (query.updatedRange) {
      params.set('updated_from', query.updatedRange.from);
      params.set('updated_to', query.updatedRange.to);
    }
    const res = await fetch(`${this.baseUrl}/api/v1/diamonds/count?${params}`);
    const data = await res.json();
    return data.count;
  }

  buildBaseQuery(updatedFrom: string, updatedTo: string): FeedQuery {
    return {
      shapes: [...DIAMOND_SHAPES],
      sizeRange: { from: 0.3, to: 10 },
      updatedRange: { from: updatedFrom, to: updatedTo },
    };
  }

  async search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult> {
    const params = new URLSearchParams();
    // ... build params from query and options
    const res = await fetch(`${this.baseUrl}/api/v1/diamonds/search?${params}`);
    const data = await res.json();
    return { items: data.items, totalCount: data.total };
  }

  extractIdentity(item: Record<string, unknown>) {
    const demo = item as DemoItem;
    return {
      supplierStoneId: demo.stone_id,
      offerId: demo.vendor_sku,
      sourceUpdatedAt: demo.updated_at ? new Date(demo.updated_at as string) : undefined,
    };
  }

  mapRawToDiamond(payload: Record<string, unknown>) {
    return mapDemoItemToDiamond(payload as unknown as DemoItem);
  }

  async initialize() {
    // Verify API is reachable
  }
}
```

### Demo Mapper

```typescript
// packages/demo-feed/src/mapper.ts

export function mapDemoItemToDiamond(item: DemoItem) {
  return {
    feed: 'demo',
    supplierStoneId: item.stone_id,
    offerId: item.vendor_sku,
    shape: item.stone_shape,
    carats: item.weight_ct,
    color: item.color_grade,
    clarity: item.clarity_grade,
    cut: item.cut_grade,
    polish: item.polish_grade,
    symmetry: item.symmetry_grade,
    fluorescence: item.fluorescence_intensity,
    labGrown: item.is_lab_created,
    treated: false,
    feedPrice: item.asking_price_usd,
    pricePerCarat: item.price_per_carat_usd ?? (item.asking_price_usd / item.weight_ct),
    availability: mapAvailability(item.availability_status),
    rawAvailability: item.availability_status,
    // ... etc
    status: 'active',
  };
}
```

### Tasks

- [ ] Create `packages/demo-feed/` package
- [ ] Implement `DemoFeedAdapter` (FeedAdapter interface)
- [ ] Implement `DemoFeedApiClient` (HTTP client for mock API)
- [ ] Implement `mapDemoItemToDiamond()` mapper
- [ ] Define `DemoItem` type (matching mock API response schema)
- [ ] Add tests for mapper
- [ ] Export adapter from package

---

## Phase 12: Wire Everything Together

### Feed Registration

Each app (scheduler, worker, consolidator) registers available feeds at startup:

```typescript
// Shared initialization (e.g., packages/feed-registry/src/defaults.ts)

import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';

export function createDefaultRegistry(): FeedRegistry {
  const registry = new FeedRegistry();
  registry.register(new NivodaFeedAdapter());
  registry.register(new DemoFeedAdapter());
  return registry;
}
```

### Tasks

- [ ] Create default registry factory
- [ ] Update scheduler to use registry
- [ ] Update worker to use registry
- [ ] Update consolidator to use registry
- [ ] Add `FEED` env var documentation
- [ ] Add `DEMO_FEED_API_URL` env var

---

## Phase 13: End-to-End Testing

### Manual verification flow:

1. **Seed**: `npm run seed:demo-feed -- --mode full --count 100000`
2. **Start mock API**: `npm run dev:demo-api` (port 3001)
3. **Run scheduler**: `FEED=demo npm run dev:scheduler`
4. **Run workers**: `FEED=demo npm run dev:worker` (or workers handle any feed)
5. **Run consolidator**: `npm run dev:consolidator`
6. **Verify**: Query API for `feed=demo` diamonds in dashboard

### Automated tests:

- [ ] FeedAdapter interface compliance tests (can run against any adapter)
- [ ] Demo mapper unit tests
- [ ] Demo API integration tests
- [ ] Heatmap with mock adapter tests
- [ ] End-to-end pipeline test with small dataset (100 diamonds)

---

## New Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `FEED` | Scheduler | Which feed to run (`nivoda`, `demo`). Default: `nivoda` |
| `DEMO_FEED_API_URL` | Worker, Scheduler | Demo feed API URL. Default: `http://localhost:3001` |

---

## File Summary

### New Files

| Path | Purpose |
|------|---------|
| `packages/feed-registry/` | FeedAdapter interface, FeedRegistry, generalized heatmap |
| `packages/demo-feed/` | DemoFeedAdapter, mapper, API client, types |
| `apps/demo-feed-api/` | Mock API Express server |
| `apps/demo-feed-seed/` | Data generation script (100k diamonds) |
| `sql/migrations/002_multi_feed.sql` | Schema changes |

### Modified Files

| Path | Change |
|------|--------|
| `packages/shared/src/types/messages.ts` | Add `feed` to all message types |
| `packages/database/src/queries/raw-diamonds.ts` | Accept `tableName` parameter |
| `packages/database/src/queries/runs.ts` | Add `feed` to run_metadata queries |
| `packages/nivoda/src/feed-adapter.ts` | New file: NivodaFeedAdapter wrapper |
| `apps/scheduler/src/index.ts` | Use FeedRegistry, add feed to messages |
| `apps/worker/src/index.ts` | Resolve adapter per message |
| `apps/consolidator/src/index.ts` | Resolve adapter per message |

### Unchanged

| Path | Reason |
|------|--------|
| `packages/nivoda/src/adapter.ts` | Preserved as-is, wrapped by NivodaFeedAdapter |
| `packages/nivoda/src/mapper.ts` | Preserved as-is, called by NivodaFeedAdapter |
| `packages/nivoda/src/heatmap.ts` | Original preserved, generalized copy in feed-registry |
| `packages/pricing-engine/` | Already feed-aware (rules have `feed` field) |
| `packages/api/` | Already returns `feed` in diamond responses |

---

## Implementation Order

Recommended sequence (each phase is independently testable):

1. **Phase 1**: FeedAdapter interface + registry (foundation)
2. **Phase 2**: Nivoda adapter wrapper (proves interface works with existing code)
3. **Phase 4**: Database migration (needed before anything writes data)
4. **Phase 5**: Message type changes (small, mechanical)
5. **Phase 3**: Generalize heatmap (scheduler prep)
6. **Phase 6**: Generalize scheduler (can test with Nivoda adapter)
7. **Phase 7**: Generalize worker (can test with Nivoda adapter)
8. **Phase 8**: Generalize consolidator (can test with Nivoda adapter)
9. **Phase 10**: Seed script (generates test data)
10. **Phase 9**: Demo feed mock API (serves test data)
11. **Phase 11**: Demo feed adapter (connects to mock API)
12. **Phase 12**: Wire together + registration
13. **Phase 13**: End-to-end testing

**Critical path**: Phases 1 → 2 → 6 → 7 → 8 can be tested purely with Nivoda (no demo feed needed). The demo feed (9 → 10 → 11) can be built in parallel once the interface is stable.
