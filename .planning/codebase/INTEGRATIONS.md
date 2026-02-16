# External Integrations

**Analysis Date:** 2026-02-17

## APIs & External Services

**Nivoda GraphQL API:**
- Service: Nivoda diamond supplier API
- What it's used for: Fetching diamond inventory, search, holds, orders
- SDK/Client: `graphql-request` 6.1.0 in `packages/nivoda/src/adapter.ts`
- Endpoint: `NIVODA_ENDPOINT` environment variable
- Auth: Username/password (`NIVODA_USERNAME`, `NIVODA_PASSWORD`) with token-based session
- Proxy: Optional internal proxy via `packages/api/src/routes/nivodaProxy.ts` with rate limiting (25 req/sec per replica)
- Rate limiting: In-memory token bucket with FIFO queue on API proxy layer
- Timeout: 60 seconds upstream, 65 seconds client-side transport

**Frankfurter API:**
- Service: Currency conversion API
- What it's used for: USD to NZD exchange rate conversion for pricing
- URL: `https://api.frankfurter.dev/v1/latest?base=USD&symbols=NZD`
- Used in: `packages/api/src/services/currency.ts`
- Refresh interval: 24 hours (cached)

## Data Storage

**Databases:**
- Type: PostgreSQL 16+
- Provider: Supabase (production) or self-managed
- Connection: Via `DATABASE_URL` connection string or individual `DATABASE_*` vars (`HOST`, `PORT`, `NAME`, `USERNAME`, `PASSWORD`)
- Client: `pg` 8.11.3 in `packages/database/src/client.ts`
- Pool configuration: Tunable via `PG_POOL_MAX` (default 2), `PG_IDLE_TIMEOUT_MS` (default 30s), `PG_CONN_TIMEOUT_MS` (default 10s)
- ORM: Raw SQL queries (no ORM layer)
- Schema: `sql/full_schema.sql` defines all tables, migrations in `sql/migrations/`

**File Storage:**
- Azure Blob Storage (production and local via Azurite emulator)
- Containers:
  - `watermarks` - Feed watermark state (last updated timestamps)
  - `heatmaps` - Heatmap partition data (transient)
- Connection: `AZURE_STORAGE_CONNECTION_STRING`
- Client: `@azure/storage-blob` 12.30.0

**Caching:**
- In-memory LRU cache per API replica (search results)
  - Max entries: `CACHE_MAX_ENTRIES` (default 500, configurable)
  - TTL: `CACHE_TTL_MS` (default 5 minutes)
  - Version-keyed invalidation (polling `dataset_versions` table every 30s)
- Analytics cache (shorter TTL of 15 seconds, max 50 entries)
- Implementation: `packages/api/src/services/cache.ts`

## Message Queue

**Azure Service Bus:**
- Provider: Azure Service Bus (production) or Service Bus Emulator (local)
- Connection: `AZURE_SERVICE_BUS_CONNECTION_STRING`
- Queues:
  - `work-items` - Partitioned work for individual workers
  - `work-done` - Worker completion signals
  - `consolidate` - Consolidation trigger messages
- Used in: `apps/scheduler`, `apps/worker`, `apps/consolidator`
- Client: `@azure/service-bus` 7.9.3

## Authentication & Identity

**API Auth Provider:** Custom dual-auth system in `packages/api/src/middleware/auth.ts`
- API Key Authentication:
  - Header: `X-API-Key`
  - Storage: SHA256 hashes stored in `api_keys` database table
  - Last-used tracking for API key rotation monitoring
- HMAC Authentication:
  - Headers: `X-Client-Id`, `X-Timestamp`, `X-Signature`
  - Canonical string: `METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)`
  - Secrets: Stored in `HMAC_SECRETS` JSON environment variable
  - Timestamp tolerance: 300 seconds (5 minutes)
  - Constant-time comparison in `packages/api/src/middleware/nivodaProxyAuth.ts`
- Nivoda Session:
  - GraphQL query-based authentication
  - Token validity: 6 hours (`TOKEN_LIFETIME_MS`)
  - 5-minute expiry buffer for refresh (`TOKEN_EXPIRY_BUFFER_MS`)

## Monitoring & Observability

**Error Tracking & Alerts:**
- Email notifications via Resend for:
  - Worker failures and retries (`apps/worker/src/alerts.ts`)
  - Consolidator failures (`apps/consolidator/src/alerts.ts`)
  - Repricing job completion/failure (`packages/api/src/services/reapply-emails.ts`)
- Configured via: `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`, `RESEND_API_KEY`

**Logs:**
- Structured logging with Pino (`pino` 8.17.2) in `packages/shared/src`
- Pretty-printed in development mode
- Service-specific loggers created via `createServiceLogger`
- Trace IDs propagated across service calls for request correlation

**Metrics:**
- Nivoda proxy instrumentation: logs proxy rate-limit events, queue depth
- Cache hit/miss tracking: `X-Cache: HIT|MISS` header on search responses
- Dataset version polling for cache invalidation monitoring

## CI/CD & Deployment

**Hosting:**
- Azure Container Apps (via Terraform IaC)
- Infrastructure as Code: `infrastructure/terraform/`
  - Terraform state backend: Azure Blob Storage
  - Providers: hashicorp/azurerm 3.0+
  - Modules: service-bus, container-apps, etc.

**CI Pipeline:**
- GitHub Actions workflows in `.github/workflows/`
- Build commands:
  - `npm run build` - All packages and apps
  - `npm run build:backend` - Backend services only
  - `npm run build:dashboard` - Dashboard app
  - `npm run build:storefront` - Storefront app

**Containerization:**
- Multi-stage Dockerfiles in `docker/`
- Images for: API, scheduler, worker, consolidator, dashboard, storefront, demo-feed-api
- Base: Node.js official images
- Build optimization: Separate build and runtime stages

## Environment Configuration

**Required Environment Variables:**
- `DATABASE_URL` or (`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`)
- `NIVODA_ENDPOINT` - GraphQL endpoint URL
- `NIVODA_USERNAME`, `NIVODA_PASSWORD` - Nivoda API credentials
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Blob Storage connection
- `AZURE_SERVICE_BUS_CONNECTION_STRING` - Azure Service Bus connection
- `HMAC_SECRETS` - JSON object of client ID → secret mappings
- `RESEND_API_KEY` - Email service API key
- `ALERT_EMAIL_TO` - Alert recipient email
- `ALERT_EMAIL_FROM` - Alert sender email (default: onboarding@resend.dev)
- `DASHBOARD_URL` - Dashboard URL for links in emails

**Optional Environment Variables:**
- `FEED` - Feed adapter to use (default: `nivoda`, also supports `demo`)
- `NODE_ENV` - Environment mode (development/production)
- `NIVODA_PROXY_BASE_URL` - Use internal proxy instead of direct Nivoda connection
- `NIVODA_PROXY_RATE_LIMIT` - Requests/sec per API replica (default: 25)
- `NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS` - Max queue wait time (default: 60s)
- `NIVODA_PROXY_TIMEOUT_MS` - Upstream timeout (default: 60s)
- `NIVODA_REQUEST_TIMEOUT_MS` - Client request timeout (default: 45s)
- `PG_POOL_MAX` - Max PostgreSQL connections (default: 2)
- `PG_IDLE_TIMEOUT_MS` - Idle connection timeout (default: 30s)
- `PG_CONN_TIMEOUT_MS` - Connection timeout (default: 10s)
- `CONSOLIDATOR_CONCURRENCY` - Concurrent batch upserts (default: 2)
- `CACHE_MAX_ENTRIES` - Max search cache entries (default: 500)
- `CACHE_TTL_MS` - Cache safety TTL (default: 5 min)
- `CACHE_VERSION_POLL_INTERVAL_MS` - Version polling interval (default: 30s)
- `ANALYTICS_CACHE_MAX_ENTRIES` - Max analytics cache entries (default: 50)
- `ANALYTICS_CACHE_TTL_MS` - Analytics cache TTL (default: 15s)
- `REAPPLY_BATCH_SIZE` - Pricing reapply batch size (default: 1000)

**Secrets Location:**
- Environment variables (set via Azure Key Vault in production, .env files in local dev)
- HMAC secrets in `HMAC_SECRETS` JSON environment variable (not committed)
- Database credentials via `DATABASE_URL` or separate vars (not committed)
- API keys and tokens not stored in code or committed files

## Webhooks & Callbacks

**Incoming:**
- Service Bus messages processed by worker and consolidator
- Nivoda API GraphQL queries from scheduler/worker/API
- Not currently exposed as public webhooks

**Outgoing:**
- Email notifications via Resend for alerts and repricing job updates
- No outgoing webhooks to external systems

## External Dependencies Summary

| Service | Purpose | SDK | Environment |
|---------|---------|-----|-------------|
| Nivoda GraphQL API | Diamond inventory search | graphql-request | NIVODA_ENDPOINT, NIVODA_USERNAME, NIVODA_PASSWORD |
| PostgreSQL | Primary data store | pg | DATABASE_URL |
| Azure Service Bus | Work queue & messaging | @azure/service-bus | AZURE_SERVICE_BUS_CONNECTION_STRING |
| Azure Blob Storage | Watermarks & heatmaps | @azure/storage-blob | AZURE_STORAGE_CONNECTION_STRING |
| Resend | Email notifications | resend | RESEND_API_KEY |
| Frankfurter | Currency conversion | fetch (native) | FRANKFURTER_API_URL (hardcoded) |
| Azure Container Apps | Hosting | @azure/arm-appcontainers | (via Terraform) |
| Azure Container Registry | Image storage | (via Docker) | (via Terraform) |

---

*Integration audit: 2026-02-17*
