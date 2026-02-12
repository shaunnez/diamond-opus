# CLAUDE.md

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

# Run locally
npm run dev:api
npm run dev:scheduler
npm run dev:worker
npm run dev:consolidator
npm run dev:dashboard
npm run dev:demo-api

# Checks
npm run typecheck
npm run test
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

**Apps**: `apps/scheduler`, `apps/worker`, `apps/consolidator`, `apps/dashboard`, `apps/demo-feed-api`, `apps/demo-feed-seed`

**Packages**: `packages/shared`, `packages/database`, `packages/feed-registry`, `packages/nivoda`, `packages/demo-feed`, `packages/pricing-engine`, `packages/api`

**Schema**: `sql/full_schema.sql`, `sql/migrations`

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

**Heatmap behaviour**
`packages/feed-registry/src/heatmap.ts`, `packages/shared/src/constants.ts` for default thresholds.

**Scheduler run window logic**
`apps/scheduler/src/index.ts`

**Worker ingestion and completion logic**
`apps/worker/src/index.ts`

**Consolidation and watermark advancement**
`apps/consolidator/src/index.ts`

**Pricing rules and margins**
`packages/pricing-engine`, `packages/shared/src/constants.ts` for base margins, `pricing_rules` table in sql.

**API auth and proxy**
`packages/api/src/middleware/` and `packages/api/src/routes/`, `packages/nivoda/src/proxyTransport.ts`.

**Database pool tuning**
`packages/database/src/client.ts`, env vars `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONN_TIMEOUT_MS`.

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
