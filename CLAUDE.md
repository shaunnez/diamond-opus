# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Run specific package tests
npm run test -w @diamond/nivoda
npm run test -w @diamond/pricing-engine

# Development servers
npm run dev:api          # API on port 3000
npm run dev:scheduler    # Run scheduler once
npm run dev:worker       # Long-running worker
npm run dev:consolidator # Long-running consolidator

# Generate Swagger spec
npm run swagger

# Type checking
npm run typecheck
```

## Architecture Overview

This is a TypeScript monorepo using npm workspaces for diamond inventory management.

### Two-Stage Pipeline

1. **Scheduler** partitions workload using `diamonds_by_query_count` (CRITICAL: never use `total_count` from paginated results)
2. **Workers** fetch diamonds via Nivoda GraphQL API and write to `raw_diamonds_nivoda`
3. **Consolidator** maps raw data to canonical `diamonds` table, applies pricing rules, advances watermark

### Package Dependencies

```
@diamond/shared (types, utils, constants)
    ↓
@diamond/database (pg client, queries)
    ↓
@diamond/nivoda (GraphQL adapter, mapper)
@diamond/pricing-engine (rule matching)
    ↓
@diamond/api (Express routes, middleware)
apps/scheduler, apps/worker, apps/consolidator
```

## Critical Rules

### Identity Mapping

- `offer_id` = `items[].id` → Use for ordering/purchasing
- `supplier_stone_id` = `diamond.Id` → Use for tracking/deduplication

### Failure Handling

- If ANY worker fails → skip consolidation, do NOT advance watermark
- Last worker triggers consolidation via atomic counter increment
- Consolidator failure → send alert via Resend, do NOT advance watermark

### Database

- **No local Postgres** - Supabase only via `DATABASE_URL`
- Prices stored in **cents** (BIGINT) to avoid float issues
- Soft deletes: `status = 'deleted'` and `deleted_at` timestamp

### Nivoda API

- Token caching: 6 hour lifetime, re-auth 5 minutes before expiry
- `searchDiamonds` enforces max limit of 50
- All queries wrapped with `as(token: $token)`

## Authentication

Dual auth system (checked in order):

1. `X-API-Key` header → hash and compare against `api_keys` table
2. HMAC headers (`X-Client-Id`, `X-Timestamp`, `X-Signature`) → validate signature
3. Neither valid → 401

## Key Files

- `sql/bootstrap.sql` - Database schema (run manually in Supabase)
- `packages/nivoda/src/adapter.ts` - Nivoda GraphQL client
- `packages/nivoda/src/mapper.ts` - Raw to canonical transformation
- `packages/pricing-engine/src/engine.ts` - Pricing rule matching
- `packages/api/src/middleware/auth.ts` - Authentication logic
- `apps/scheduler/src/index.ts` - Job partitioning (uses `getDiamondsCount`)
- `apps/worker/src/index.ts` - Data ingestion with retry
- `apps/consolidator/src/index.ts` - Transformation and watermark
