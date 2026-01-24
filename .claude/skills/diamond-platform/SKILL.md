---
name: diamond-platform
description: Domain knowledge for the Diamond Platform - use when working on Nivoda integration, scheduler, workers, consolidator, API, pricing engine, or database queries
---

# Diamond Platform Development Skills

Essential knowledge and patterns for building the Diamond Platform effectively.

---

## Critical Rules (Never Violate)

### Scheduler Partitioning

**ALWAYS use `diamonds_by_query_count` for partitioning, NEVER `total_count` from paginated results.**

```typescript
// CORRECT
const totalRecords = await nivodaAdapter.getDiamondsCount(query);

// WRONG - will cause data loss
const { total_count } = await nivodaAdapter.searchDiamonds(query);
```

### Identity Mapping

- `offer_id` = `items[].id` → Use for ordering/purchasing
- `supplier_stone_id` = `diamond.Id` → Use for tracking/deduplication

### Failure Handling

- If ANY worker fails → skip consolidation, do NOT advance watermark
- Last worker triggers consolidation via atomic counter increment
- Consolidator failure → send alert, do NOT advance watermark

### Database

- **No local Postgres** - Supabase only via `DATABASE_URL`
- **No ORM migrations** - Manual SQL in Supabase SQL Editor
- Prices stored in **cents** (BIGINT) to avoid float issues

---

## Architecture Patterns

### Two-Stage Pipeline

```
Scheduler → Service Bus → Workers → raw_diamonds_nivoda
                                          ↓
                              Consolidator → diamonds (canonical)
```

### Partitioning Strategy

```typescript
const RECORDS_PER_WORKER = 5000;
const numWorkers = Math.ceil(totalRecords / RECORDS_PER_WORKER);
```

### Worker Retry Logic

- Exponential backoff: 2s, 4s, 8s, 16s, 32s
- Max retries: 5
- Pagination: limit=30 per page
- Checkpoint after each page

### Consolidator Batching

- Fetch unconsolidated rows in batches of 1000
- For each: parse → map → price → upsert → mark consolidated

---

## Nivoda GraphQL Patterns

### Token Management

```typescript
// 6 hour lifetime, re-auth 5 minutes before expiry
const TOKEN_LIFETIME_MS = 6 * 60 * 60 * 1000;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
```

### All Queries Wrapped with Token

```graphql
query DiamondsByQuery($token: String!, ...) {
  as(token: $token) {
    diamonds_by_query(...) { ... }
  }
}
```

### Search Limit Enforcement

```typescript
// NivodaAdapter MUST enforce max limit of 50
searchDiamonds(query, { limit: Math.min(requestedLimit, 50) });
```

---

## Authentication Implementation

### Dual Auth Flow (check in order)

1. `X-API-Key` header → hash and compare against `api_keys` table
2. HMAC headers (`X-Client-Id`, `X-Timestamp`, `X-Signature`) → validate signature
3. Neither valid → 401

### HMAC Signature Computation

```typescript
const canonical = [
  method, // GET, POST, etc.
  path, // /api/v2/diamonds
  timestamp, // Unix seconds
  sha256(body), // SHA256 of request body
].join("\n");

const signature = hmacSha256(clientSecret, canonical);
```

### Timestamp Validation

- Must be within ±5 minutes of server time

---

## Database Query Patterns

### Soft Deletes

```sql
-- Never DELETE, always soft delete
UPDATE diamonds SET status = 'deleted', deleted_at = NOW() WHERE id = $1;

-- Always filter active records
SELECT * FROM diamonds WHERE status = 'active';
```

### Atomic Counter Increment (Worker Completion)

```sql
UPDATE run_metadata
SET completed_workers = completed_workers + 1
WHERE run_id = $1
RETURNING completed_workers, expected_workers;
```

### Upsert Pattern

```sql
INSERT INTO raw_diamonds_nivoda (supplier_stone_id, offer_id, payload, payload_hash, run_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (supplier_stone_id)
DO UPDATE SET payload = $3, payload_hash = $4, run_id = $5, updated_at = NOW();
```

---

## Pricing Engine Logic

### Rule Matching Priority

1. Sort active rules by priority (lower = higher priority)
2. For each rule, check all non-null criteria match
3. First matching rule wins
4. NULL criteria = matches all

### Criteria Fields

- `carat_min`, `carat_max` - range check
- `shapes[]` - array contains check
- `lab_grown` - boolean match
- `supplier` - exact match

### Calculation

```typescript
const retail_price_cents = Math.round(supplier_price_cents * markup_ratio);
const price_per_carat_cents = Math.round(supplier_price_cents / carats);
```

---

## Azure Service Bus Messages

### WORK_ITEM (Scheduler → Worker)

```json
{
  "type": "WORK_ITEM",
  "run_id": "uuid",
  "partition_id": "partition-0",
  "offset_start": 0,
  "offset_end": 5000,
  "updated_from": "ISO8601",
  "updated_to": "ISO8601"
}
```

### CONSOLIDATE (Worker → Consolidator)

```json
{
  "type": "CONSOLIDATE",
  "run_id": "uuid"
}
```

Only sent when last worker completes AND no failures.

---

## TypeScript Patterns

### ES Modules

```json
// package.json
{ "type": "module" }
```

### Strict Mode

```json
// tsconfig.json
{ "compilerOptions": { "strict": true } }
```

### Environment Loading

```json
// package.json scripts
"dev": "cross-env NODE_ENV=development tsx watch src/index.ts"
```

### Workspace References

```json
// packages/api/package.json
{
  "dependencies": {
    "@diamond/shared": "workspace:*",
    "@diamond/database": "workspace:*",
    "@diamond/nivoda": "workspace:*"
  }
}
```

---

## API Response Patterns

### Paginated List

```json
{
  "data": [...],
  "pagination": {
    "total": 1000,
    "page": 1,
    "limit": 50,
    "total_pages": 20
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid carat range"
  }
}
```

---

## Testing Patterns

### Unit Test Focus Areas

- NivodaAdapter: token caching, re-auth, limit enforcement
- NivodaMapper: identity mapping, field extraction, edge cases
- PricingEngine: rule priority, criteria matching, calculations
- Auth middleware: API key, HMAC, timestamp validation

### Integration Test Conditions

```typescript
// Skip if no credentials
const skipIntegration = !process.env.NIVODA_USERNAME;
describe.skipIf(skipIntegration)('Nivoda Integration', () => { ... });
```

---

## File Organization

### Package Responsibilities

- `packages/shared` - Types, utilities, constants (no external deps)
- `packages/database` - Client, typed queries (pg dependency)
- `packages/nivoda` - Adapter, mapper, GraphQL queries
- `packages/pricing-engine` - Rule matching, markup calculation
- `packages/api` - Express routes, middleware, validators
- `apps/scheduler` - Partitioning, job dispatch
- `apps/worker` - Ingestion, checkpointing
- `apps/consolidator` - Mapping, pricing, watermark

### Import Pattern

```typescript
// From shared package
import { DiamondStatus, formatCents } from "@diamond/shared";

// From database package
import { db, queries } from "@diamond/database";
```
