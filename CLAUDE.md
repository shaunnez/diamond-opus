# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build all packages (in dependency order, including dashboard)
npm run build

# Build backend packages only (excludes dashboard)
npm run build:backend

# Build dashboard only
npm run build:dashboard

# Run tests
npm run test

# Run specific package tests
npm run test -w @diamond/nivoda
npm run test -w @diamond/pricing-engine

# Development servers
npm run dev:api          # API on port 3000
npm run dev:scheduler    # Run scheduler once (exits)
npm run dev:worker       # Long-running worker
npm run dev:consolidator # Long-running consolidator
npm run dev:dashboard    # Dashboard on port 5173 (Vite)

# Manual operations
npm run worker:retry         # Retry failed partitions
npm run consolidator:trigger # Manually trigger consolidation

# Generate Swagger spec
npm run swagger

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Architecture Overview

This is a TypeScript monorepo using npm workspaces for diamond inventory management. It implements a **two-stage data pipeline** that ingests diamond data from Nivoda, applies pricing rules, and serves via REST API.

### System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────▶│ Service Bus │────▶│   Workers   │
│ (cron job)  │     │  (queues)   │     │ (consumers) │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                      │
       │ reads                               │ writes
       ▼                                      ▼
┌─────────────┐                         ┌─────────────┐
│Azure Storage│                         │raw_diamonds │
│ (watermark) │                         │  _nivoda    │
└─────────────┘                         └─────────────┘
                                              │
                                              ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   diamonds  │◀────│ Consolidator│
                    │  (canon.)   │     │  (consumer) │
                    └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  REST API   │
                    │  (Express)  │
                    └─────────────┘
```

### Two-Stage Pipeline

**Stage 1: Raw Ingestion (Scheduler → Workers)**
1. **Scheduler** reads watermark from Azure Blob Storage
2. Performs **heatmap scan** to analyze Nivoda inventory density by price
3. Partitions workload into price ranges, creating `WorkItemMessage` for each
4. Sends work items to Azure Service Bus `work-items` queue
5. **Workers** consume messages, fetch diamonds via Nivoda GraphQL API
6. Write raw JSON payloads to `raw_diamonds_nivoda` table
7. Last worker triggers consolidation check (atomic counter):
   - 100% success → immediate consolidation
   - ≥70% success → delayed consolidation (5 min) with `force: true`
   - <70% success → skip consolidation

**Stage 2: Consolidation**
1. **Consolidator** receives `ConsolidateMessage` from Service Bus
2. Validates workers (skips if failures and not `force: true`)
3. Batches raw diamonds, maps to canonical schema
4. Applies pricing rules from `pricing_rules` table
5. Upserts into `diamonds` table
6. **Only on success**: Advances watermark in Azure Blob Storage

### Package Dependencies

```
@diamond/shared (types, utils, constants, logging)
    ↓
@diamond/database (pg client, queries)
    ↓
@diamond/nivoda (GraphQL adapter, mapper)
@diamond/pricing-engine (rule matching)
    ↓
@diamond/api (Express routes, middleware)
apps/scheduler, apps/worker, apps/consolidator

@diamond/dashboard (React + Vite, standalone)
```

## Critical Rules

### Identity Mapping (IMPORTANT)

```
Nivoda Response:
{
  "id": "abc123",          ← This is OFFER_ID (use for ordering/holds)
  "diamond": {
    "id": "xyz789"         ← This is SUPPLIER_STONE_ID (use for tracking/dedup)
  }
}
```

- `offer_id` = `items[].id` → Use for ordering/purchasing operations
- `supplier_stone_id` = `diamond.id` → Use for tracking/deduplication

### Counting Diamonds (CRITICAL)

- **ALWAYS** use `diamonds_by_query_count` for accurate counts
- **NEVER** use `total_count` from paginated search results (unreliable)
- The scheduler heatmap relies on accurate counts for partitioning

### Failure Handling & Auto-Consolidation

- Last worker (success or failure) checks if all workers are done
- If **ALL workers succeed** → trigger consolidation immediately
- If **≥70% workers succeed** → auto-start consolidation after 5-minute delay (with `force: true`)
- If **<70% workers succeed** → skip consolidation, do **NOT** advance watermark
- Consolidator failure → send alert via Resend, do **NOT** advance watermark
- Failed runs can be force-consolidated with `force: true` flag
- The 5-minute delay uses Service Bus scheduled messages to allow in-flight retries to finish

### Database

- **No local Postgres** - Supabase only via `DATABASE_URL`
- All prices stored in **dollars** as DECIMAL(12,2)
- Soft deletes: `status = 'deleted'` and `deleted_at` timestamp
- Connection pool: configurable via PG_POOL_MAX (default 2), PG_IDLE_TIMEOUT_MS, PG_CONN_TIMEOUT_MS

### Nivoda API

- Token caching: 6 hour lifetime, re-auth 5 minutes before expiry
- `searchDiamonds` enforces max limit of 50 items per request
- All queries wrapped with `as(token: $token)` for authentication
- Use `withRetry` utility for transient failure handling

### Nivoda Proxy (Production)

For production environments where Nivoda requires domain allowlisting:

**Configuration:**
- `NIVODA_PROXY_BASE_URL` - Set to the API base URL (e.g., `https://api.fourwords.co.nz`)
- `INTERNAL_SERVICE_TOKEN` - Shared secret between workers/scheduler and the API proxy
- `NIVODA_PROXY_RATE_LIMIT` - Max requests per second per API replica (default: 50)
- `NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS` - Max queue wait before 429 (default: 60000)
- `NIVODA_PROXY_TIMEOUT_MS` - Upstream fetch timeout (default: 60000)

**How it works:**
- When `NIVODA_PROXY_BASE_URL` is set, workers and scheduler route all Nivoda API calls through the internal API
- The API acts as a proxy with a stable, allowlisted domain
- Internal calls are authenticated via `x-internal-token` header (different from client API auth)

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

The scheduler uses adaptive density scanning to partition work:

- **Dense zone** ($0-$20,000): Fixed $100 steps, most diamonds here
- **Sparse zone** ($20,000+): Adaptive stepping based on actual density
- **Max workers**: 1000 for full runs, 10 for incremental
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
- `apps/scheduler/src/heatmap.ts` - Density scanning algorithm
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
- `packages/nivoda/src/proxyTransport.ts` - Proxy transport (used when NIVODA_PROXY_BASE_URL is set)
- `packages/database/src/client.ts` - PostgreSQL connection pool

### Schema
- `sql/full_schema.sql` - Database schema (run manually in Supabase)
- `sql/migrations/001_dynamic_pricing_rules.sql` - Dynamic pricing migration (cost-based rules)

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
RECORDS_PER_WORKER = 5000              // Target records per worker
WORKER_PAGE_SIZE = 30                  // Pagination size for Nivoda API
CONSOLIDATOR_BATCH_SIZE = 2000         // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100   // Diamonds per batch INSERT (uses UNNEST)
CONSOLIDATOR_CONCURRENCY = 2           // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
CONSOLIDATOR_CLAIM_TTL_MINUTES = 30    // Stuck claim recovery timeout
AUTO_CONSOLIDATION_SUCCESS_THRESHOLD = 0.70  // Min success rate for auto-consolidation
AUTO_CONSOLIDATION_DELAY_MINUTES = 5   // Delay before auto-consolidation on partial success
NIVODA_MAX_LIMIT = 50                  // Nivoda API max page size
TOKEN_LIFETIME_MS = 6 hours            // Nivoda token validity
HEATMAP_MAX_WORKERS = 1000             // Max parallel workers (incremental capped to 10)

// Nivoda proxy rate limiting (in-memory on API)
NIVODA_PROXY_RATE_LIMIT = 50           // Requests/sec per API replica (env: NIVODA_PROXY_RATE_LIMIT)
NIVODA_PROXY_RATE_LIMIT_WINDOW_MS = 1000
NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS = 60000  // Max queue wait (env: NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS)
NIVODA_PROXY_TIMEOUT_MS = 60000        // Upstream fetch timeout (env: NIVODA_PROXY_TIMEOUT_MS)
NIVODA_PROXY_TRANSPORT_TIMEOUT_MS = 65000  // Client transport timeout (> proxy timeout)

// Nivoda query date filtering
FULL_RUN_START_DATE = '2000-01-01T00:00:00.000Z'  // Start date for full runs
INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES = 15        // Safety buffer for incremental runs
```

### Consolidator Performance

The consolidator is optimized for 500k+ records with multi-replica safety:

- **Claim pattern**: Uses `claimUnconsolidatedRawDiamonds` with atomic status update to prevent duplicate processing
- **Stuck claim recovery**: Claims held > 30 minutes are reset to pending at consolidation start
- **Batch upserts**: 100 diamonds per INSERT using PostgreSQL `UNNEST`
- **Churn reduction**: Only updates `diamonds` table when data actually changed (source_updated_at, price, status)
- **Connection pool aware**: Concurrency limited by CONSOLIDATOR_CONCURRENCY (default 2, should not exceed PG_POOL_MAX)

| Records | Single Replica | 3 Replicas |
|---------|----------------|------------|
| 500,000 | ~4-6 min | ~1-2 min |

## Common Tasks

### Adding a new API endpoint
1. Add route in `packages/api/src/routes/`
2. Add types in `packages/shared/src/types/`
3. Add database query in `packages/database/src/queries/`
4. Update Swagger annotations

### Modifying pricing logic
1. Update rules in `pricing_rules` table (database)
2. Logic is in `packages/pricing-engine/src/engine.ts`
3. Rule matching: lower priority number = higher precedence
4. **Dynamic pricing model**: Rules match by `stone_type` (natural/lab/fancy) and cost range (`price_min`/`price_max`)
5. Base margins: Natural = 40%, Lab = 79%, Fancy = 40% (constants in `packages/shared/src/constants.ts`)
6. Rules store `margin_modifier` (percentage points). Effective margin = base margin + modifier
7. Markup ratio = 1 + (effective margin / 100). e.g., 79% base + 6% modifier = 85% → 1.85x
8. Stone type derived from diamond: fancy (has `fancyColor`) > lab (`labGrown`) > natural

### Adding a new diamond attribute
1. Update `Diamond` type in `packages/shared/src/types/diamond.ts`
2. Update mapper in `packages/nivoda/src/mapper.ts`
3. Update schema in `sql/bootstrap.sql`
4. Add migration if needed in `sql/migrations/`

### Modifying the dashboard
1. Pages are in `apps/dashboard/src/pages/`
2. API functions are in `apps/dashboard/src/api/`
3. Reusable components are in `apps/dashboard/src/components/ui/`
4. Dashboard uses React Query for data fetching
5. Styling uses Tailwind CSS

## Testing

```bash
# Run all tests
npm run test

# Run specific package
npm run test -w @diamond/pricing-engine

# Watch mode
npm run test:watch -w @diamond/nivoda

# Type checking (catches more errors than tests)
npm run typecheck
```

Test utilities are in `packages/shared/src/testing/`:
- `factories.ts` - Test data builders
- `mocks.ts` - Mock implementations

## Environment Variables

Required variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `NIVODA_ENDPOINT` | Nivoda GraphQL API URL |
| `NIVODA_USERNAME` | Nivoda account email |
| `NIVODA_PASSWORD` | Nivoda account password |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage for watermarks |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus for queues |
| `HMAC_SECRETS` | JSON object of client secrets |
| `RESEND_API_KEY` | Resend API key for alerts (worker + consolidator) |
| `ALERT_EMAIL_TO` | Alert recipient email (worker + consolidator) |
| `ALERT_EMAIL_FROM` | Alert sender email (worker + consolidator) |
| `AZURE_SUBSCRIPTION_ID` | API: Azure subscription for scheduler job trigger |
| `AZURE_RESOURCE_GROUP` | API: Resource group for scheduler job trigger |
| `AZURE_SCHEDULER_JOB_NAME` | API: Container Apps Job name for scheduler |
| `NIVODA_DISABLE_STAGING_FIELDS` | Set to `true` to exclude fields causing GraphQL enum errors on staging (clarity, floInt, floCol, labgrown_type) |
| `NIVODA_PROXY_BASE_URL` | API base URL for proxy mode (e.g., `https://api.fourwords.co.nz`) |
| `INTERNAL_SERVICE_TOKEN` | Shared secret for internal proxy authentication |
| `NIVODA_PROXY_RATE_LIMIT` | API: Max proxy requests/sec per replica (default 50) |
| `NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS` | API: Max queue wait before 429 (default 60000) |
| `NIVODA_PROXY_TIMEOUT_MS` | API: Upstream fetch timeout in ms (default 60000) |

### Database Pooling (Supabase Pro Micro)

Connection pooling is critical for Supabase shared pooling. Set these per-service to avoid exhausting pooler connections when scaling replicas.

| Variable | Description | Default |
|----------|-------------|---------|
| `PG_POOL_MAX` | Max connections per replica | 2 |
| `PG_IDLE_TIMEOUT_MS` | Idle connection timeout | 30000 |
| `PG_CONN_TIMEOUT_MS` | Connection timeout | 10000 |
| `CONSOLIDATOR_CONCURRENCY` | Concurrent batch upserts (must not exceed PG_POOL_MAX) | 2 |

**Recommended per-service settings:**

| Service | PG_POOL_MAX | PG_IDLE_TIMEOUT_MS | PG_CONN_TIMEOUT_MS | Notes |
|---------|-------------|--------------------|--------------------|-------|
| Worker | 1 | 2000 | 10000 | Release idle connections fast; allow pgbouncer queuing time at 200 replicas |
| Consolidator | 2 | 5000 | 5000 | Set CONSOLIDATOR_CONCURRENCY=2 |
| API | 2 | 30000 | 5000 | Proxy requests don't use DB; 2 is sufficient for client endpoints |
| Scheduler | 2 | 5000 | 5000 | Short-lived job |

**Scaling example** (Supabase Pro Micro ~60 pooler connections, transaction mode recommended):
- 200 worker replicas × 1 connection = 200 client connections (pgbouncer transaction mode shares backend slots)
- 3 consolidator replicas × 2 connections = 6
- 3 API replicas × 2 connections = 6
- 1 scheduler × 2 connections = 2
- **Total client connections: 214** — with transaction mode, concurrent backend connections are much lower (~30-40) since workers are mostly idle waiting for HTTP responses

## Debugging Tips

1. **Worker not processing**: Check Service Bus queue in Azure Portal
2. **Consolidation skipped**: Check `run_metadata` table for failed workers
3. **Pricing wrong**: Check `pricing_rules` table priority ordering, stone_type, price_min/price_max, and margin_modifier values
4. **API 401**: Verify API key is hashed correctly, check `last_used_at`
5. **Watermark not advancing**: Check consolidator logs for errors
