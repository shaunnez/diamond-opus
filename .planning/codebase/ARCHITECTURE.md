# Architecture

**Analysis Date:** 2026-02-17

## Pattern Overview

**Overall:** Message-driven pipeline with feed-agnostic abstraction layer

**Key Characteristics:**
- Three independent services (Scheduler, Worker, Consolidator) communicate via Azure Service Bus messages
- Feed abstraction allows multi-source ingestion (Nivoda, demo, future feeds) without pipeline code changes
- Density-based partitioning distributes work across parallel workers
- Atomic partition progress tracking enables fault-tolerant continuation pattern
- Express REST API provides query interface with caching and rate-limiting
- React frontends (dashboard, storefront) consume the API

## Layers

**Feed Adapter Layer:**
- Purpose: Abstracts differences between data sources (Nivoda GraphQL, demo in-memory, CSV, etc.)
- Location: `packages/feed-registry/src/types.ts`, `packages/nivoda/src/adapter.ts`, `packages/demo-feed/src/adapter.ts`
- Contains: FeedAdapter interface implementations
- Depends on: Feed-specific APIs and query builders
- Used by: Scheduler (getCount, buildBaseQuery), Worker (search, extractIdentity), Consolidator (mapRawToDiamond)

**Ingestion Pipeline Layer:**
- Purpose: Orchestrates data flow from feeds to canonical diamonds table
- Location: `apps/scheduler/src`, `apps/worker/src`, `apps/consolidator/src`
- Contains: Job partitioning, data extraction, transformation, watermark tracking
- Depends on: FeedAdapter, Database queries, Service Bus messaging
- Used by: Triggered via environment variables or API

**Database Layer:**
- Purpose: Single source of truth for diamonds, run state, pricing rules, partition progress
- Location: `packages/database/src/queries/`, `packages/database/src/client.ts`
- Contains: Query builders, connection pooling, transaction handling
- Depends on: PostgreSQL
- Used by: All pipeline services, API

**Pricing Layer:**
- Purpose: Applies dynamic pricing rules to diamonds based on stone type and feed price
- Location: `packages/pricing-engine/src/engine.ts`
- Contains: PricingEngine class with rule matching and markup calculation
- Depends on: Pricing rules from database
- Used by: Consolidator (applies pricing on ingestion), API (search results)

**API Layer:**
- Purpose: REST interface for querying diamonds, managing pricing rules, triggering runs
- Location: `packages/api/src/`
- Contains: Express routes, middleware (auth, rate-limiting, HMAC validation), OpenAPI spec
- Depends on: Database, PricingEngine, FeedAdapters (for Nivoda proxy)
- Used by: Dashboard, storefront, external clients

**Shared Utilities Layer:**
- Purpose: Common types, constants, logging, retry logic, message definitions
- Location: `packages/shared/src/`
- Contains: Types (WorkItemMessage, Diamond, PricingRule), constants (timeouts, thresholds), utilities (createServiceLogger, withRetry)
- Depends on: Node.js standard library
- Used by: All services

## Data Flow

**Ingestion Run (Full or Incremental):**

1. Scheduler starts on schedule or API trigger
2. Scheduler loads watermark from Azure Blob (or starts with empty if first run)
3. Scheduler calls adapter.getCount() across price ranges to build density heatmap
4. Heatmap is divided into 1-10 balanced partitions based on record density
5. Scheduler creates run metadata in `runs` table
6. Scheduler enqueues WorkItemMessage for each partition to Service Bus
7. Worker receives WorkItemMessage, processes one page (40 items) from adapter.search()
8. Worker upserts items to feed-specific raw table (e.g., `raw_diamonds_nivoda`)
9. Worker increments partition_progress offset and enqueues next page (continuation pattern)
10. Last worker completes partition, triggers all-done check
11. When all workers done: Consolidator message sent to Service Bus
12. Consolidator claims raw diamonds in batches (2000 at a time)
13. Consolidator maps raw → canonical (adapter.mapRawToDiamond), applies pricing
14. Consolidator upserts to `diamonds` table in batches (100 at a time)
15. Consolidator marks raw diamonds as consolidated
16. Consolidator increments `dataset_versions` for cache invalidation
17. Consolidator advances watermark in Azure Blob
18. Run marked complete in `runs` table

**API Search Query:**

1. Client calls `GET /api/v2/diamonds?shape=...&priceMin=...`
2. Middleware validates auth (API key or HMAC)
3. Cache checked: key = (dataset_version, normalized_filters, sort, page)
4. Cache hit → return with X-Cache: HIT header and ETag
5. Cache miss → query database with adaptive indexing
6. Results priced with current PricingEngine (rules loaded from `pricing_rules`)
7. Results cached (LRU, 5min TTL per config)
8. Return with Cache-Control headers and version ETag

**State Management:**

- **Watermark:** Stored in Azure Blob as JSON (lastUpdatedAt, lastRunId). Advanced only after successful consolidation.
- **Run State:** `runs` table tracks metadata (createdAt, expectedWorkerCount, completedWorkerCount, failedWorkerCount, status).
- **Partition Progress:** `partition_progress` table holds (runId, partitionId, nextOffset, completed, failed). Atomically updated per page.
- **Pricing:** `pricing_rules` table with active/inactive flag. Evaluated per diamond in consolidator. Repricing jobs tracked in `pricing_reapply_jobs` table.
- **API Cache:** In-memory LRU per replica. Invalidated by `dataset_versions` table polling (30s interval).

## Key Abstractions

**FeedAdapter:**
- Purpose: Represents a data source contract
- Examples: `packages/nivoda/src/adapter.ts`, `packages/demo-feed/src/adapter.ts`
- Pattern: Implements FeedAdapter interface with getCount, buildBaseQuery, search, extractIdentity, mapRawToDiamond methods

**WorkItemMessage:**
- Purpose: Represents a unit of work (one page from one price partition)
- Examples: See `packages/shared/src/types/messages.ts`
- Pattern: Contains partitionId, price range, offset, limit; enqueued to Service Bus; processed by exactly one worker; continuation via re-enqueueing with incremented offset

**PricingEngine:**
- Purpose: Stateless calculator for diamond pricing
- Examples: `packages/pricing-engine/src/engine.ts`
- Pattern: Loads rules on init, matches diamond against rule conditions (stone type, price range, feed), calculates final price with margin modifiers

**HeatmapScanner:**
- Purpose: Density analysis to partition work
- Examples: `packages/feed-registry/src/heatmap.ts`
- Pattern: Calls adapter.getCount() for price ranges; builds chunks; merges into balanced partitions; adaptive stepping (fixed $50/ct in dense zone, dynamic in sparse)

## Entry Points

**Scheduler:**
- Location: `apps/scheduler/src/index.ts`
- Triggers: K8s CronJob or API call (sets RUN_TYPE env var)
- Responsibilities: Resolve feed adapter, fetch watermark, compute date window, scan heatmap, create run metadata, enqueue work items

**Worker:**
- Location: `apps/worker/src/index.ts`
- Triggers: Service Bus WorkItemMessage arrival
- Responsibilities: Receive message, validate idempotency (partition_progress), fetch page from adapter, upsert raw, mark progress, enqueue next page or trigger consolidation

**Consolidator:**
- Location: `apps/consolidator/src/index.ts`
- Triggers: Service Bus ConsolidateMessage (sent by last worker or API)
- Responsibilities: Claim raw diamonds, map/price in batches, upsert to diamonds table, mark consolidated, increment version, update watermark

**API Server:**
- Location: `packages/api/src/server.ts`
- Triggers: Express listen on port 3000
- Responsibilities: Route requests, apply middleware (auth, validation), query diamonds with cache, serve swagger docs

**Dashboard:**
- Location: `apps/dashboard/src/App.tsx`
- Triggers: Browser load
- Responsibilities: Display runs, triggers, analytics, pricing rule CRUD, repricing job status (with polling)

**Storefront:**
- Location: `apps/storefront/src/App.tsx`
- Triggers: Browser load
- Responsibilities: Search/filter diamonds, display details, place holds/orders (trading endpoints)

## Error Handling

**Strategy:** Fail-safe with automatic recovery where possible

**Patterns:**
- Worker page fails → partition marked failed, auto-consolidation triggered if success rate ≥ 70%
- Consolidator batch fails → entire batch marked failed (continue with next batch)
- API query fails → return 500 with correlation ID in logs
- Network timeout → retry with exponential backoff (via withRetry utility)
- Database connection pool exhausted → queue request, return 503 if pool timeout exceeded
- Partition offset mismatch → skip duplicate message (idempotency guard)

## Cross-Cutting Concerns

**Logging:**
- Framework: `createServiceLogger` from packages/shared creates structured JSON logs
- Pattern: Logs include traceId, requestId, service name; child loggers inherit context; key events (page processed, partition completed, consolidation started) logged at INFO level

**Validation:**
- Framework: Zod validators in `packages/api/src/validators/`
- Pattern: Request body/query validated before processing; HMAC timestamp checked (5min tolerance); API key hash verified (constant-time comparison)

**Authentication:**
- Patterns: Dual-mode - API Key (X-API-Key header hash-checked) OR HMAC (X-Client-Id, X-Timestamp, X-Signature with canonical request string)
- Location: `packages/api/src/middleware/auth.ts`, `packages/api/src/middleware/nivodaProxyAuth.ts`
- Internal: Internal Nivoda proxy uses separate constant-time token comparison

---

*Architecture analysis: 2026-02-17*
