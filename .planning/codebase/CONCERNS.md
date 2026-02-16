# Codebase Concerns

**Analysis Date:** 2026-02-17

## Tech Debt

**Silent Alert Failures in Worker and Consolidator:**
- Issue: Alert emails are sent asynchronously with `.catch(() => {})` patterns throughout error handling paths
- Files: `apps/worker/src/index.ts` (lines 310-334), `apps/consolidator/src/index.ts` (line 263)
- Impact: Email notifications fail silently without logged evidence. Operators don't know if alerts were actually sent during run completion, partial success, or consolidation failures. Makes incident response harder.
- Fix approach: Implement structured logging for all email send results; add optional retry with exponential backoff for transient failures; track notification delivery status in database as part of run metadata.

**Duplicate `fancy_color` Field in Schema:**
- Issue: `fancy_color` appears twice in diamonds table (line 89 and 113 of `sql/full_schema.sql`)
- Files: `sql/full_schema.sql`
- Impact: Schema inconsistency that could cause confusion and potential data mapping errors. Unclear which column is authoritative.
- Fix approach: Investigate schema migration history; consolidate to single `fancy_color` column; update all queries and mappers accordingly.

**Raw Body Capture in Auth Middleware:**
- Issue: `captureRawBody` in `packages/api/src/middleware/auth.ts` buffers entire request body in memory as string
- Files: `packages/api/src/middleware/auth.ts` (lines 116-129)
- Impact: Large request bodies could cause memory exhaustion or DoS risk. No size limits enforced.
- Fix approach: Add strict size limit (e.g., 10MB); use streaming with size checks; consider only capturing for small payloads or specific endpoints.

**Inconsistent Error Logging Pattern:**
- Issue: Some catch blocks silently swallow errors; others don't specify `unknown` type correctly
- Files: `apps/worker/src/index.ts` (lines 338-393), `apps/consolidator/src/index.ts` (lines 319-337)
- Impact: Difficult to correlate errors across services; inconsistent stack trace capture and formatting.
- Fix approach: Standardize error handling with typed catch clauses; ensure all errors are logged with context; use `safeLogError` helper consistently.

## Known Bugs

**Potential HMAC Timestamp Race Condition:**
- Symptoms: Requests with valid HMAC signatures rejected for being slightly outside the 5-minute tolerance window
- Files: `packages/api/src/middleware/auth.ts` (line 54), `packages/shared/src/constants.ts` defines `HMAC_TIMESTAMP_TOLERANCE_SECONDS = 300`
- Trigger: Occurs when client system clock is ahead of server, or during clock synchronization events
- Workaround: Ensure strict clock synchronization on all client and server systems; consider increasing tolerance to 10 minutes.

**Rate Limiter Queue Timeout Doesn't Account for Processing Delay:**
- Symptoms: Requests get a 429 "Rate limit wait timeout" even though they were queued quickly, if the window resets slowly
- Files: `packages/api/src/middleware/rateLimiter.ts` (lines 56-71)
- Trigger: High concurrency with rapid window resets; queued request waits `maxWaitMs` but doesn't get drained before timeout expires
- Workaround: Monitor queue depth via logs; increase `NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS`; consider adjusting `maxRequestsPerWindow` downward.

**Cache Version Polling Not Synchronized Across Replicas:**
- Symptoms: Different API replicas may have stale cache versions for a few seconds; requests may hit old cache on one replica while another has fresh data
- Files: `packages/api/src/services/cache.ts` (lines 29-42, 215-232)
- Trigger: Version polling runs independently on each replica every 30s; version changes become visible at different times
- Impact: Eventual consistency is achieved but creates a brief window of inconsistency (max 30 seconds)
- Workaround: This is acceptable for most use cases; if stricter consistency needed, consider shared cache invalidation via Redis or database-driven invalidation.

**Worker Auto-Consolidation Delay Not Persisted Across Restarts:**
- Symptoms: If a worker pod crashes between triggering auto-consolidation (with delay) and consolidation starting, the delayed message is lost
- Files: `apps/worker/src/index.ts` (lines 321-323, 370-372)
- Trigger: Worker receives worker-done messages, queues consolidation with `AUTO_CONSOLIDATION_DELAY_MINUTES` delay
- Impact: Consolidation may not start if pod restarts during delay window
- Fix approach: Use durable message scheduling (Service Bus ScheduledEnqueueTimeUtc); store pending consolidations in database with state machine.

## Security Considerations

**API Key Hash Collision Risk (Low):**
- Risk: SHA256 is used but collisions are theoretically possible; no rate limiting on API key validation
- Files: `packages/api/src/middleware/auth.ts` (line 25), `packages/database/src/queries/api-keys.ts`
- Current mitigation: Database query is indexed and fast; SHA256 collisions are astronomically unlikely; HMAC provides second layer
- Recommendations: Add rate limiting on failed auth attempts per IP; implement key rotation policy; consider 256-bit random key generation with server-side hashing.

**HMAC Secret Exposure in Environment Variables:**
- Risk: `HMAC_SECRETS` is a JSON object stored in environment, vulnerable to logging/dumps
- Files: `packages/api/src/middleware/auth.ts` (line 19), `packages/shared/src/utils/env.ts`
- Current mitigation: Described in CLAUDE.md as being in `HMAC_SECRETS` env var
- Recommendations: Store secrets in AWS Secrets Manager or Azure Key Vault instead; implement secret rotation mechanism; audit all code paths that might log env vars; ensure CI/CD logs are scrubbed.

**Insufficient Input Validation on Price Ranges:**
- Risk: Price filtering accepts user input without range validation; could enable probing or DoS
- Files: `packages/api/src/routes/` (diamond search endpoints)
- Current mitigation: Heatmap has `HEATMAP_MAX_PRICE = 50000` but only affects scheduling, not API queries
- Recommendations: Add strict validation on price filter parameters; limit range span (e.g., max 10x range); implement server-side capping to prevent extreme range queries.

**Consolidator Stuck Claim Reset TTL Could Hide Failures:**
- Risk: `CONSOLIDATOR_CLAIM_TTL_MINUTES = 30` means stuck consolidators' claims won't reset for 30 minutes; if they're truly dead, data sits unclaimed
- Files: `apps/consolidator/src/index.ts` (line 167), `packages/shared/src/constants.ts`
- Current mitigation: Stuck claim detection is logged; manual intervention available via CLI
- Recommendations: Reduce TTL to 10 minutes; add monitoring alert if unclaimed raw diamonds exceed threshold; implement distributed lock with heartbeats instead of TTL.

**Rate Limiter Per-Replica Design Creates Global Bypass Risk:**
- Risk: If rate limit is 25 req/s per replica and there are 10 replicas, actual limit is 250 req/s (not enforced globally)
- Files: `packages/api/src/middleware/rateLimiter.ts` (comments on line 29)
- Current mitigation: Documented in CLAUDE.md; operators aware they need to coordinate replicas
- Recommendations: Implement Redis-backed global rate limiter; or add shared counter in database with distributed locks; or use API gateway-level rate limiting.

## Performance Bottlenecks

**Consolidator Batch Processing Doesn't Timeout Individual Diamonds:**
- Problem: `processBatch` loops through all diamonds for mapping/pricing; if one diamond takes extremely long, entire batch stalls
- Files: `apps/consolidator/src/index.ts` (lines 114-129)
- Cause: No per-diamond timeout; CPU-bound operations (pricing rules matching) could be slow on edge cases
- Improvement path: Add per-diamond timeout (e.g., 1 second); move failed diamonds to separate failed set; log slow diamonds for analysis.

**LRU Cache Eviction Under High Concurrency:**
- Problem: Cache uses Map insertion order; under high load, cache becomes thrashing between pages
- Files: `packages/api/src/services/cache.ts` (lines 58-116)
- Cause: Each unique filter/sort/page combination creates new cache entry; with thousands of possible combinations, cache fills quickly
- Impact: Low hit rate (20-30%) when cache size capped at 500 entries; CPU time spent on cache operations
- Improvement path: Implement probabilistic eviction (Tiny LFU); or increase `CACHE_MAX_ENTRIES` to 2000; or add bloom filter to detect non-cacheable queries early.

**Database Connection Pool Sized for Single Replica:**
- Problem: `PG_POOL_MAX` defaults to 2; when running multiple replicas, each replica exhausts 2 connections, totaling 2N connections
- Files: `packages/database/src/client.ts` (line 10), CLAUDE.md explains Supabase pooler limitations
- Cause: Supabase connection pooler has hard limit; recommend sizing per replica to avoid overload
- Improvement path: Document pool sizing formula; add runtime health check for connection availability; implement connection pool metrics.

**Heatmap Density Scan Could Time Out on Dense Datasets:**
- Problem: Heatmap scans 10 adaptive price buckets; each bucket calls `getCount`; if dataset has millions of records, many counts are slow
- Files: `packages/feed-registry/src/heatmap.ts`, `apps/scheduler/src/index.ts` (line 162)
- Cause: No timeout on individual heatmap count calls; no pagination on count results
- Impact: Scheduler could hang for 5+ minutes during large data ingestions
- Improvement path: Add per-bucket timeout (60s); implement approximate counts using sampling for dense zones; add heatmap result cache keyed by query hash.

**Raw Diamond Claiming Doesn't Use Batch Fetching Efficiently:**
- Problem: `claimUnconsolidatedRawDiamonds` claims `CONSOLIDATOR_BATCH_SIZE` (2000) but then chunks them into `CONSOLIDATOR_UPSERT_BATCH_SIZE` (100); lots of context switching
- Files: `apps/consolidator/src/index.ts` (lines 196-203), `packages/shared/src/constants.ts`
- Cause: Separation between claim granularity and upsert granularity adds overhead
- Improvement path: Align claim and upsert sizes; or reduce claim size to 500 and increase upsert chunks to match.

## Fragile Areas

**Worker Partition Progress State Machine:**
- Files: `apps/worker/src/index.ts` (lines 79-223), `packages/database/src/queries/partition-progress.ts`
- Why fragile: Multiple race conditions possible - if worker crashes mid-upsert, partition offset gets updated but diamonds may not have been written; offset/completed guards prevent re-entry but could cause message loss if guards are bypassed
- Safe modification: Add comprehensive tests for all state transitions; use database transactions for offset updates + upsert atomicity; add audit log for all partition state changes
- Test coverage: Lines 79-99 have guards but gaps exist for concurrent message processing

**Heatmap Algorithm with Adaptive Stepping:**
- Files: `packages/feed-registry/src/heatmap.ts`, `apps/scheduler/src/index.ts` (line 162)
- Why fragile: Dense zone (0-5000 $/ct) uses fixed $50 steps; sparse zone uses adaptive stepping based on live counts. If data distribution shifts mid-run, partition estimates become inaccurate and workers are unevenly loaded
- Safe modification: Add tests with multiple data distributions; implement partition rebalancing if any worker exceeds 2x average load; add heatmap result validation
- Test coverage: `apps/scheduler/__tests__/heatmap.test.ts` (221 lines) has good coverage but needs edge case testing

**Pricing Rule Matching Logic:**
- Files: `packages/pricing-engine/src/engine.ts`
- Why fragile: Pricing rules are loaded once at consolidator startup; if rules change during consolidation, some diamonds get old pricing, others get new; no transaction isolation
- Safe modification: Load rules per batch instead of once at startup; add pricing rule version to diamond records; implement A/B testing framework for pricing changes
- Test coverage: Needs comprehensive test of rule application across batch boundaries

**API Authentication Middleware Order:**
- Files: `packages/api/src/middleware/auth.ts`, `packages/api/src/middleware/nivodaProxyAuth.ts`
- Why fragile: If raw body capture middleware runs after auth, HMAC validation will see empty body; if order is wrong, API key validation could be bypassed for proxy routes
- Safe modification: Use explicit middleware composition tests; add comments documenting required order; consider combining into single middleware
- Test coverage: No tests visible for middleware order or interaction

**Cache Invalidation by Version Poll:**
- Files: `packages/api/src/services/cache.ts` (lines 29-42)
- Why fragile: Version polling could fail silently; cache would serve stale data indefinitely. If database is down but API is up, cache continues returning old data without warning
- Safe modification: Add alerts for version poll failures; implement fallback cache invalidation trigger (e.g., every 5 minutes force clear if poll fails 3x); add cache health metrics
- Test coverage: `initCacheService` and `pollVersions` have no error scenario tests

## Scaling Limits

**Consolidator Concurrency Bounded by Connection Pool:**
- Current capacity: `PG_POOL_MAX = 2` means max 2 concurrent batches even if `CONSOLIDATOR_CONCURRENCY = 2`
- Limit: With 2000 diamonds per batch and 100 per upsert, consolidator processes 2000 diamonds/iteration max despite concurrency config
- Scaling path: Increase pool to 5-10; or implement connection pooling within consolidator; or reduce batch sizes and increase concurrency proportionally

**Nivoda Proxy Rate Limiter is Per-Replica:**
- Current capacity: 25 req/s per API replica
- Limit: With 10 replicas, effective global limit is 250 req/s (NOT enforced as single limit)
- Scaling path: Implement Redis-backed global rate limiter; or add API gateway-level rate limiting; or document required replica count for target QPS

**Raw Diamond Table Scaling:**
- Current capacity: Single table `raw_diamonds_nivoda` expected to grow unbounded
- Limit: With millions of records, claims+updates will slow down; no partitioning strategy
- Scaling path: Implement time-based partitioning (monthly); archive old raw tables; or implement materialized view with rolling window

**Worker Idempotency Using Partition Progress:**
- Current capacity: Partition progress table tracks one record per partition per run
- Limit: With 100 runs in-flight and 10 partitions each, 1000 records. With 100,000 runs, scaling becomes issue.
- Scaling path: Archive old partition progress to separate table; add retention policy; implement cleanup triggered after run completion.

## Dependencies at Risk

**Azure Service Bus SDK (Python/Node.js):**
- Risk: Service Bus messages have 256KB size limit; work item messages approach limit with large filter configs
- Impact: Large runs could trigger message serialization failures
- Migration plan: Consider queue-based alternative (AWS SQS, RabbitMQ) or compress message payloads; add size validation on message creation.

**Nivoda GraphQL API Dependency:**
- Risk: Nivoda API changes (field renames, deprecations, format changes) break adapter; no versioning mechanism
- Impact: Entire pipeline halts if Nivoda schema changes
- Migration plan: Implement schema versioning in adapter; add smoke tests that validate Nivoda response format; establish SLA with Nivoda for change notifications.

**Resend Email Service:**
- Risk: Email service could be unavailable; alerts won't reach operators
- Impact: Incidents go unnoticed
- Migration plan: Implement webhook-based email delivery fallback; add SMS alerts; implement Slack/PagerDuty integration for critical alerts.

**PostgreSQL Supabase Connection Pooler:**
- Risk: Pooler is external service; if it fails, entire application goes down
- Impact: All workers, consolidator, and API become unable to access database
- Migration plan: Implement fallback to direct PostgreSQL connections; add health checks; consider multi-region database failover.

## Missing Critical Features

**No Audit Trail for Price Changes:**
- Problem: When pricing rules change or repricing happens, there's no audit log showing who changed what, when, and why
- Blocks: Regulatory compliance; debugging pricing disputes; analyzing impact of rule changes
- Recommended: Add audit_events table; log all pricing rule changes, repricing job creation, and individual diamond price deltas; implement audit UI in dashboard.

**No Dead-Letter Queue for Failed Messages:**
- Problem: If a work item or consolidation message can't be processed after retries, it disappears
- Blocks: Ability to recover from transient failures; visibility into persistent failures
- Recommended: Implement DLQ in Service Bus; add monitoring/alerting on DLQ depth; implement manual replay mechanism.

**No Distributed Tracing Across Services:**
- Problem: Trace IDs are generated but not propagated to all log contexts; difficult to correlate requests across services
- Blocks: Root cause analysis; performance profiling across pipeline
- Recommended: Implement OpenTelemetry; add trace ID to all database queries, external API calls, and message headers; visualize traces in APM tool (Datadog, New Relic).

**No Rate Limiting on Data Export:**
- Problem: API search endpoint has no limit on result set size; client could export entire database
- Blocks: DDoS prevention; data governance
- Recommended: Add configurable max result limit; implement CSV export with pagination; add permission checks for bulk exports.

## Test Coverage Gaps

**Worker Retry Logic Not End-to-End Tested:**
- What's not tested: Scenario where worker crashes mid-batch, then retry CLI is used to resume
- Files: `apps/worker/src/retry.ts`, `apps/worker/src/index.ts`
- Risk: Retry command could corrupt state if partition offset isn't properly synchronized
- Priority: High

**Consolidator Stuck Claim Recovery Not Tested:**
- What's not tested: Scenario where consolidator dies, its claim TTL expires, and another consolidator picks up the work
- Files: `apps/consolidator/src/index.ts` (lines 166-170)
- Risk: Duplicate processing or data loss if claim reset race condition occurs
- Priority: High

**Rate Limiter Behavior Under Sustained Load:**
- What's not tested: Queue depth grows beyond capacity; memory spike; timeout behavior is correct
- Files: `packages/api/src/middleware/rateLimiter.ts`
- Risk: Memory leaks; incorrect 429 responses; queue gets stuck
- Priority: Medium

**Cache Version Polling Failure Scenarios:**
- What's not tested: Database connection fails during polling; what happens to cache? Does stale data get served? Are errors logged?
- Files: `packages/api/src/services/cache.ts`
- Risk: Silent data staleness; no operator visibility
- Priority: Medium

**Pricing Engine Rule Evaluation Edge Cases:**
- What's not tested: Diamond with missing fields (null carats, null clarity); complex rule matching with AND/OR combinations
- Files: `packages/pricing-engine/src/engine.ts`
- Risk: Unexpected pricing application; inconsistent results
- Priority: Medium

**Heatmap Partitioning with Extreme Data:**
- What's not tested: Dataset with 0 records; dataset with all records at same price; dataset with only 1 record per partition
- Files: `packages/feed-registry/src/heatmap.ts`
- Risk: Partition imbalance; worker overload; scheduler hangs
- Priority: Medium

---

*Concerns audit: 2026-02-17*
