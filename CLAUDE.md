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
7. Last successful worker triggers consolidation (atomic counter)

**Stage 2: Consolidation**
1. **Consolidator** receives `ConsolidateMessage` from Service Bus
2. Validates all workers completed successfully (skips if any failed)
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

### Failure Handling

- If **ANY** worker fails → skip consolidation, do **NOT** advance watermark
- Last worker triggers consolidation via atomic counter increment
- Consolidator failure → send alert via Resend, do **NOT** advance watermark
- Failed runs can be force-consolidated with `force: true` flag

### Database

- **No local Postgres** - Supabase only via `DATABASE_URL`
- All prices stored in **dollars** as DECIMAL(12,2)
- Soft deletes: `status = 'deleted'` and `deleted_at` timestamp
- Connection pool: min 2, max 15 connections

### Nivoda API

- Token caching: 6 hour lifetime, re-auth 5 minutes before expiry
- `searchDiamonds` enforces max limit of 50 items per request
- All queries wrapped with `as(token: $token)` for authentication
- Use `withRetry` utility for transient failure handling

### Heatmap Algorithm

The scheduler uses adaptive density scanning to partition work:

- **Dense zone** ($0-$20,000): Fixed $100 steps, most diamonds here
- **Sparse zone** ($20,000+): Adaptive stepping based on actual density
- **Max workers**: 30 for full runs, 10 for incremental
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
- `packages/database/src/client.ts` - PostgreSQL connection pool

### Schema
- `sql/bootstrap.sql` - Database schema (run manually in Supabase)
- `sql/migrations/001_add_indexes.sql` - Performance indexes

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
CONSOLIDATOR_CONCURRENCY = 5           // Concurrent batch upserts (respects 30 conn pool)
NIVODA_MAX_LIMIT = 50                  // Nivoda API max page size
TOKEN_LIFETIME_MS = 6 hours            // Nivoda token validity
HEATMAP_MAX_WORKERS = 30               // Max parallel workers
```

### Consolidator Performance

The consolidator is optimized for 500k+ records:

- **Batch upserts**: 100 diamonds per INSERT using PostgreSQL `UNNEST`
- **Multi-replica safe**: Uses `FOR UPDATE SKIP LOCKED` for parallel processing
- **Connection pool aware**: 5 concurrent operations (safe for 30-connection Supabase pool)

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
| `RESEND_API_KEY` | Resend API key for alerts |
| `ALERT_EMAIL_TO` | Alert recipient email |
| `ALERT_EMAIL_FROM` | Alert sender email |
| `AZURE_SUBSCRIPTION_ID` | API: Azure subscription for scheduler job trigger |
| `AZURE_RESOURCE_GROUP` | API: Resource group for scheduler job trigger |
| `AZURE_SCHEDULER_JOB_NAME` | API: Container Apps Job name for scheduler |
| `VITE_API_URL` | Dashboard: API base URL (default: http://localhost:3000) |

## Debugging Tips

1. **Worker not processing**: Check Service Bus queue in Azure Portal
2. **Consolidation skipped**: Check `run_metadata` table for failed workers
3. **Pricing wrong**: Check `pricing_rules` table priority ordering
4. **API 401**: Verify API key is hashed correctly, check `last_used_at`
5. **Watermark not advancing**: Check consolidator logs for errors
