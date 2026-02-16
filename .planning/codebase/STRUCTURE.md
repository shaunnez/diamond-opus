# Codebase Structure

**Analysis Date:** 2026-02-17

## Directory Layout

```
/Users/shaunnesbitt/Desktop/diamond/
├── apps/                       # Runnable services (scheduler, worker, consolidator, dashboards, demo)
│   ├── scheduler/              # Partitioning job orchestrator
│   ├── worker/                 # Data extraction from feeds
│   ├── consolidator/           # Data transformation and watermark advancement
│   ├── dashboard/              # React admin dashboard
│   ├── storefront/             # React public search interface
│   ├── demo-feed-api/          # Mock diamond API for local testing
│   └── demo-feed-seed/         # Seed script for demo data
├── packages/                   # Shared libraries (feed adapters, API, database, pricing)
│   ├── shared/                 # Types, constants, utilities (logging, retry)
│   ├── database/               # PostgreSQL query builders and connection pool
│   ├── feed-registry/          # Feed adapter interface and heatmap algorithm
│   ├── nivoda/                 # Nivoda GraphQL adapter and mapper
│   ├── demo-feed/              # Demo in-memory adapter
│   ├── pricing-engine/         # Pricing rule matching and calculation
│   └── api/                    # Express server, routes, middleware, caching
├── sql/                        # Database schema and migrations
│   ├── full_schema.sql         # Complete schema (run manually once)
│   └── migrations/             # Individual migration files (applied in order)
├── docker/                     # Docker-related configs
│   ├── servicebus-emulator/    # Azure Service Bus emulator setup
│   └── [Dockerfile.app files]  # Multi-stage Docker builds
├── infrastructure/             # Terraform IaC for Azure deployment
│   ├── terraform/environments/ # Prod environment configs
│   └── terraform/modules/      # Reusable Azure resource modules
├── scripts/                    # Operational and CI/CD scripts
├── .planning/                  # GSD workspaces (generated, ignored in git)
├── .github/workflows/          # CI/CD pipelines (tests, builds, deploys)
├── package.json                # Root workspace config
└── tsconfig.json               # TypeScript configuration
```

## Directory Purposes

**apps/scheduler:**
- Purpose: Entry point for scheduled/triggered partitioning jobs
- Contains: Main index.ts, watermark loading, feed registry, service bus sender
- Key files: `src/index.ts` (main loop), `src/feeds.ts` (adapter registration), `src/watermark.js` (Azure Blob loader), `src/service-bus.js` (message sender)
- Output: Work items enqueued to Service Bus

**apps/worker:**
- Purpose: Parallel data extraction (one message = one page)
- Contains: Main index.ts, partition progress tracking, raw diamond upsert, message receiver
- Key files: `src/index.ts` (main loop and page processing), `src/feeds.ts` (adapter registration), `src/service-bus.js` (message receiver/sender), `src/alerts.js` (email notifications)
- Output: Raw diamonds in feed-specific tables; next work item enqueued OR consolidation triggered

**apps/consolidator:**
- Purpose: Transformation and watermark advancement
- Contains: Main index.ts, batch processing, pricing application, watermark saving
- Key files: `src/index.ts` (main loop and consolidation logic), `src/feeds.ts` (adapter registration), `src/watermark.js` (Azure Blob saver), `src/alerts.js` (completion notifications)
- Output: Consolidated diamonds in `diamonds` table; watermark advanced in Azure Blob

**apps/dashboard:**
- Purpose: Admin interface for operations and configuration
- Contains: React components, API client, pages for runs/triggers/analytics/pricing
- Key files: `src/App.tsx` (router), `src/pages/` (Dashboard, Runs, Triggers, Query, Pricing, etc.), `src/api/` (client.ts, query.ts, triggers.ts, analytics.ts), `src/hooks/useAuth.tsx` (auth context)
- Output: HTML/React for browser

**apps/storefront:**
- Purpose: Public search interface for diamond browsing
- Contains: React components, search form, diamond listing, detail view
- Key files: `src/App.tsx` (router), `src/pages/` (Search, Detail), `src/api/` (client functions), `src/hooks/` (auth, search)
- Output: HTML/React for browser

**apps/demo-feed-api:**
- Purpose: Mock Nivoda API for local development
- Contains: Express server serving pre-canned diamond responses
- Key files: `src/index.ts` (server setup)
- Output: GraphQL mock API on port 3001

**apps/demo-feed-seed:**
- Purpose: Populate demo feed table with test data
- Contains: Script using demo-feed adapter to insert test diamonds
- Key files: `src/index.ts` (seeding logic)
- Usage: `npm run seed:demo-feed -- [count]`

**packages/shared:**
- Purpose: Shared types, constants, and utilities
- Contains: Diamond type, message types, pricing types, run types, logging factory, retry utility, error utilities
- Key files:
  - `src/types/diamond.ts` - Diamond and MappedDiamond types
  - `src/types/messages.ts` - WorkItemMessage, WorkDoneMessage, ConsolidateMessage
  - `src/types/pricing.ts` - PricingRule, PricingResult types
  - `src/constants.ts` - WORKER_PAGE_SIZE, CONSOLIDATOR_BATCH_SIZE, timeouts, cache config
  - `src/utils/logger.ts` - createServiceLogger factory
  - `src/utils/retry.ts` - withRetry with exponential backoff

**packages/database:**
- Purpose: Database queries and connection management
- Contains: PostgreSQL queries for diamonds, runs, pricing rules, partition progress, raw diamonds, etc.
- Key files:
  - `src/client.ts` - Connection pool initialization
  - `src/queries/diamonds.ts` - Search, upsert, update pricing
  - `src/queries/runs.ts` - Run metadata CRUD
  - `src/queries/partition-progress.ts` - Partition state tracking
  - `src/queries/raw-diamonds.ts` - Raw diamond upsert
  - `src/queries/pricing-rules.ts` - Rule CRUD and evaluation
  - `src/queries/pricing-reapply.ts` - Repricing job tracking
- Exports: Query functions used by pipeline services and API

**packages/feed-registry:**
- Purpose: Feed adapter abstraction and partitioning algorithm
- Contains: FeedAdapter interface, heatmap scanner, registry
- Key files:
  - `src/types.ts` - FeedAdapter, FeedQuery, HeatmapConfig interfaces
  - `src/heatmap.ts` - scanHeatmap function (density analysis, partitioning)
  - `src/registry.ts` - Feed adapter registration and lookup
- Exports: FeedAdapter interface for implementation

**packages/nivoda:**
- Purpose: Nivoda GraphQL feed adapter
- Contains: GraphQL client, query builders, response mappers
- Key files:
  - `src/adapter.ts` - NivodaAdapter implementation (getCount, buildBaseQuery, search, etc.)
  - `src/mapper.ts` - mapRawToDiamond logic (raw payload → canonical Diamond)
  - `src/client.ts` - GraphQL query builder
  - `src/proxyTransport.ts` - Optional proxy transport for rate-limiting
- Exports: NivodaAdapter class for registration

**packages/demo-feed:**
- Purpose: Demo in-memory feed adapter for local testing
- Contains: In-memory diamond store, adapter implementation
- Key files:
  - `src/adapter.ts` - DemoAdapter implementation (in-memory getCount, search, map, etc.)
  - `src/data.ts` - Demo diamond fixtures
- Exports: DemoAdapter class for registration

**packages/pricing-engine:**
- Purpose: Dynamic pricing rule evaluation
- Contains: PricingEngine class, rule matching logic, margin calculation
- Key files:
  - `src/engine.ts` - PricingEngine class with applyPricing, findMatchingRule, calculatePricing
  - `src/types.ts` - Internal pricing types
- Exports: PricingEngine class

**packages/api:**
- Purpose: REST API for querying diamonds and managing pipeline
- Contains: Express app, routes, middleware, caching, OpenAPI spec
- Key files:
  - `src/server.ts` - createApp, startServer; initializes cache, currency, reapply monitor
  - `src/index.ts` - Export and entry point
  - `src/routes/index.ts` - Route registration
  - `src/routes/diamonds.ts` - Search, detail, list endpoints
  - `src/routes/pricing-rules.ts` - CRUD and repricing trigger endpoints
  - `src/routes/analytics.ts` - Dashboard stats endpoints
  - `src/routes/triggers.ts` - Scheduler trigger endpoints
  - `src/routes/nivodaProxy.ts` - Internal Nivoda GraphQL proxy (rate-limited, authenticated)
  - `src/middleware/auth.ts` - API Key and HMAC validation
  - `src/middleware/rateLimiter.ts` - Token bucket rate limiter (in-memory)
  - `src/middleware/nivodaProxyAuth.ts` - Constant-time token validation
  - `src/services/cache.ts` - In-memory LRU cache with version-key invalidation
  - `src/services/reapply-monitor.ts` - Background job to detect stalled/retryable repricing jobs
  - `src/swagger/generator.ts` - OpenAPI spec generation

**sql/:**
- Purpose: Database schema and migrations
- Key files:
  - `full_schema.sql` - Complete schema (idempotent, run once)
  - `migrations/001_dynamic_pricing_rules.sql` - Add pricing_rules table
  - `migrations/003_dataset_versions.sql` - Add dataset_versions for cache invalidation
  - `migrations/005_pricing_reapply_jobs.sql` - Add repricing job tracking
  - `migrations/006_pricing_reapply_retry.sql` - Add retry/monitoring columns
  - `migrations/007_pricing_reapply_updated_diamonds.sql` - Track changed rows
  - `migrations/008_pricing_reapply_scan_index.sql` - Performance indexes

## Key File Locations

**Entry Points:**
- `apps/scheduler/src/index.ts`: Scheduler main (loads env, starts heatmap scan)
- `apps/worker/src/index.ts`: Worker main (message loop, page processing)
- `apps/consolidator/src/index.ts`: Consolidator main (message loop, batch transformation)
- `packages/api/src/server.ts`: API server startup (createApp, startServer)
- `apps/dashboard/src/main.tsx`: Dashboard Vite entry
- `apps/storefront/src/main.tsx`: Storefront Vite entry

**Configuration:**
- `package.json`: Root workspace, build/dev/test scripts
- `packages/shared/src/constants.ts`: All tunable constants (timeouts, batch sizes, cache settings)
- `sql/full_schema.sql`: Complete database schema reference
- `.env.example`: Template for required/optional environment variables
- `infrastructure/terraform/environments/prod/`: Terraform variables and main config

**Core Logic:**
- `packages/feed-registry/src/heatmap.ts`: Density-based partitioning algorithm
- `packages/pricing-engine/src/engine.ts`: Pricing rule matching and margin calculation
- `packages/api/src/services/cache.ts`: In-memory LRU search result caching
- `packages/database/src/queries/`: All database interactions (diamonds, runs, pricing, partition progress)
- `packages/nivoda/src/adapter.ts`: Nivoda GraphQL integration
- `packages/api/src/middleware/rateLimiter.ts`: Token bucket rate limiting for Nivoda proxy

**Testing:**
- `packages/*//__tests__/`: Unit tests (Vitest)
- `apps/*//__tests__/`: Integration tests
- `tests/`: E2E tests (Docker-based)
- `package.json`: `npm run test` (all workspaces), `npm run test -w @diamond/nivoda` (specific)

## Naming Conventions

**Files:**
- `.ts` - TypeScript source files
- `.tsx` - TypeScript React components
- `.test.ts` / `.spec.ts` - Test files (co-located with source)
- `index.ts` / `index.tsx` - Barrel files exporting public API
- `types.ts` - Type definitions
- `*.adapter.ts` - Feed adapter implementations
- `*.mapper.ts` - Data transformation logic

**Directories:**
- `src/` - Source code
- `dist/` - Compiled output (ESM)
- `__tests__/` - Test files (mirroring src structure)
- `queries/` - Database query modules (packages/database)
- `routes/` - Express route handlers (packages/api)
- `middleware/` - Express middleware (packages/api)
- `pages/` - React page components (apps/dashboard, apps/storefront)
- `components/` - Reusable React components
- `hooks/` - React hooks
- `utils/` - Utility functions
- `api/` - API client functions
- `types/` - TypeScript type definitions

## Where to Add New Code

**New Feature (e.g., new pricing rule type):**
- Primary code: `packages/pricing-engine/src/engine.ts` (add rule matching logic)
- Database: `sql/migrations/XXX_*.sql` (add new columns/constraints to pricing_rules)
- Tests: `packages/pricing-engine/__tests__/engine.test.ts`
- Schema update: Add migration file with ISO timestamp prefix

**New Component/Module:**
- API endpoint: `packages/api/src/routes/[feature].ts` (new route module), register in `packages/api/src/routes/index.ts`
- Database queries: `packages/database/src/queries/[feature].ts`
- API middleware: `packages/api/src/middleware/[feature].ts` (if cross-cutting)
- Types: Add to `packages/shared/src/types/` if shared, else co-locate with feature

**New Feed Adapter:**
- Adapter implementation: `packages/[feed-name]/src/adapter.ts` (implement FeedAdapter interface)
- Mapper: `packages/[feed-name]/src/mapper.ts` (implement mapRawToDiamond)
- Raw table: Add to `sql/full_schema.sql` (CREATE TABLE raw_diamonds_[feed_name])
- Registration: Add FeedAdapter to `apps/scheduler/src/feeds.ts`, `apps/worker/src/feeds.ts`, `apps/consolidator/src/feeds.ts`
- Registry: Update `ALLOWED_RAW_TABLES` in `packages/feed-registry/src/types.ts`

**Utilities:**
- Shared utilities: `packages/shared/src/utils/` (logging, retry, etc.)
- Database utilities: `packages/database/src/queries/` (query builders)
- API utilities: `packages/api/src/services/` (cache, currency exchange, etc.)

**Middleware:**
- Express middleware: `packages/api/src/middleware/` (auth, validation, error handling)
- Pattern: Export function or instance; register in `packages/api/src/server.ts` or route file

**React Components:**
- Dashboard components: `apps/dashboard/src/components/` or `apps/dashboard/src/pages/`
- Storefront components: `apps/storefront/src/components/` or `apps/storefront/src/pages/`
- Shared UI library: Create `packages/ui/` if component sharing between dashboard/storefront needed

## Special Directories

**node_modules/:**
- Generated by npm install; excluded from git
- Never edit directly; update package.json and run npm install

**dist/:**
- Compiled TypeScript output (ESM)
- Generated by `npm run build`
- Excluded from git; regenerated on deployment

**.planning/codebase/:**
- GSD workspace directory for this analysis
- Generated by orchestrator; contains ARCHITECTURE.md, STRUCTURE.md, etc.
- Excluded from git (via .gitignore)

**sql/migrations/:**
- Individual database migration files (not auto-applied)
- Named with ISO timestamp prefix (e.g., `001_dynamic_pricing_rules.sql`)
- Apply in order manually or via CI/CD script
- Committed to git for reproducibility

**docker/:**
- Docker build context and service emulator configs
- `docker-compose.yml` at root provides local dev environment
- Multi-stage Dockerfiles minimize image size for production

---

*Structure analysis: 2026-02-17*
