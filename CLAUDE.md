# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Goal: Help Claude Code make correct changes fast with minimal context.

This repo is a TypeScript npm workspaces monorepo for ingesting diamond inventory from one or more feeds, storing raw payloads, consolidating into a canonical diamonds table, applying pricing rules, and serving via an API plus dashboard.

## Commands you will use

```bash
# Install
npm install

# Build
npm run build
npm run build:backend
npm run build:dashboard
npm run build:storefront

# Run locally
npm run dev:api
npm run dev:scheduler
npm run dev:worker
npm run dev:consolidator
npm run dev:dashboard
npm run dev:storefront
npm run dev:demo-api
npm run dev:ingestion-proxy

# Checks
npm run typecheck
npm run test                          # All workspaces
npm run test -w @diamond/nivoda       # Specific package
npm run lint

# Manual ops
npm run worker:retry
npm run consolidator:trigger

# Local infra
npm run local:up
npm run local:down
npm run local:e2e

# Other
npm run swagger
npm run seed:demo-feed
```

## Repo map

**Apps**: `apps/scheduler`, `apps/worker`, `apps/consolidator`, `apps/dashboard`, `apps/storefront`, `apps/demo-feed-api`, `apps/demo-feed-seed`, `apps/ingestion-proxy`

**Packages**: `packages/shared`, `packages/database`, `packages/feed-registry`, `packages/nivoda`, `packages/demo-feed`, `packages/pricing-engine`, `packages/api`

**Schema**: `sql/full_schema.sql`, `sql/migrations`

## Local Development

Docker Compose stack available with emulated Azure services:
- `npm run local:up` - Start Postgres, Azurite, Service Bus emulator
- `npm run local:e2e` - Full E2E test suite with Docker
- Demo feed (`apps/demo-feed-api`) provides synthetic data for local dev

See README.md for detailed local development setup.

## Pipeline in 8 lines

1. Scheduler chooses a feed via `FEED` env, defaults to `nivoda`.
2. Scheduler loads watermark from Azure Blob for that feed.
3. Scheduler fixes `updatedTo` at run start and computes `updatedFrom` based on run type.
4. Scheduler runs heatmap partitioning using feed adapter `getCount` and creates one work item message per partition.
5. Worker receives a work item message and processes exactly one page of results.
6. Worker upserts raw payloads to the feed raw table and enqueues the next page message if more pages remain.
7. When all partitions finish, the last worker triggers consolidation, with optional force on partial success (>=70%).
8. Consolidator maps raw payloads to canonical diamonds, applies pricing, upserts, then advances watermark only on successful consolidation.

## Invariants — do not violate

**1. Counting**
Partitioning must use the feed adapter `getCount`. For Nivoda this must call `diamonds_by_query_count`.
Do not use any `total_count` returned from paginated search responses.

**2. Continuation pattern**
Worker processes one page per message and enqueues the next page message.
Idempotency relies on partition progress in the database. Do not break offset guards.

**3. Watermark**
Only advance the watermark after consolidator completes successfully.

**4. Identity fields**
Raw ingestion stores both `supplierStoneId` and `offerId` for each item.
For Nivoda, `offerId` is top-level item `id`, `supplierStoneId` is `diamond.id`.

**5. Multi-feed**
Pipeline code is feed-agnostic.
Feed-specific behaviour belongs in `FeedAdapter` implementations and feed registry wiring, not in scheduler, worker, or consolidator.

## Where to change things

**Adding or changing a feed**
1. Implement `FeedAdapter` and register it in `apps/scheduler/src/feeds.ts`, `apps/worker/src/feeds.ts`, and `apps/consolidator/src/feeds.ts`.
2. Add its raw table name to `ALLOWED_RAW_TABLES` in `packages/feed-registry/src/types.ts`.
3. Add schema and indexes for the raw table in `sql/`.
4. Ensure the adapter supports `getCount`, `buildBaseQuery`, `search`, `extractIdentity`, `mapRawToDiamond`.

**Database initialization**
- `sql/bootstrap.sql` - Run this in Supabase SQL Editor for initial setup
- `sql/full_schema.sql` - Complete schema reference
- `sql/migrations/` - Individual migration files

**Heatmap behaviour**
`packages/feed-registry/src/heatmap.ts`, `packages/shared/src/constants.ts` for default thresholds.

**Scheduler run window logic**
`apps/scheduler/src/index.ts`

**Worker ingestion and completion logic**
`apps/worker/src/index.ts`

**Consolidation and watermark advancement**
`apps/consolidator/src/index.ts` — also increments `dataset_versions` for cache invalidation

**Pricing rules and margins**
`packages/pricing-engine`, `packages/shared/src/constants.ts` for base margins, `pricing_rules` table in sql.

**Optional repricing workflow**
When creating or updating a pricing rule, the dashboard form includes an optional "Recalculate pricing now" checkbox (default: OFF).
If enabled, the API creates a repricing job and starts it asynchronously, returning immediately with the job ID.
The job processes available diamonds in batches, only updating rows where pricing changed (compared with cents rounding for money, epsilon for floats).
Email notifications are sent on completion or failure.
Progress is shown in the dashboard with live polling.
Key files: `packages/api/src/routes/pricing-rules.ts`, `packages/api/src/services/reapply-emails.ts`, `packages/database/src/queries/pricing-reapply.ts`.

**Rate limiting:**
- Rate limiting is enforced at the API proxy layer using an in-memory token bucket
- Each API replica rate-limits independently — effective global rate = `per_replica_limit * num_replicas`
- When the limit is exceeded, requests are queued (FIFO) and drained as tokens become available
- If a queued request waits longer than `NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS`, it receives a 429 response
- Workers already have `withRetry` that handles 429s with exponential backoff
- Workers/scheduler do NOT have their own rate limiter — the proxy is the single throttle point

**Timeouts:**
- Proxy upstream timeout: 60 seconds (configurable via `NIVODA_PROXY_TIMEOUT_MS`)
- Client transport timeout: 65 seconds (slightly more than proxy to get a proper 502 response)

**Performance impact:**
- Adds ~50-100ms latency per Nivoda request (internal routing overhead)
- API becomes a critical dependency for the ingestion pipeline

**Troubleshooting:**
- Check API logs for `nivoda_proxy_*` events
- Check for `nivoda_proxy_rate_limited` events if workers are getting 429s
- Trace IDs link worker requests to proxy calls
- Token rotation requires simultaneous restart of all services to avoid 403 errors

**API search caching:**
- In-memory LRU cache per API replica, keyed by dataset version + normalized filters + sort + page
- `dataset_versions` table holds a monotonic counter per feed, incremented by consolidator after successful completion
- API polls `dataset_versions` every 30s; version change makes old cache entries stale (no explicit invalidation)
- Separate count cache (keyed by version + filters only) shared across pages
- ETag based on composite dataset version; returns 304 if client sends matching `If-None-Match`
- `Cache-Control: public, max-age=60, stale-while-revalidate=300` on search responses
- `X-Cache: HIT|MISS` header for observability
- Config: `packages/api/src/services/cache.ts`, constants in `packages/shared/src/constants.ts`

### Nivoda Query Date Filtering

All Nivoda queries (heatmap counts and worker searches) use `updatedAt` date range filters for data consistency:

**Full Runs:**
- `updatedAt.from`: `2000-01-01T00:00:00.000Z` (captures all historical data)
- `updatedAt.to`: Run start timestamp

**Incremental Runs:**
- `updatedAt.from`: `watermark.lastUpdatedAt - 15 minutes` (safety buffer)
- `updatedAt.to`: Run start timestamp

This ensures:
1. **Consistent counts**: Heatmap partition sizes match actual filtered results
2. **Fixed snapshot**: Data doesn't shift during the run (`updatedTo` is locked at run start)
3. **No missed records**: 15-minute safety buffer on incremental runs prevents boundary issues

**Ordering:**
All worker searches use `order: { type: 'createdAt', direction: 'ASC' }` for deterministic pagination, preventing diamonds from shifting between pages during a run.

### Heatmap Algorithm

The scheduler uses adaptive density scanning to partition work by **price per carat** (`dollar_per_carat`):

- **Dense zone** ($0-$5,000/ct): Fixed $50/ct steps, most diamonds here
- **Sparse zone** ($5,000+/ct): Adaptive stepping based on actual density
- **Max workers**: 10 (unified for all run types)
- **Min records per worker**: 1,000 to avoid overhead

## Authentication

Dual auth system (checked in order):

1. **API Key Auth**: `X-API-Key` header → SHA256 hash against `api_keys` table
2. **HMAC Auth**: `X-Client-Id`, `X-Timestamp`, `X-Signature` headers
   - Canonical string: `METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)`
   - Timestamp tolerance: 300 seconds (5 minutes)
   - Secrets stored in `HMAC_SECRETS` env var as JSON
3. Neither valid → 401 Unauthorized

## Key Files

### Pipeline
- `apps/scheduler/src/index.ts` - Job partitioning (uses heatmap)
- `packages/feed-registry/src/heatmap.ts` - Density scanning algorithm
- `apps/worker/src/index.ts` - Data ingestion with retry
- `apps/consolidator/src/index.ts` - Transformation and watermark

### Packages
- `packages/nivoda/src/adapter.ts` - Nivoda GraphQL client
- `packages/nivoda/src/mapper.ts` - Raw to canonical transformation
- `packages/pricing-engine/src/engine.ts` - Pricing rule matching
- `packages/api/src/middleware/auth.ts` - Authentication logic
- `packages/api/src/middleware/nivodaProxyAuth.ts` - Internal proxy auth (constant-time token comparison)
- `packages/api/src/middleware/rateLimiter.ts` - In-memory rate limiter for Nivoda proxy (token bucket with FIFO queue)
- `packages/api/src/routes/nivodaProxy.ts` - Nivoda proxy route (rate-limited, forwards GraphQL to Nivoda)
- `packages/api/src/routes/pricing-rules.ts` - Pricing rule CRUD and repricing job endpoints
- `packages/nivoda/src/proxyTransport.ts` - Proxy transport (used when NIVODA_PROXY_BASE_URL is set)
- `packages/api/src/services/cache.ts` - In-memory LRU search cache with version-keyed invalidation
- `packages/api/src/services/reapply-emails.ts` - Email notifications for repricing jobs
- `packages/database/src/queries/dataset-versions.ts` - Dataset version queries (get/increment)
- `packages/database/src/queries/pricing-reapply.ts` - Repricing job queries (job CRUD, batch scanning, snapshots)
- `packages/database/src/client.ts` - PostgreSQL connection pool

### Schema
- `sql/full_schema.sql` - Database schema (run manually in Supabase)
- `sql/migrations/001_dynamic_pricing_rules.sql` - Dynamic pricing migration (cost-based rules)
- `sql/migrations/003_dataset_versions.sql` - Dataset version table for cache invalidation
- `sql/migrations/005_pricing_reapply_jobs.sql` - Pricing reapply jobs and snapshots tables
- `sql/migrations/006_pricing_reapply_retry.sql` - Add retry and monitoring columns to reapply jobs
- `sql/migrations/007_pricing_reapply_updated_diamonds.sql` - Add updated_diamonds column to track changed rows
- `sql/migrations/008_pricing_reapply_scan_index.sql` - Composite index for efficient reapply job scanning

### Dashboard
- `apps/dashboard/src/App.tsx` - Main app with routing
- `apps/dashboard/src/api/` - API client functions (client.ts, triggers.ts, query.ts, analytics.ts)
- `apps/dashboard/src/pages/` - Page components (Dashboard, Runs, Triggers, Query, etc.)
- `apps/dashboard/src/components/ui/` - Reusable UI components
- `apps/dashboard/src/hooks/useAuth.tsx` - Authentication hook

### Infrastructure
- `infrastructure/terraform/` - Azure IaC modules
- `docker/` - Multi-stage Dockerfiles
- `.github/workflows/` - CI/CD pipelines

## Configuration Constants

```typescript
// From packages/shared/src/constants.ts
WORKER_PAGE_SIZE = 40                  // Pagination size for Nivoda API
CONSOLIDATOR_BATCH_SIZE = 2000         // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100   // Diamonds per batch INSERT (uses UNNEST)
CONSOLIDATOR_CONCURRENCY = 2           // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
CONSOLIDATOR_CLAIM_TTL_MINUTES = 30    // Stuck claim recovery timeout
AUTO_CONSOLIDATION_SUCCESS_THRESHOLD = 0.70  // Min success rate for auto-consolidation
AUTO_CONSOLIDATION_DELAY_MINUTES = 5   // Delay before auto-consolidation on partial success
NIVODA_MAX_LIMIT = 50                  // Nivoda API max page size
TOKEN_LIFETIME_MS = 6 hours            // Nivoda token validity
HEATMAP_MAX_WORKERS = 10               // Max parallel workers (unified for all run types)
HEATMAP_MAX_PRICE = 50000              // Max price per carat to scan
HEATMAP_DENSE_ZONE_THRESHOLD = 5000    // $/ct threshold for dense zone
HEATMAP_DENSE_ZONE_STEP = 50           // Fixed step in dense zone ($/ct)
HEATMAP_INITIAL_STEP = 250             // Initial adaptive step above dense zone ($/ct)

// Nivoda proxy rate limiting (in-memory on API)
NIVODA_PROXY_RATE_LIMIT = 25           // Requests/sec per API replica (env: NIVODA_PROXY_RATE_LIMIT)
NIVODA_PROXY_RATE_LIMIT_WINDOW_MS = 1000
NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS = 60000  // Max queue wait (env: NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS)
NIVODA_PROXY_TIMEOUT_MS = 60000        // Upstream fetch timeout (env: NIVODA_PROXY_TIMEOUT_MS)
NIVODA_PROXY_TRANSPORT_TIMEOUT_MS = 65000  // Client transport timeout (> proxy timeout)

// Nivoda query date filtering
FULL_RUN_START_DATE = '2000-01-01T00:00:00.000Z'  // Start date for full runs
INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES = 15        // Safety buffer for incremental runs

// API search cache (in-memory per replica, version-keyed)
CACHE_MAX_ENTRIES = 500              // LRU size per replica (env: CACHE_MAX_ENTRIES)
CACHE_TTL_MS = 300000                // 5 min safety TTL (env: CACHE_TTL_MS)
CACHE_VERSION_POLL_INTERVAL_MS = 30000  // Version poll interval (env: CACHE_VERSION_POLL_INTERVAL_MS)

// Pricing reapply job monitoring
REAPPLY_JOB_STALL_THRESHOLD_MINUTES = 15  // Threshold for detecting stalled jobs
REAPPLY_MAX_RETRIES = 3                   // Maximum retry attempts for failed jobs
REAPPLY_BATCH_SIZE = 1000                 // Diamonds per batch (env: REAPPLY_BATCH_SIZE)
REAPPLY_MONITOR_INTERVAL_MS = 300000      // How often to check for stalled/retryable jobs (5 min)
REAPPLY_RETRY_BASE_DELAY_MINUTES = 5      // Base delay for first retry
REAPPLY_RETRY_MAX_DELAY_MINUTES = 30      // Maximum retry delay cap
```

**Email notifications**
```bash
RESEND_API_KEY           # Resend API key for sending emails
ALERT_EMAIL_FROM         # From email address (default: onboarding@resend.dev)
ALERT_EMAIL_TO           # Recipient email for alerts and repricing notifications
DASHBOARD_URL            # Dashboard URL for links in emails (e.g., https://dashboard.example.com)
```

**Database pool tuning**
`packages/database/src/client.ts`, env vars `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONN_TIMEOUT_MS`.

## Core Environment Variables

**Required:**
- `DATABASE_URL` or individual `DATABASE_*` vars (HOST, PORT, NAME, USERNAME, PASSWORD)
- `NIVODA_ENDPOINT`, `NIVODA_USERNAME`, `NIVODA_PASSWORD`
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_SERVICE_BUS_CONNECTION_STRING`
- `HMAC_SECRETS` (JSON object of client secrets)

**Optional:**
- `FEED` - Feed to use (default: `nivoda`)
- See `.env.example` and README.md for full list

## When you are unsure

Prefer reading the relevant file over guessing.
Start with these entry points:

- `apps/scheduler/src/index.ts`
- `apps/worker/src/index.ts`
- `apps/consolidator/src/index.ts`
- `packages/feed-registry/src/types.ts` and `packages/feed-registry/src/heatmap.ts`
- `packages/shared/src/constants.ts`
- `sql/full_schema.sql`

## Docs notes

`docs/DIAMOND_OPUS_FULL.md` is generated. Do not hand-edit it.
`docs/DIAMOND_OPUS.md` is curated. Keep it short and current.
