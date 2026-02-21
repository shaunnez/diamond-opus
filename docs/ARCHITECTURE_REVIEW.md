# Architecture Review

Generated: 2026-02-21
Scope: Full codebase — pipeline apps, shared packages, API, dashboard, SQL schema.

Issues are grouped by theme and ranked within each section. Severity tags:
**[Critical]** = data corruption or invariant violation risk
**[High]** = reliability, security, or maintainability blocker
**[Medium]** = correctness concern or significant tech debt
**[Low]** = polish / minor improvement

---

## 1. Schema & Migrations

### 1.1 [Critical] Four pairs of duplicate migration file numbers

`sql/migrations/` contains conflicting numbers:

| Number | File A | File B |
|--------|--------|--------|
| 002 | `002_add_search_fields.sql` | `002_denormalize_measurements_attributes.sql` |
| 003 | `003_dataset_versions.sql` | `003_seed_pricing_rules.sql` |
| 006 | `006_dashboard_performance_indexes.sql` | `006_pricing_reapply_retry.sql` |
| 009 | `009_pricing_reapply_trigger_tracking.sql` | `009_stripe_payments.sql` |

There is no migration runner — migrations are applied manually in Supabase SQL Editor — so the numbering is only documentary. But it makes the application order ambiguous and will cause problems the moment an automated runner is added. Renumber so every file has a unique sequence prefix.

### 1.2 [Critical] `UNIQUE(supplier_stone_id)` on `raw_diamonds_nivoda` is wrong

```sql
-- full_schema.sql line 463
ADD CONSTRAINT "raw_diamonds_nivoda_supplier_stone_id_key" UNIQUE ("supplier_stone_id");
```

Both `nivoda-natural` and `nivoda-labgrown` feeds share `raw_diamonds_nivoda`. If Nivoda ever reuses a `supplier_stone_id` across product lines (plausible for recut/relisted stones), the upsert silently overwrites the wrong row. The constraint should be composite:

```sql
UNIQUE (supplier_stone_id, offer_id)
```

Invariant §4 says both fields are stored — enforce both at the database level.

### 1.3 [Medium] `UNIQUE(error_message)` on `error_logs` is semantically broken

```sql
ADD CONSTRAINT "error_logs_error_message_key" UNIQUE ("error_message");
```

This means only one row can exist per unique error message text. The second occurrence of any error is silently dropped on conflict. This is almost certainly unintentional — `error_logs` should record every occurrence, not deduplicate.

### 1.4 [Medium] No retention policy on unbounded tables

`error_logs`, `partition_progress`, and `worker_runs` grow indefinitely. A full run with 10 partitions produces 10+ `partition_progress` rows; after 1,000 runs these tables are large enough to affect query latency. Add a scheduled cleanup job or a `created_at < NOW() - INTERVAL '90 days'` deletion task.

### 1.5 [Low] `full_schema.sql` is out of sync with migrations

`full_schema.sql` is described as the "complete schema reference" but it predates several migrations (005–012). A reader comparing the two gets inconsistent pictures of the actual schema. Either regenerate `full_schema.sql` from a fresh `pg_dump --schema-only` after all migrations, or clearly document that it is a snapshot from a specific date.

---

## 2. Critical Bugs & Invariant Risks

### 2.1 [High] `parseInt()` of an empty env var silently produces `NaN`

In `packages/shared/src/constants.ts`, every numeric env var is parsed as:

```typescript
export const CONSOLIDATOR_CONCURRENCY = parseInt(
  process.env.CONSOLIDATOR_CONCURRENCY ?? '2',
  10
);
```

The `?? '2'` fallback only fires for `undefined` — not for `''`. If an operator sets `CONSOLIDATOR_CONCURRENCY=` (empty string) in a secrets manager, the result is `NaN`. Downstream code that compares `NaN` to a number (`workers >= CONSOLIDATOR_CONCURRENCY`) always evaluates to `false`, causing silent behaviour changes.

Fix: replace `?? 'N'` with `|| 'N'` (coerces empty string) or use a validated `getEnvInt(name, default)` helper that throws on `NaN`.

### 2.2 [High] Debug `console.log` committed in production code

`apps/dashboard/src/pages/Dashboard.tsx` line 433:

```typescript
console.log('here', feed, wm, watermarks)
```

This leaks internal watermark state to the browser console in production. Remove it.

### 2.3 [Medium] Pool singleton race on first call

`packages/database/src/client.ts` lazily initialises the global pool:

```typescript
let pool: pg.Pool | null = null;
export function getPool(): pg.Pool {
  if (!pool) { ... pool = new Pool(...) ... }
  return pool;
}
```

Node.js is single-threaded so the race is narrow, but the `if (!pool)` check and assignment are not atomic across the async boundary. If `getPool()` is called concurrently at startup (e.g., two async init functions), two pool objects may be created. Use a module-level `const pool = new Pool(getPoolConfig())` — eager initialisation eliminates the conditional entirely.

---

## 3. Architecture & Duplication

### 3.1 [High] Feed-registry initialisation duplicated across all three pipeline apps

`apps/scheduler/src/feeds.ts`, `apps/worker/src/feeds.ts`, and `apps/consolidator/src/feeds.ts` all contain essentially identical code that builds the feed adapter registry. When a new feed is added, all three files must be updated in lockstep (documented in CLAUDE.md as a manual requirement). This is a maintenance hazard.

Extract a `packages/feed-registry/src/defaultRegistry.ts` that builds the production registry and re-export it. Each app imports the ready-made registry instead of re-building it. Feed-specific env validation (are required credentials present?) can live there too.

### 3.2 [High] Service Bus polling boilerplate duplicated in worker and consolidator

The `worker` and `consolidator` apps both implement an identical structure:

```
while (true) {
  receiveMessage()
  process()
  sleep(5000)
}
```

The sleep duration is hardcoded `5000` ms in both apps with no constant. Extract a `packages/shared/src/servicebus/poller.ts` that accepts a handler callback and exposes the poll interval as a constant. Both apps become one-liners.

### 3.3 [High] `pricing-rules.ts` is 985 lines mixing three concerns

`packages/api/src/routes/pricing-rules.ts` contains:
- Route handlers (HTTP concern)
- `executeReapplyJob()` — a 180-line async orchestrator (business logic)
- Result formatters (`formatReapplyJob`, inline rule serialisation)
- Input validation (mixed with handler bodies)

The repricing trigger block (create-rule path lines 178–232) is ~95% identical to the update-rule path (lines 377–420). A single helper `maybeStartRepricingJob(ruleId, totalDiamonds, triggerType)` would remove ~100 lines of duplication and ensure both paths stay in sync.

Suggested split:
```
packages/api/src/routes/pricing-rules.ts       ← route registration only
packages/api/src/handlers/pricing-rules.ts     ← handler functions
packages/api/src/services/repricing.ts         ← executeReapplyJob + job lifecycle
packages/api/src/formatters/pricing-rules.ts   ← serialisation helpers
```

### 3.4 [Medium] Timeout/AbortController pattern duplicated

`packages/nivoda/src/adapter.ts` (lines 152–169) and `packages/api/src/middleware/nivodaProxyAuth.ts` / `proxyTransport.ts` (lines 38–52) both implement the same AbortController + setTimeout fetch-with-timeout pattern. Extract to `packages/shared/src/utils/fetchWithTimeout.ts`.

### 3.5 [Medium] Auth hooks and API client duplicated across dashboard and storefront

`apps/dashboard/src/hooks/useAuth.tsx` and a corresponding hook in `apps/storefront/src/` are near-identical. Same for the API client factory. These should live in a shared package (or at minimum a shared workspace symlink) rather than being maintained separately.

### 3.6 [Medium] `ALLOWED_RAW_TABLES` must be updated manually in three places

Adding a new feed requires updating `packages/feed-registry/src/types.ts` (the set), and the adapter registries in all three pipeline apps. If step 2 of CLAUDE.md's "Adding or changing a feed" is missed, the feed silently fails at the SQL-injection guard. Make `ALLOWED_RAW_TABLES` derive from the registered adapters at build time so it can never be out of sync.

### 3.7 [Low] `"nivoda"` hardcoded in `mapper.ts`

`packages/nivoda/src/mapper.ts` line 176:

```typescript
feed: "nivoda",
```

This string should come from the adapter's feed identifier, not be hardcoded in the mapper. When a second Nivoda-based feed is added (e.g., a white-label), the mapper will mis-label its records.

---

## 4. Security

### 4.1 [High] API key stored in `localStorage` (XSS risk)

`apps/dashboard/src/api/client.ts` persists the API key in `localStorage`:

```typescript
localStorage.setItem(API_KEY_STORAGE_KEY, key);
```

Any XSS vector — a compromised dependency, a reflected-input bug, or a browser extension — can exfiltrate the key with a one-liner. The dashboard controls pipeline operations; a stolen key enables arbitrary data manipulation.

Mitigations (in order of preference):
1. Use `HttpOnly` session cookies backed by a short-lived server session.
2. Use `sessionStorage` (cleared on tab close, harder to steal cross-tab).
3. If `localStorage` is kept, namespace the key and set a short expiry that is enforced server-side.

### 4.2 [High] Unbounded `authFailures` Map is a memory leak

`packages/api/src/middleware/auth.ts`:

```typescript
const authFailures = new Map<string, { count: number; firstFailureAt: number; notified: boolean }>();
```

There is no eviction. An attacker probing with thousands of distinct IPs (or a bot that rotates IPs) grows this Map indefinitely. Replace with an LRU cache bounded to, e.g., 10,000 entries, or add TTL-based cleanup triggered on each insertion.

### 4.3 [Medium] Race condition on auth-failure Slack notification

The `notified` flag check and set in `auth.ts` (lines 32–40) is not atomic. Two concurrent requests from the same IP that both arrive before either sets `notified = true` will both send a Slack alert. In practice this is a low-severity noise issue, but for a security-sensitive path it should use an atomic compare-and-set (e.g., set `notified = true` before awaiting `notify()`).

### 4.4 [Medium] `req.ip` is spoofable without explicit proxy trust

`auth.ts` uses `req.ip` for failure tracking, but Express only populates this from `X-Forwarded-For` if `app.set('trust proxy', ...)` is configured. If the API sits behind a load balancer without that setting, all requests appear to come from the same IP; all failures share one counter. Confirm `trust proxy` is set and document which hop count is trusted.

### 4.5 [Low] `console.error` in database pool error handler

`packages/database/src/client.ts` line 32 uses `console.error` for pool errors. These errors are high-severity (database connectivity issues) and should flow through the structured logger so they reach the same log aggregation pipeline as application errors, not just stdout.

---

## 5. Performance

### 5.1 [Medium] Linear O(n) rule search in pricing engine

`packages/pricing-engine/src/engine.ts` `findMatchingRule()` iterates all rules for every diamond:

```typescript
for (const rule of this.rules) { ... }
```

With 50 rules this is negligible. If the rules table grows (tiered pricing per market, per customer segment), this becomes noticeable during consolidation of 50,000+ diamonds. Pre-index rules by `(stoneType, feedName)` into a `Map` to reduce per-diamond lookup to O(1) for the common case.

### 5.2 [Medium] Floating-point arithmetic for money values

`packages/pricing-engine/src/engine.ts` line 102:

```typescript
Math.round(diamond.feedPrice * markupRatio * 100) / 100
```

`feedPrice * markupRatio` operates on IEEE 754 doubles. For a diamond priced at `$1,234.56` with a 1.25× markup, floating-point error can produce `$1543.1999999999998` before rounding. Use integer-cent arithmetic throughout (`feedPriceCents * ratio`, round once at the end) or a `Decimal` library.

### 5.3 [Medium] `dataset_versions` polled every 30 s; consider LISTEN/NOTIFY

`packages/api/src/services/cache.ts` polls `dataset_versions` on a 30-second interval. During a consolidation run, the API serves stale cached responses for up to 30 seconds after new data is available. PostgreSQL `LISTEN/NOTIFY` would allow the consolidator to push an invalidation signal immediately, reducing staleness to milliseconds and eliminating the polling round-trip overhead.

### 5.4 [Low] LRU eviction uses `Map.keys().next()` — O(n) in V8

`packages/api/src/services/cache.ts` line 96:

```typescript
const oldestKey = this.cache.keys().next().value;
this.cache.delete(oldestKey);
```

V8's `Map` does not maintain insertion order with O(1) head access for iterators. Under load with 500-entry caches this is acceptable, but true O(1) LRU requires a doubly-linked list + map. Consider using the `lru-cache` npm package which implements this correctly.

### 5.5 [Low] SHA-256 hash computed on every search cache operation

`buildFilterKey()` in `cache.ts` runs `JSON.stringify + createHash('sha256')` on every cache get and set. For a high-traffic API with many concurrent searches, this is measurable overhead. Cache the hash alongside the filter object, or use a faster hash (FNV-1a, xxHash) since cryptographic strength is not required for a cache key.

---

## 6. Reliability & Observability

### 6.1 [High] Fire-and-forget repricing jobs leave permanent "running" state on crash

`packages/api/src/routes/pricing-rules.ts` starts repricing jobs with:

```typescript
executeReapplyJob(jobId).catch((err) => { log.error(...) });
```

This appears in three places (lines ~220, ~408, ~966). If the API process restarts while a job is running, the job row stays in `status = 'running'` forever. The stall-detection monitor (`REAPPLY_JOB_STALL_THRESHOLD_MINUTES = 15`) should catch this, but only if the monitor is actually running — it lives in `reapply-monitor.ts` and must be started explicitly. Confirm it is started on API initialisation, and add a test that the stall check actually transitions stuck jobs.

### 6.2 [Medium] No cache hit/miss/eviction metrics

`getCacheStats()` in `cache.ts` returns only entry counts. There is no way to determine whether the cache is effective (high hit rate) or wasteful (high eviction rate with low hit rate). Add hit, miss, and eviction counters to `LRUCache` and expose them via the `/system/stats` or health endpoint.

### 6.3 [Medium] Rule-match hit rates are not tracked

The pricing engine does not log which rule matched, or that no rule matched and the default margin was applied. Operators cannot tell which rules are actually being used versus which are dead configuration. Log the matched rule ID (or "no match") per consolidation batch, aggregated, not per diamond.

### 6.4 [Medium] Token error detection in Nivoda adapter is string-based

`packages/nivoda/src/adapter.ts` (lines 297–316) detects expired tokens by checking whether the error message string includes substrings like `"unauthenticated"` or `"token"`. If Nivoda changes their error message wording, the adapter will stop refreshing tokens and every worker call will fail until manual intervention. Check the GraphQL `errors[].extensions.code` field first; fall back to string matching only as a secondary heuristic.

### 6.5 [Low] `console.warn` used instead of structured logger in `adapter.ts`

`packages/nivoda/src/adapter.ts` line 258 uses `console.warn(...)` while the rest of the file uses the structured `logger`. Structured logs are parsed by the log aggregator; raw `console.warn` output is not correlated with trace IDs and may be suppressed in production log levels.

---

## 7. Input Validation & Error Handling

### 7.1 [Medium] `pricing-rules.ts` handlers do manual field validation instead of using `request-validator.ts`

The project has a `packages/api/src/middleware/request-validator.ts`. The pricing-rules handlers validate fields ad-hoc in the handler body (lines 141–156, 333–358). This means:
- Validation rules are not documented in one place.
- `priority` is not validated as a non-negative integer.
- `price_min < price_max` is not enforced.
- The epsilon for float comparison (`0.0001`, line 571) is a magic number with no explanation.

Move validation schemas to the validator middleware and add the missing constraints.

### 7.2 [Medium] `mapper.ts` throws on missing required fields with no context

`packages/nivoda/src/mapper.ts` lines 157–168 throw synchronously if required fields are absent:

```typescript
if (!item.diamond.carat) throw new Error('Missing required field: carat');
```

The error does not include the `offerId` or `supplierStoneId`, so the log tells an operator _that_ a record failed but not _which_ one. Add the identity fields to the error message, and consider whether a warning + skip is preferable to a hard throw that halts the entire consolidation batch.

### 7.3 [Low] Cascading `try-catch` in revert endpoint is hard to follow

The repricing revert endpoint (`pricing-rules.ts` ~lines 873–898) has a `try-catch` containing another `try-catch`. Flatten the error handling: use `finally` for cleanup and let errors propagate to the outer handler. This is a readability issue but hinders maintenance.

---

## 8. Configuration & Constants

### 8.1 [Medium] Color/intensity mapping tables are hardcoded in `mapper.ts`

`packages/nivoda/src/mapper.ts` contains large lookup tables for fluorescence, fancy colour, and intensity strings (lines 24–129). These are data that Nivoda could change with an API update, and any change requires a code deploy. Consider making them a JSON configuration file loaded at startup so they can be updated without a deploy.

### 8.2 [Low] `DEFAULT_MARGIN_MODIFIER = 0` is implicit and undocumented

`packages/pricing-engine/src/engine.ts` line 5:

```typescript
const DEFAULT_MARGIN_MODIFIER = 0;
```

The value is not exported, not mentioned in `constants.ts`, and not explained. If no pricing rule matches a diamond, it gets a 0% modifier silently. A zero modifier means the diamond is priced at base margin only — document that this is intentional (not a bug) and consider logging a warning when the fallback is used, so operators can detect un-priced diamonds.

### 8.3 [Low] `NIVODA_PROXY_TRANSPORT_TIMEOUT_MS` is hardcoded, not derived

`packages/shared/src/constants.ts` line 47:

```typescript
export const NIVODA_PROXY_TRANSPORT_TIMEOUT_MS = 65_000;
```

The comment says "must be > NIVODA_PROXY_TIMEOUT_MS" but the relationship is not enforced in code. If an operator changes `NIVODA_PROXY_TIMEOUT_MS` via env var to `70_000`, the transport timeout becomes lower than the proxy timeout, producing confusing 408s. Derive the transport timeout: `NIVODA_PROXY_TIMEOUT_MS + 5_000`.

---

## Summary

| Theme | Critical | High | Medium | Low |
|-------|----------|------|--------|-----|
| Schema / Migrations | 2 | — | 2 | 1 |
| Bugs & Invariants | — | 2 | 1 | — |
| Architecture / Duplication | — | 3 | 3 | 2 |
| Security | — | 2 | 2 | 1 |
| Performance | — | — | 3 | 2 |
| Reliability / Observability | — | 1 | 3 | 1 |
| Validation / Error Handling | — | — | 2 | 1 |
| Configuration | — | — | 1 | 3 |
| **Total** | **2** | **8** | **17** | **11** |

### Recommended fix order

1. **§1.1** — Renumber duplicate migration files (prevents future tooling breakage).
2. **§2.2** — Remove debug `console.log` from `Dashboard.tsx`.
3. **§1.2** — Fix `UNIQUE(supplier_stone_id)` → `UNIQUE(supplier_stone_id, offer_id)` on `raw_diamonds_nivoda`.
4. **§1.3** — Fix `UNIQUE(error_message)` on `error_logs`.
5. **§2.1** — Add `getEnvInt` helper to prevent silent `NaN` from empty env vars.
6. **§4.1** — Move API key out of `localStorage`.
7. **§4.2** — Add LRU eviction or TTL cleanup to `authFailures` Map.
8. **§3.3** — Split `pricing-rules.ts` and remove duplicate repricing trigger block.
9. **§6.1** — Verify the stall-monitor is started on API init; add a test for stuck job recovery.
10. **§5.2** — Switch money arithmetic to integer cents or a `Decimal` library.
