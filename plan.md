# Plan: Optimize Dashboard Performance

## Overview

The dashboard currently makes 5+ independent API calls on initial load, none of the analytics endpoints are cached server-side, several database queries have missing indexes or use correlated subqueries, and the frontend bundles all 14 pages into a single JS file with no memoization. This plan addresses all layers: database, API, and frontend — with specific attention to the Runs, Consolidation, and Feeds pages.

---

## Phase 1: Database Index Additions

Create `sql/migrations/006_dashboard_performance_indexes.sql`.

### 1a. Partition progress — completed worker counts (Runs + Consolidation pages)
The `getStatusCondition()`, `getRunsWithStats()`, and `getRunsConsolidationStatus()` all run correlated subqueries like `SELECT COUNT(*) FROM partition_progress WHERE run_id = $1 AND completed = TRUE`. The existing partial index `idx_partition_progress_incomplete` only covers `completed = false`. Add the reverse:
```sql
CREATE INDEX CONCURRENTLY idx_partition_progress_completed
  ON partition_progress(run_id)
  WHERE completed = true;
```

### 1b. Worker runs — status counts (Runs page)
`getRunsWithStats()` runs two correlated subqueries: `SELECT COUNT(*) FROM worker_runs WHERE run_id = $1 AND status = 'completed'` and `...status = 'failed'`. The existing index `idx_worker_runs_status` on `(run_id, status)` covers this, but adding partial indexes for the two hot statuses avoids scanning irrelevant rows:
```sql
CREATE INDEX CONCURRENTLY idx_worker_runs_completed
  ON worker_runs(run_id)
  WHERE status = 'completed';

CREATE INDEX CONCURRENTLY idx_worker_runs_failed
  ON worker_runs(run_id)
  WHERE status = 'failed';
```

### 1c. Run metadata — feed + started_at (Runs + Consolidation pages)
Both the Runs list and Consolidation status queries filter by `feed` and sort by `started_at DESC`. Currently `idx_run_metadata_feed` only covers `(feed)`. Add composite:
```sql
CREATE INDEX CONCURRENTLY idx_run_metadata_feed_started
  ON run_metadata(feed, started_at DESC);
```

### 1d. Raw tables — run_id composite for consolidation LATERAL join (Consolidation page)
`getRunsConsolidationStatus()` does a `LEFT JOIN LATERAL` against raw tables filtering on `run_id` and aggregating `consolidated`, `consolidation_status`. Existing index `idx_raw_nivoda_run_id` covers the lookup but not the filter columns. Add composites:
```sql
CREATE INDEX CONCURRENTLY idx_raw_nivoda_run_consolidated
  ON raw_diamonds_nivoda(run_id, consolidated, consolidation_status);

CREATE INDEX CONCURRENTLY idx_raw_demo_run_consolidated
  ON raw_diamonds_demo(run_id, consolidated, consolidation_status);
```

### 1e. Diamonds — feed + status composite (Feeds page)
`getFeedStats()` runs `WHERE status = 'active' GROUP BY feed` with aggregates on `availability` and `feed_price`. The existing separate indexes on `feed` and `status` can't serve both the filter and GROUP BY together. Add:
```sql
CREATE INDEX CONCURRENTLY idx_diamonds_status_feed
  ON diamonds(status, feed);
```

### 1f. Error logs — JSONB runId extraction
`getErrorLogs()` filters on `context->>'runId'` which currently does a full table scan.
```sql
CREATE INDEX CONCURRENTLY idx_error_logs_context_runid
  ON error_logs ((context->>'runId'));
```

### 1g. Expression indexes for UPPER() in diamond search
Search queries use `UPPER(cut)`, `UPPER(polish)`, `UPPER(symmetry)` which bypass existing btree indexes on the plain columns:
```sql
CREATE INDEX CONCURRENTLY idx_diamonds_upper_cut
  ON diamonds(UPPER(cut)) WHERE status = 'active';

CREATE INDEX CONCURRENTLY idx_diamonds_upper_polish
  ON diamonds(UPPER(polish)) WHERE status = 'active';

CREATE INDEX CONCURRENTLY idx_diamonds_upper_symmetry
  ON diamonds(UPPER(symmetry)) WHERE status = 'active';
```

---

## Phase 2: Query Optimizations

### 2a. Rewrite `getRunsWithStats()` — eliminate correlated subqueries (Runs page)
**File**: `packages/database/src/queries/analytics.ts`

**Current problem**: The query already LEFT JOINs `worker_runs` for `SUM(records_processed)` and `MAX(completed_at)`, but then runs **2 additional correlated subqueries** against `worker_runs` for completed/failed counts, plus **1 correlated subquery** against `partition_progress` for last activity. That's 3 extra queries per row.

**Fix**: Use `FILTER` aggregates on the existing JOIN for worker counts, and add a second LEFT JOIN for partition activity:

```sql
SELECT
  rm.*,
  COUNT(*) FILTER (WHERE wr.status = 'completed') as completed_workers_actual,
  COUNT(*) FILTER (WHERE wr.status = 'failed') as failed_workers_actual,
  COALESCE(SUM(wr.records_processed), 0) as total_records,
  MAX(wr.completed_at) as last_worker_completed_at,
  pp_activity.last_activity as last_worker_activity_at
FROM run_metadata rm
LEFT JOIN worker_runs wr ON rm.run_id = wr.run_id
LEFT JOIN LATERAL (
  SELECT MAX(updated_at) as last_activity
  FROM partition_progress pp WHERE pp.run_id = rm.run_id
) pp_activity ON TRUE
WHERE ...
GROUP BY rm.run_id, pp_activity.last_activity
ORDER BY rm.started_at DESC
LIMIT $N OFFSET $M
```

This eliminates 3 correlated subqueries per row → 0.

### 2b. Rewrite `getStatusCondition()` — CTE pre-aggregation (Runs page)
**File**: `packages/database/src/queries/analytics.ts`

**Current problem**: When status filter is applied, `getStatusCondition()` injects **2 more correlated subqueries** against `partition_progress` per row into the WHERE clause. These also execute in the COUNT query.

**Fix**: When a status filter is used, wrap the whole query in a CTE that pre-computes partition stats:

```sql
WITH pp_stats AS (
  SELECT run_id,
    COUNT(*) FILTER (WHERE completed) as completed_pp,
    COUNT(*) FILTER (WHERE failed AND NOT completed) as failed_pp
  FROM partition_progress
  GROUP BY run_id
)
SELECT ...
FROM run_metadata rm
LEFT JOIN pp_stats pp ON rm.run_id = pp.run_id
WHERE <status condition using pp.completed_pp, pp.failed_pp>
```

This replaces N*2 correlated subqueries with a single aggregation pass.

### 2c. Rewrite `getRunsConsolidationStatus()` — CTE for partition stats (Consolidation page)
**File**: `packages/database/src/queries/analytics.ts`

**Current problem**: Same pattern — 2 correlated subqueries against `partition_progress` per row for completed/failed worker counts.

**Fix**: Replace with a CTE join:

```sql
WITH pp_stats AS (
  SELECT run_id,
    COUNT(*) FILTER (WHERE completed = TRUE) as completed_workers,
    COUNT(*) FILTER (WHERE failed = TRUE) as failed_workers
  FROM partition_progress
  GROUP BY run_id
)
SELECT
  rm.*,
  COALESCE(pp.completed_workers, 0) as completed_workers_actual,
  COALESCE(pp.failed_workers, 0) as failed_workers_actual,
  rm.consolidation_started_at,
  rm.consolidation_completed_at,
  ...
  raw_stats.*
FROM run_metadata rm
LEFT JOIN pp_stats pp ON rm.run_id = pp.run_id
LEFT JOIN LATERAL (...raw table aggregation...) raw_stats ON TRUE
WHERE rm.feed = $1
ORDER BY rm.started_at DESC
LIMIT $2
```

### 2d. Rewrite `getDashboardSummary()` — combine 3 diamond queries into 1
**File**: `packages/database/src/queries/analytics.ts`

**Current problem**: Runs 5 parallel queries. Three of them scan the `diamonds` table independently: total count, distinct feeds, availability breakdown.

**Fix**: Merge into a single query with FILTER aggregates:

```sql
SELECT
  COUNT(*) as total_diamonds,
  COUNT(DISTINCT feed) as feed_count,
  COUNT(*) FILTER (WHERE availability = 'available') as available,
  COUNT(*) FILTER (WHERE availability = 'on_hold') as on_hold,
  COUNT(*) FILTER (WHERE availability = 'sold') as sold,
  COUNT(*) FILTER (WHERE availability = 'unavailable') as unavailable
FROM diamonds
WHERE status = 'active';
```

Reduces 3 queries → 1, single table scan instead of 3.

### 2e. Rewrite "last successful run" — eliminate double correlated subquery
**Current problem**: The query runs the **same** correlated subquery twice — once in SELECT and once in WHERE:
```sql
SELECT rm.*, (SELECT COUNT(*) FROM worker_runs WHERE ... AND status='failed') as failed_count_actual
FROM run_metadata rm
WHERE rm.completed_at IS NOT NULL
  AND (SELECT COUNT(*) FROM worker_runs WHERE ... AND status='failed') = 0
```

**Fix**: Use `NOT EXISTS` for short-circuit evaluation:
```sql
SELECT rm.*
FROM run_metadata rm
WHERE rm.completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM worker_runs wr
    WHERE wr.run_id = rm.run_id AND wr.status = 'failed'
    LIMIT 1
  )
ORDER BY rm.completed_at DESC
LIMIT 1
```

This stops scanning at the first failed worker instead of counting all of them.

### 2f. Optimize `getFeedStats()` (Feeds page)
**File**: `packages/database/src/queries/analytics.ts`

**Current**: Single query that scans all active diamonds and groups by feed. This is already reasonably efficient, but can benefit from the new `idx_diamonds_status_feed` index (Phase 1e) for better GROUP BY performance. No query rewrite needed — the index addition alone helps.

### 2g. Optimize `getOverallConsolidationStats()` (Consolidation page)
**Current problem**: Scans the **entire** raw_diamonds table (e.g. `raw_diamonds_nivoda`) with no WHERE clause, just to count consolidated vs pending.

**Fix**: This is a summary stat. Add a lightweight materialized counter or, more practically, add `WHERE run_id IN (SELECT run_id FROM run_metadata ORDER BY started_at DESC LIMIT 20)` to scope the scan to recent runs. Alternatively, leave as-is but rely on the API cache (Phase 3) to avoid repeated full scans.

**Decision**: Rely on API cache for this — the full table COUNT is inherently expensive and the result changes only after consolidation.

---

## Phase 3: API-Level Caching for Analytics

### 3a. Add an analytics cache to the existing cache service
**File**: `packages/api/src/services/cache.ts`

The existing `LRUCache` class and dataset version polling are already in place. Add a new `analyticsCache` instance alongside `searchCache` and `countCache`:

```typescript
const analyticsCache = new LRUCache<string>(50, 15_000); // 50 entries, 15s TTL

export function getCachedAnalytics(key: string): string | undefined {
  return analyticsCache.get(key, getCompositeVersion());
}

export function setCachedAnalytics(key: string, json: string): void {
  analyticsCache.set(key, json, getCompositeVersion());
}
```

### 3b. Apply analytics caching to slow endpoints
**File**: `packages/api/src/routes/analytics.ts`

Wrap these endpoints with cache get/set:

| Endpoint | Cache Key | Why |
|----------|-----------|-----|
| `GET /analytics/summary` | `summary` | 5 DB queries, only changes after consolidation |
| `GET /analytics/feeds` | `feeds` | Full table scan, only changes after consolidation |
| `GET /analytics/consolidation` | `consol:{feed}` | Full raw table scan |
| `GET /analytics/consolidation/status` | `consol-status:{feed}:{limit}` | Multiple joins + LATERAL |

Pattern for each endpoint:
```typescript
router.get('/feeds', async (_req, res, next) => {
  try {
    const cacheKey = 'feeds';
    const cached = getCachedAnalytics(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(JSON.parse(cached));
      return;
    }
    const feeds = await getFeedStats();
    const response = { data: feeds };
    setCachedAnalytics(cacheKey, JSON.stringify(response));
    res.setHeader('X-Cache', 'MISS');
    res.json(response);
  } catch (error) { next(error); }
});
```

Note: Do **not** cache `GET /analytics/runs` or `GET /analytics/runs/:runId` — these have user-specific filters and adaptive refetch, and the data changes frequently during active runs.

### 3c. Add a combined `/analytics/dashboard` endpoint
**File**: `packages/api/src/routes/analytics.ts`

Create a single endpoint that returns everything the Dashboard page needs:

```typescript
router.get('/dashboard', async (req, res) => {
  const cacheKey = 'dashboard';
  const cached = getCachedAnalytics(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(JSON.parse(cached));
    return;
  }

  const [summary, runs, failedWorkers, watermarks] = await Promise.all([
    getDashboardSummary(),
    getRunsWithStats({ limit: 5 }),
    getRecentFailedWorkers(10),
    getAllWatermarks(),  // new helper — reads all feed blobs in parallel
  ]);

  const response = { data: { summary, runs: runs.runs, failedWorkers, watermarks } };
  setCachedAnalytics(cacheKey, JSON.stringify(response));
  res.setHeader('X-Cache', 'MISS');
  res.json(response);
});
```

`getAllWatermarks()` reads both nivoda.json and demo.json from Azure Blob Storage in parallel and returns `{ nivoda: Watermark | null, demo: Watermark | null }`.

### 3d. Add ETag + Cache-Control headers
For all analytics endpoints that use the cache:
- ETag: composite dataset version hash
- `Cache-Control: public, max-age=15, stale-while-revalidate=60`
- Return `304 Not Modified` when client sends matching `If-None-Match`

---

## Phase 4: Frontend Optimizations

### 4a. Use combined dashboard endpoint
**Files**: `apps/dashboard/src/api/analytics.ts`, `apps/dashboard/src/pages/Dashboard.tsx`

- Add `getDashboardData()` client function calling `GET /analytics/dashboard`
- Replace the 5 separate `useQuery` calls in `Dashboard.tsx` with a single call
- Eliminates 5 parallel HTTP requests → 1
- Eliminates 4 independent React Query state updates → 1 atomic render

### 4b. Route-based code splitting
**File**: `apps/dashboard/src/App.tsx`

Use `React.lazy()` + `Suspense` for all page components. Currently all 14 pages are eagerly imported:
```typescript
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Runs = React.lazy(() => import('./pages/Runs'));
const RunDetails = React.lazy(() => import('./pages/RunDetails'));
const Consolidation = React.lazy(() => import('./pages/Consolidation'));
const Feeds = React.lazy(() => import('./pages/Feeds'));
// ... all remaining pages
```

Add a `<Suspense fallback={<PageSpinner />}>` wrapper around the routes.

### 4c. Add `useMemo` for expensive render computations
- **`RunDetails.tsx`**: Memoize `getEstimatedTimeRemaining()`, `getWorkerProgress()`, sorted worker list — these recalculate on every render with 20+ workers
- **`Heatmap.tsx`**: Memoize `groupIntoPriceBands()`, `maxCount`, density color map — 100+ elements recalculated per render
- **`Query.tsx`**: Memoize `resultColumns` derivation — O(n*m) on every render
- **`Dashboard.tsx`**: Memoize derived stats from the combined endpoint response

### 4d. Tune React Query `staleTime`
**File**: `apps/dashboard/src/App.tsx` (or wherever QueryClient is instantiated)

Currently `staleTime` defaults to 0, meaning every page navigation triggers immediate refetches even when data was just fetched seconds ago. Set to 30s to match the most common refetch interval:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

### 4e. Debounce search/filter inputs
**Files**: `Query.tsx`, `Holds.tsx`, `Orders.tsx`

Add 300ms debounce to text inputs that trigger API calls to prevent request storms during typing.

---

## Implementation Order

| Step | What | Files Changed | Impact |
|------|------|---------------|--------|
| 1 | Migration: add indexes | `sql/migrations/006_dashboard_performance_indexes.sql` | Faster correlated subqueries across Runs, Consolidation, Feeds, ErrorLogs |
| 2 | Rewrite `getRunsWithStats()` — FILTER aggregates + remove correlated subs | `packages/database/src/queries/analytics.ts` | Runs page: eliminates 3 subqueries/row |
| 3 | Rewrite `getStatusCondition()` — CTE pre-aggregation | `packages/database/src/queries/analytics.ts` | Runs page: eliminates 2 subqueries/row in status filter + count |
| 4 | Rewrite `getRunsConsolidationStatus()` — CTE for partition stats | `packages/database/src/queries/analytics.ts` | Consolidation page: eliminates 2 subqueries/row |
| 5 | Rewrite `getDashboardSummary()` — merge 3 diamond queries into 1 | `packages/database/src/queries/analytics.ts` | Dashboard: 3 table scans → 1 |
| 6 | Rewrite "last successful run" — NOT EXISTS | `packages/database/src/queries/analytics.ts` | Dashboard: short-circuits on first failed worker |
| 7 | Add analytics cache to cache service | `packages/api/src/services/cache.ts` | All cached endpoints return in <1ms on hit |
| 8 | Apply caching to `/summary`, `/feeds`, `/consolidation`, `/consolidation/status` | `packages/api/src/routes/analytics.ts` | Feeds, Consolidation: eliminates DB calls for 15s |
| 9 | Add combined `/analytics/dashboard` endpoint | `packages/api/src/routes/analytics.ts` | Dashboard: 5 requests → 1 |
| 10 | Frontend: combined endpoint + code splitting + staleTime | `App.tsx`, `Dashboard.tsx`, `api/analytics.ts` | Faster initial load, fewer HTTP requests |
| 11 | Frontend: useMemo + debounce | `RunDetails.tsx`, `Heatmap.tsx`, `Query.tsx`, `Holds.tsx`, `Orders.tsx` | Fewer re-renders |
| 12 | Typecheck + build verification | All | Verify nothing broke |

---

## Expected Impact

### Runs page
- **Before**: `getRunsWithStats()` runs 3 correlated subqueries per row + 2 more per row when status filter active. For 50 rows = 250 subqueries.
- **After**: 0 correlated subqueries. Single CTE pass + FILTER aggregates on existing JOIN.

### Consolidation page
- **Before**: `getRunsConsolidationStatus()` runs 2 correlated subqueries per row against `partition_progress`. `getOverallConsolidationStats()` scans entire raw table every 10s.
- **After**: CTE eliminates correlated subqueries. API cache prevents repeated full table scans (15s TTL).

### Feeds page
- **Before**: `getFeedStats()` full table scan on `diamonds`, no composite index for `(status, feed)` GROUP BY.
- **After**: Composite index enables better GROUP BY. API cache returns cached result for 15s. Combined with dataset version keying, cache only invalidates after consolidation.

### Dashboard page
- **Before**: 5 parallel API calls, 5 independent React Query states, 3 redundant table scans in summary.
- **After**: 1 API call, 1 React Query state, 1 table scan in summary. Server-side cache returns <1ms on hit.

### Overall
- **DB queries**: ~250 correlated subqueries/request → 0 (Runs page with status filter, 50 rows)
- **API calls from frontend**: 5 → 1 (Dashboard), no change for Runs/Consolidation/Feeds
- **API response time on cache hit**: <1ms vs 50-200ms
- **Initial bundle size**: ~50% smaller with code splitting
- **Navigation flicker**: eliminated by `staleTime: 30s`
