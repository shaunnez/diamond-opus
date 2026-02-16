# Project Research Summary

**Project:** Production Reliability Improvements - Diamond Inventory Platform
**Domain:** Distributed data pipeline infrastructure (Azure Container Apps)
**Researched:** 2026-02-17
**Confidence:** HIGH

## Executive Summary

The diamond inventory platform is a production TypeScript/Node.js microservices architecture on Azure Container Apps requiring critical reliability and observability improvements. Research focused on four key areas: rate limiting for horizontal scaling, observability via distributed tracing and health checks, reliability patterns for data consistency, and infrastructure hardening.

The platform currently runs a message-driven pipeline (scheduler → workers → consolidator) with an API serving Shopify integrations, processing diamond inventory from vendor APIs at 25 req/s. The primary constraint preventing horizontal scaling is per-replica rate limiting, while production gaps include missing health probes, no distributed tracing, silent alert failures, and several race conditions in data processing.

The recommended approach prioritizes high-impact, low-complexity improvements: dedicated ingestion proxy for rate limiting (2-4 hours), OpenTelemetry distributed tracing (2-3 days), health check infrastructure (1 day), and critical reliability fixes including pricing rule locking, LRU cache replacement, and input validation (8-16 hours total). Key risks include premature optimization (mitigated by phased approach), operational complexity (mitigated by choosing simple patterns), and deployment coordination (mitigated by feature flags and incremental rollout).

## Key Findings

### Rate Limiting & Scaling (RATE_LIMITING.md)

**Problem:** API stuck at 1 replica due to in-memory rate limiter constraint. Per-replica independent rate limiting means N replicas = N × 25 req/s to Nivoda, violating vendor's 25 req/s limit. Cannot horizontally scale to handle Shopify traffic spikes.

**Recommended Solution:** Dedicated Ingestion Proxy (Pattern 1)
- Deploy separate Container App specifically for ingestion proxy (single replica, internal ingress only)
- Reuse existing in-memory rate limiter code at fixed 1 replica (25 req/s exactly)
- Customer API scales independently (2-10 replicas) without rate limit concerns
- Confidence: HIGH
- Complexity: LOW
- Cost: ~$10/month (minimal)
- Effort: 2-4 hours

**Alternative Considered:** Redis-backed distributed rate limiter
- True global rate limiting across all replicas
- Adds operational complexity (Redis monitoring, connection pooling, failure modes)
- Latency overhead (~20-50ms p99)
- Only needed if ingestion proxy must scale horizontally (unlikely given vendor constraint)
- Confidence: HIGH but higher complexity/cost

**Key Takeaway:** Separation of concerns unlocks scaling. Ingestion and customer workloads should not share infrastructure when they have conflicting constraints.

### Observability & Monitoring (OBSERVABILITY.md)

**Critical Gaps Identified:**
1. **No distributed tracing** - Cannot trace requests across scheduler → worker → consolidator flow
2. **No health probes configured** - Services deployed without readiness/liveness/startup probes
3. **Silent alert failures** - Resend email only, no delivery confirmation or fallback channels
4. **No DLQ monitoring** - Failed messages accumulate in dead-letter queues without alerts
5. **Inconsistent error logging** - No centralized error aggregation or trace correlation

**Recommended Solutions:**

**1. Distributed Tracing (OpenTelemetry + Application Insights)**
- Install `@azure/monitor-opentelemetry` packages
- Initialize telemetry in all services
- Implement Service Bus context propagation (manual inject/extract via applicationProperties)
- Enable Pino instrumentation for automatic trace_id/span_id injection
- Confidence: HIGH (Azure's standard approach)
- Effort: 2-3 days

**2. Health Checks**
- Add `/health/startup`, `/health/live`, `/health/ready` endpoints to API
- Add health HTTP server to worker/consolidator (port 8080)
- Configure liveness/readiness/startup probes in Terraform for all Container Apps
- Confidence: HIGH (Kubernetes-based, mature)
- Effort: 1 day

**3. DLQ Monitoring & Recovery**
- Create Azure Monitor metric alerts for DLQ message count (>0 threshold)
- Implement DLQ processor (log to database for manual inspection)
- Build resubmit workflow (API endpoint + UI in dashboard)
- Confidence: HIGH (standard pattern)
- Effort: 2 days

**4. Alert Reliability**
- Create Azure Monitor Action Groups for critical alerts (email + SMS + webhook)
- Migrate critical alerts to Action Groups (consolidation failure, DLQ accumulation)
- Keep Resend for non-critical alerts (repricing jobs, etc.)
- Add alert delivery monitoring in Application Insights
- Confidence: MEDIUM (requires testing)
- Effort: 1 day

**Key Takeaway:** OpenTelemetry + health checks are foundational for production readiness. Distributed tracing provides end-to-end visibility; health checks enable automatic recovery and zero-downtime deployments.

### Reliability & Error Handling (RELIABILITY.md)

**Critical Issues Identified:**

**1. Pricing Rule Race Condition**
- Symptom: `invalid input syntax for type boolean: "100%"` during consolidation
- Root Cause: Pricing rules loaded once at startup; dashboard updates rules mid-consolidation
- Impact: Stale rules or data type mismatches cause consolidation failures
- Solution: Hybrid optimistic concurrency (version column) + consolidation flag
- Confidence: HIGH
- Effort: 4 hours

**2. LRU Cache Concurrency Issues**
- Current Map-based LRU uses delete/re-insert pattern; under high concurrency causes cache thrashing
- Low hit rates (20-30%), CPU overhead, poor performance
- Solution: Replace with `lru-cache` npm package (battle-tested, 40M weekly downloads)
- Confidence: HIGH
- Effort: 2 hours

**3. Input Validation Gaps**
- Price range filtering accepts unvalidated user input; no range span limits
- Impact: Unbounded queries, potential DoS, extreme range probing
- Solution: Implement Zod validation for all API endpoints and environment variables
- Confidence: HIGH
- Effort: 8 hours

**4. Consolidator Stuck Claim TTL**
- 30-minute TTL means dead consolidators hold claims for extended periods
- Solution: Replace with PostgreSQL `FOR UPDATE SKIP LOCKED` pattern (automatic cleanup)
- Confidence: HIGH
- Effort: 2 hours

**5. Worker Partition Progress State Machine**
- State transitions (pending → running → completed → failed) not formalized
- Race conditions on offset updates; inconsistent state
- Solution: Add explicit `state` enum column, transition validation logic
- Confidence: MEDIUM (requires comprehensive testing)
- Effort: 16 hours

**6. Configuration Persistence**
- Worker auto-consolidation delay is in-memory only; pod restarts lose scheduled messages
- Solution: Store configuration in database, rely on Service Bus ScheduledEnqueueTimeUtc
- Confidence: MEDIUM
- Effort: 4 hours

**Key Takeaway:** Race conditions and concurrency issues are the platform's highest technical debt. Optimistic locking patterns, library replacements, and input validation provide immediate reliability improvements with low risk.

### Infrastructure & Health Checks (INFRASTRUCTURE.md)

**Production Requirements:**
- Zero-downtime deployments
- Automatic failure recovery
- Observable health status
- Protected API endpoints from resource exhaustion

**Health Check Implementation:**

Azure Container Apps supports three probe types:
1. **Startup Probe** - Validates initialization (prevents premature restarts)
2. **Liveness Probe** - Detects hung processes (restarts container)
3. **Readiness Probe** - Controls traffic routing (removes from load balancer)

**Recommended Configuration:**

**API (Express REST):**
```
Startup: HTTP /health/startup, 5s interval, 12 failures = 60s max
Liveness: HTTP /health/live, 10s interval, 3 failures = restart
Readiness: HTTP /health/ready, 5s interval, checks DB + cache health
```

**Worker/Consolidator (Service Bus consumers):**
```
Liveness: TCP port 3001 (dedicated health server), 30s interval
Readiness: HTTP /health/ready (checks message receiver state)
```

**Graceful Shutdown:**
- Implement `@godaddy/terminus` for SIGTERM handling
- 30s grace period for draining in-flight requests
- Stop background services (cache polling, monitoring)
- Close database pool cleanly

**Cache Invalidation:**
- Current: Version-based polling (30s interval, eventually consistent)
- Enhancement: Event-driven via Service Bus topic (near-instant, <1s latency)
- Recommendation: Keep polling as fallback, add events if real-time needed

**API Rate Limiting:**
- Current: Nivoda proxy rate limiting only
- Gap: No rate limiting on data export endpoints
- Solution: Per-endpoint rate limiting (search: 100/min, export: 10/min, writes: 50/min)
- Implementation: Token bucket per client, in-memory per replica

**Key Takeaway:** Health probes are critical for production deployment safety. Default TCP probes insufficient; custom HTTP probes with dependency validation required for zero-downtime deployments.

## Implications for Roadmap

Based on research, suggested phase structure optimizes for **impact vs complexity**, prioritizing high-value, low-risk improvements that unlock subsequent phases.

### Phase 1: Rate Limiting Separation (CRITICAL)
**Rationale:** Blocks horizontal scaling of customer API; highest business impact. Dedicated ingestion proxy is simplest solution (reuse existing code, no shared state).

**Delivers:**
- Customer API can scale to 2-10 replicas independently
- Ingestion workload isolated from customer query workload
- Single point of rate limit enforcement (no drift)

**Addresses:**
- Constraint preventing API horizontal scaling (RATE_LIMITING.md)
- Separation of concerns for conflicting workload requirements

**Avoids:**
- Redis operational complexity (Pattern 2)
- Azure APIM cost/latency overhead (Pattern 3)

**Effort:** 2-4 hours
**Confidence:** HIGH
**Research Needed:** NO (pattern proven, implementation clear)

---

### Phase 2: Observability Foundation (HIGH PRIORITY)
**Rationale:** Distributed tracing and health checks are foundational for production operations. Must precede reliability fixes to enable debugging and automatic recovery.

**Delivers:**
- End-to-end request tracing (scheduler → worker → consolidator)
- Automatic failure recovery via health probes
- Zero-downtime deployments via readiness probes
- Correlated logs and traces (trace_id injection)

**Addresses:**
- No distributed tracing (OBSERVABILITY.md)
- No health probes configured (INFRASTRUCTURE.md)
- Insufficient error correlation (RELIABILITY.md)

**Avoids:**
- Manual log correlation across services
- Downtime during deployments
- Silent failures (hung processes)

**Effort:** 3-4 days (2-3 days tracing, 1 day health checks)
**Confidence:** HIGH
**Research Needed:** NO (OpenTelemetry + Application Insights is Azure standard)

---

### Phase 3: Critical Reliability Fixes (HIGH PRIORITY)
**Rationale:** Pricing rule race condition causes consolidation failures; LRU cache thrashing degrades API performance; input validation prevents DoS. All have low effort, high confidence solutions.

**Delivers:**
- Pricing rule consistency during consolidation
- LRU cache hit rate improvement (70%+ vs 20-30%)
- Input validation on all API endpoints
- Consolidator claim automatic cleanup

**Addresses:**
- Pricing rule race condition (RELIABILITY.md)
- LRU cache concurrency issues (RELIABILITY.md)
- Input validation gaps (RELIABILITY.md)
- Consolidator stuck claim TTL (RELIABILITY.md)

**Avoids:**
- "100%" boolean errors during consolidation
- Cache thrashing under high load
- Unbounded query attacks

**Effort:** 8-16 hours total (4h pricing, 2h cache, 8h validation, 2h claims)
**Confidence:** HIGH
**Research Needed:** NO (established patterns with proven libraries)

---

### Phase 4: DLQ Monitoring & Alert Reliability (MEDIUM PRIORITY)
**Rationale:** Prevents silent data loss and ensures critical alerts are delivered. Lower priority than tracing/health checks but higher than optimizations.

**Delivers:**
- Alerts on DLQ message accumulation
- DLQ message inspection and resubmit workflow
- Multi-channel alerting (email + SMS + webhook)
- Alert delivery monitoring

**Addresses:**
- No DLQ monitoring (OBSERVABILITY.md)
- Silent alert failures (OBSERVABILITY.md)

**Avoids:**
- Silent message loss in DLQs
- Missed critical alerts (single channel failure)

**Effort:** 3 days (2 days DLQ, 1 day alert reliability)
**Confidence:** HIGH (DLQ), MEDIUM (Action Groups require testing)
**Research Needed:** NO (standard Azure patterns)

---

### Phase 5: State Machine Formalization (OPTIONAL)
**Rationale:** Worker partition progress state machine formalization prevents race conditions but requires comprehensive testing. Lower priority; current offset guards functional.

**Delivers:**
- Explicit state enum (pending/running/completed/failed)
- Transition validation logic
- Retry tracking and exponential backoff
- Monitoring queries for stuck partitions

**Addresses:**
- Worker partition progress state machine (RELIABILITY.md)

**Avoids:**
- Duplicate processing from race conditions
- Inconsistent partition state

**Effort:** 16 hours (includes testing)
**Confidence:** MEDIUM (requires comprehensive testing)
**Research Needed:** NO (state machine patterns well-documented)

---

### Phase 6: Enhancements (LOW PRIORITY)
**Rationale:** Incremental improvements with lower urgency. Nice-to-have optimizations after foundational issues resolved.

**Delivers:**
- Event-driven cache invalidation (real-time)
- Per-endpoint API rate limiting (export protection)
- Configuration persistence (auto-consolidation delay)
- Application Insights dashboards (operations visibility)

**Addresses:**
- Cache invalidation latency (INFRASTRUCTURE.md)
- API rate limiting gaps (INFRASTRUCTURE.md)
- Configuration persistence (RELIABILITY.md)
- Dashboards for pipeline health (OBSERVABILITY.md)

**Effort:** 5-7 days spread across multiple features
**Confidence:** MEDIUM-HIGH
**Research Needed:** NO

---

### Phase Ordering Rationale

**Why this order:**

1. **Phase 1 (Rate Limiting)** - Unblocks business need (API scaling for Shopify traffic). Simplest solution wins (dedicated proxy vs distributed state).

2. **Phase 2 (Observability)** - Foundation for debugging subsequent changes. Tracing + health checks enable safe deployments and automatic recovery. Must precede reliability fixes to validate behavior.

3. **Phase 3 (Reliability)** - High-impact fixes with low effort. Pricing rule races cause production failures; cache thrashing degrades performance; validation prevents attacks. All have proven solutions.

4. **Phase 4 (DLQ/Alerts)** - Prevents silent failures. Lower priority than active issues but higher than optimizations.

5. **Phase 5 (State Machine)** - Nice-to-have formalization. Current offset guards functional; this prevents edge case race conditions. Requires significant testing effort.

6. **Phase 6 (Enhancements)** - Incremental improvements. No urgent business need; can be deferred or split across future iterations.

**Dependency chain:**
- Rate limiting is independent (Phase 1 can proceed immediately)
- Observability (Phase 2) should precede reliability fixes (Phase 3) to enable validation
- DLQ/Alerts (Phase 4) can run parallel to Phase 3
- State machine (Phase 5) and enhancements (Phase 6) can be deferred

**Risk mitigation through phasing:**
- Start with simple, isolated changes (dedicated proxy, health checks)
- Add observability before complex changes (tracing before reliability fixes)
- Defer lower-confidence items to later phases (state machine formalization)

### Research Flags

**Phases NOT needing deeper research during planning:**
- **Phase 1 (Rate Limiting):** Dedicated proxy pattern clear from research; Terraform implementation straightforward
- **Phase 2 (Observability):** OpenTelemetry + Application Insights is Azure standard; health probe configuration well-documented
- **Phase 3 (Reliability):** All solutions use established patterns (optimistic locking, lru-cache library, Zod validation, SKIP LOCKED)
- **Phase 4 (DLQ/Alerts):** Azure Monitor patterns documented; Service Bus DLQ monitoring standard

**Phases potentially needing validation during planning:**
- **Phase 5 (State Machine):** Complex state transitions require comprehensive test scenarios; consider load testing before production rollout
- **Phase 6 (Enhancements):** Event-driven cache invalidation adds Service Bus dependency; validate message delivery guarantees

**Standard patterns (high confidence):**
- Dedicated service proxy (separation of concerns)
- OpenTelemetry distributed tracing
- Health probes (startup/liveness/readiness)
- Optimistic concurrency (version column)
- PostgreSQL SKIP LOCKED (queue pattern)
- Zod validation (TypeScript standard)
- `lru-cache` library (40M weekly downloads)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Rate Limiting** | HIGH | Dedicated proxy is proven architectural pattern; Redis patterns also well-documented if needed |
| **Observability** | HIGH | OpenTelemetry + Application Insights is Azure's standard; extensive Microsoft docs and examples |
| **Reliability** | HIGH | Database patterns (optimistic locking, SKIP LOCKED) from official PostgreSQL docs; library solutions battle-tested |
| **Infrastructure** | HIGH | Health probes based on Kubernetes patterns; Azure Container Apps docs comprehensive |

**Overall confidence:** HIGH

All recommended solutions have official documentation, production examples, or battle-tested library implementations. No experimental patterns or unproven technologies.

### Gaps to Address

1. **Azure Monitor Action Groups testing** - Action Groups (email + SMS + webhook) not tested in this environment. Should validate delivery in staging before production rollout.

2. **Application Insights cost** - Unknown current log volume. Enable sampling if ingestion exceeds 5GB/month free tier. Monitor high-cardinality custom dimensions (diamondId, partitionId).

3. **Worker/Consolidator startup time** - Unknown actual startup duration. May need to adjust startup probe `failure_threshold` after observing initialization time in staging.

4. **Service Bus SBMP protocol retirement** - September 30, 2026 deadline. Verify `@azure/service-bus` version >= 7.x (uses AMQP instead of legacy SBMP).

5. **DLQ manual inspection workflow** - Resubmit workflow design not finalized. Should design dashboard UI for DLQ management during Phase 4 planning.

**Mitigation strategies:**
- All gaps have low risk; can be addressed during phase planning or execution
- Action Groups and startup probes: validate in staging before production
- Application Insights cost: monitor usage, enable sampling if needed
- Service Bus SDK: check version, upgrade if <7.x
- DLQ workflow: design during Phase 4 planning with user feedback

None of these gaps block phase execution; all have clear resolution paths.

## Sources

### High Confidence (Official Documentation)

**Rate Limiting & Scaling:**
- [Rate Limiting pattern - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern)
- [Redis Rate Limiting](https://redis.io/glossary/rate-limiting/)
- [Azure Cache for Redis - Monitor | Microsoft Learn](https://learn.microsoft.com/en-us/azure/redis/monitor-cache)
- [API gateways - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway)

**Observability & Monitoring:**
- [Azure Application Insights distributed tracing with Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-end-to-end-tracing)
- [OpenTelemetry on Azure](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry)
- [Service Bus dead-letter queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)
- [Health probes in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)
- [Best practices for Azure Monitor alerts](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/best-practices-alerts)

**Reliability & Error Handling:**
- [PostgreSQL Documentation: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL Documentation: Concurrency Control](https://www.postgresql.org/docs/current/mvcc.html)
- [Zod Official Documentation](https://zod.dev/)
- [lru-cache npm package](https://www.npmjs.com/package/lru-cache) (40M weekly downloads)

**Infrastructure:**
- [Health probes in Azure Container Apps | Microsoft Learn](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)
- [azurerm_container_app - Terraform Registry](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app)
- [Express.js Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)

### Medium Confidence (Technical Articles, 2025-2026)

**Rate Limiting:**
- [How to Build a Distributed Rate Limiter with Redis](https://oneuptime.com/blog/post/2026-01-21-redis-distributed-rate-limiter/view) (Jan 2026)
- [Rate Limiting: Dynamic Distributed Rate Limiting with Redis | Medium](https://medium.com/@m-elbably/rate-limiting-a-dynamic-distributed-rate-limiting-with-redis-339f9504200f)

**Observability:**
- [Propagate OpenTelemetry Context via Azure Service Bus](https://www.twilio.com/en-us/blog/developers/community/propagate-opentelemetry-context-via-azure-service-bus-for-async-dotnet-services)
- [DLQ monitoring and automation patterns](https://turbo360.com/blog/azure-service-bus-dead-letter-queue-monitoring)
- [Pino + OpenTelemetry structured logging](https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0)

**Reliability:**
- [How to Use Advisory Locks in PostgreSQL](https://oneuptime.com/blog/post/2026-01-25-use-advisory-locks-postgresql/view) (Jan 2026)
- [How to Validate Data with Zod in TypeScript](https://oneuptime.com/blog/post/2026-01-25-zod-validation-typescript/view) (Jan 2026)
- [Using FOR UPDATE SKIP LOCKED for Queue-Based Workflows](https://www.netdata.cloud/academy/update-skip-locked/)
- [Optimistic Locking: Concurrency Control with a Version Column](https://medium.com/@sumit-s/optimistic-locking-concurrency-control-with-a-version-column-2e3db2a8120d)
- [High-Throughput, Thread-Safe, LRU Caching](https://innovation.ebayinc.com/stories/high-throughput-thread-safe-lru-caching/)

**Infrastructure:**
- [Container Apps: Troubleshooting with Health Probes](https://azureossd.github.io/2023/08/23/Container-Apps-Troubleshooting-and-configuration-with-Health-Probes/)
- [How to implement a health check in Node.js - LogRocket](https://blog.logrocket.com/how-to-implement-a-health-check-in-node-js/)
- [How to Add Rate Limiting to Express APIs](https://oneuptime.com/blog/post/2026-02-02-express-rate-limiting/view) (Feb 2026)

### Community Resources

**Patterns & Best Practices:**
- [OpenStack Docs: States](https://docs.openstack.org/taskflow/pike/user/states.html) (state machine patterns)
- [MassTransit State Machine](https://masstransit.io/documentation/patterns/saga/state-machine) (workflow state patterns)
- [API Rate Limiting at Scale: Patterns, Failures, Control Strategies](https://www.gravitee.io/blog/rate-limiting-apis-scale-patterns-strategies)

---

**Research completed:** 2026-02-17
**Ready for roadmap:** YES
**Next step:** Create phase-by-phase roadmap with detailed technical specs and validation criteria
