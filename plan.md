# Plan: Reapply Pricing Model Button

## Overview

Add a "Reapply Pricing" button to the Pricing Rules dashboard page that asynchronously recalculates `price_model_price`, `markup_ratio`, and `rating` for all available diamonds using the current active pricing rules. Includes progress tracking and revert capability.

## Architecture Decisions

**Execution model**: In-process background task on the API server. The API already has patterns for fire-and-forget work (heatmap saves, cache polling). A full Service Bus job is overkill for an operator-triggered one-off. The work is batched and tracked via a DB table, so a partial job is visible and can be re-triggered.

**Tracking**: New `pricing_reapply_jobs` table stores job metadata and progress counters. Dashboard polls for status.

**Revert**: New `pricing_reapply_snapshots` table stores per-diamond old/new pricing values. A revert endpoint restores old values from snapshots and increments dataset version.

**Cache invalidation**: On job completion (or revert), call `incrementDatasetVersion()` for each affected feed. The existing 30s version poll in the cache service handles the rest — no new invalidation mechanism needed.

**Scope**: Only diamonds with `availability = 'available'` are repriced. The job records which feed(s) were affected.

---

## Database Changes

### New migration: `sql/migrations/005_pricing_reapply_jobs.sql`

```sql
-- Table 1: Job tracking
CREATE TABLE pricing_reapply_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'reverted')),
    total_diamonds INTEGER NOT NULL DEFAULT 0,
    processed_diamonds INTEGER NOT NULL DEFAULT 0,
    failed_diamonds INTEGER NOT NULL DEFAULT 0,
    feeds_affected TEXT[] NOT NULL DEFAULT '{}',
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reverted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: Per-diamond snapshots for revert
CREATE TABLE pricing_reapply_snapshots (
    job_id UUID NOT NULL REFERENCES pricing_reapply_jobs(id) ON DELETE CASCADE,
    diamond_id UUID NOT NULL,
    feed TEXT NOT NULL,
    old_price_model_price NUMERIC(12,2) NOT NULL,
    old_markup_ratio NUMERIC(5,4),
    old_rating INTEGER,
    new_price_model_price NUMERIC(12,2) NOT NULL,
    new_markup_ratio NUMERIC(5,4),
    new_rating INTEGER,
    PRIMARY KEY (job_id, diamond_id)
);

CREATE INDEX idx_pricing_reapply_snapshots_job ON pricing_reapply_snapshots(job_id);
```

---

## Backend Changes

### 1. Database queries: `packages/database/src/queries/pricing-reapply.ts` (new)

New query file with functions:
- `createReapplyJob()` — INSERT job, return id
- `updateReapplyJobStatus(id, status, fields?)` — UPDATE status, counters, error
- `getReapplyJob(id)` — SELECT single job
- `getReapplyJobs()` — SELECT all jobs ordered by created_at DESC (with limit)
- `insertReapplySnapshots(jobId, snapshots[])` — Batch INSERT using UNNEST
- `getReapplySnapshots(jobId, offset, limit)` — SELECT snapshots for a job (batched for revert)
- `getAvailableDiamondsBatch(cursor, limit)` — SELECT diamonds WHERE availability = 'available' ordered by id for deterministic cursor-based batching
- `batchUpdateDiamondPricing(updates[])` — UPDATE diamonds pricing fields using UNNEST

### 2. API routes: `packages/api/src/routes/pricing-rules.ts` (extend existing)

New endpoints added to the existing pricing-rules router:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/pricing-rules/reapply` | Start a new repricing job |
| `GET` | `/pricing-rules/reapply/jobs` | List all repricing jobs |
| `GET` | `/pricing-rules/reapply/jobs/:id` | Get job status + progress |
| `POST` | `/pricing-rules/reapply/jobs/:id/revert` | Revert a completed job |

**POST /pricing-rules/reapply flow:**
1. Check no other job is currently `running` or `pending` (return 409 if so)
2. Count available diamonds → set `total_diamonds`
3. Create job row with status `pending`
4. Return job id immediately (202 Accepted)
5. Fire async `executeReapplyJob(jobId)` (not awaited)

**executeReapplyJob(jobId) background logic:**
1. Set status → `running`, record `started_at`
2. Load pricing engine with fresh rules: `pricingEngine.loadRules()`
3. Fetch available diamonds in batches of 500 (by id cursor)
4. For each batch:
   - Apply `pricingEngine.applyPricing()` to each diamond
   - Collect snapshots (old vs new values)
   - Batch UPDATE diamonds with new pricing values (using UNNEST)
   - Batch INSERT snapshots
   - Increment `processed_diamonds` counter in job row
   - Track distinct feeds seen
5. On completion: set status → `completed`, record `completed_at`, `feeds_affected`
6. Call `incrementDatasetVersion(feed)` for each affected feed
7. On error: set status → `failed`, record error message

**POST /pricing-rules/reapply/jobs/:id/revert flow:**
1. Validate job exists and status is `completed` (return 400 otherwise)
2. Set status → `running` (prevent concurrent revert)
3. Fetch snapshots in batches
4. Batch UPDATE diamonds restoring `old_price_model_price`, `old_markup_ratio`, `old_rating`
5. Set status → `reverted`, record `reverted_at`
6. Call `incrementDatasetVersion(feed)` for each feed in `feeds_affected`
7. Return 200

### 3. Register queries in `packages/database/src/queries/index.ts`

Export the new pricing-reapply query functions.

---

## Frontend Changes

### 1. API client: `apps/dashboard/src/api/pricing-rules.ts` (extend existing)

Add functions:
```typescript
export async function triggerReapplyPricing(): Promise<{ id: string }>
export async function getReapplyJobs(): Promise<ReapplyJob[]>
export async function getReapplyJob(id: string): Promise<ReapplyJob>
export async function revertReapplyJob(id: string): Promise<void>
```

### 2. Dashboard page: `apps/dashboard/src/pages/PricingRules.tsx` (extend existing)

Add to the existing Pricing Rules page:

- **"Reapply Pricing" button** in the page header (next to "Add Rule")
  - Disabled while a job is already running
  - Opens a confirmation modal explaining the action

- **Active job progress bar** (shown when a job is running/pending)
  - Polls job status every 3s using `useQuery` with `refetchInterval`
  - Shows: processed / total diamonds, percentage
  - Auto-stops polling when job completes or fails

- **Job history section** below the rules table
  - Table showing recent repricing jobs: status, diamond count, duration, created_at
  - "Revert" button on completed jobs (with confirmation modal)
  - Badge for status (pending=warning, running=info, completed=success, failed=error, reverted=neutral)

---

## Cache Impact

- **During repricing**: Diamonds are updated in batches. The cache is NOT invalidated mid-job — users may see stale prices until the job completes. This is acceptable since the operation is admin-triggered and brief staleness is tolerable.
- **After repricing completes**: `incrementDatasetVersion()` is called for each affected feed. Within 30s, the API's version poll detects the change, and the LRU cache entries become stale on next access. ETag changes, so clients with `If-None-Match` get fresh data.
- **After revert**: Same mechanism — `incrementDatasetVersion()` bumps versions, cache invalidates within 30s.
- **No mid-job invalidation**: We bump the version only once at the end, not per batch. This avoids excessive cache churn and gives users a consistent view until the job finishes.

---

## File Change Summary

| File | Action |
|------|--------|
| `sql/migrations/005_pricing_reapply_jobs.sql` | **New** — migration for job + snapshot tables |
| `packages/database/src/queries/pricing-reapply.ts` | **New** — query functions for jobs/snapshots |
| `packages/database/src/queries/index.ts` | **Edit** — export new queries |
| `packages/api/src/routes/pricing-rules.ts` | **Edit** — add 4 new endpoints + background job logic |
| `apps/dashboard/src/api/pricing-rules.ts` | **Edit** — add API client functions |
| `apps/dashboard/src/pages/PricingRules.tsx` | **Edit** — add button, progress bar, job history |
