# Requirements: Diamond Platform Technical Debt Cleanup

**Defined:** 2026-02-17
**Core Value:** Reliable, observable ingestion pipeline that strictly enforces 25 req/s global rate limit to Nivoda during ingestion while enabling independent horizontal scaling of customer-facing API for high-traffic Shopify queries.

## v1 Requirements

Requirements for this technical debt cleanup milestone.

### Rate Limiting & Scaling

- [ ] **RATE-01**: Dedicated ingestion proxy deployed as separate Container App (single replica, internal ingress only)
- [ ] **RATE-02**: Scheduler and worker services route Nivoda requests through dedicated ingestion proxy
- [ ] **RATE-03**: Customer API can scale to 2-10 replicas without affecting Nivoda rate limit
- [ ] **RATE-04**: True 25 req/s global limit enforced to Nivoda during ingestion (verified under load)
- [ ] **RATE-05**: Health checks configured for ingestion proxy in Terraform

### Reliability Fixes

- [ ] **REL-01**: Pricing rules cannot be updated during active consolidation (database-level prevention)
- [ ] **REL-02**: Pricing rule version column added with optimistic concurrency control
- [ ] **REL-03**: Custom LRU cache replaced with `lru-cache` npm library
- [ ] **REL-04**: LRU cache hit rate improves to 70%+ (vs current 20-30%)
- [ ] **REL-05**: Input validation added for price range filters (Zod schemas)
- [ ] **REL-06**: Input validation added for all API endpoint parameters
- [ ] **REL-07**: Environment variable validation at service startup
- [ ] **REL-08**: Consolidator claim acquisition uses `FOR UPDATE SKIP LOCKED` pattern
- [ ] **REL-09**: Stuck consolidator claims cleaned up automatically on process crash
- [ ] **REL-10**: "100%" boolean error in consolidation eliminated (validated via logs)

### State Machine & Configuration

- [ ] **STATE-01**: Worker partition progress uses explicit state enum (pending/running/completed/failed)
- [ ] **STATE-02**: State transitions validated with transition rules
- [ ] **STATE-03**: Race conditions on partition offset updates prevented
- [ ] **STATE-04**: Retry tracking added with exponential backoff
- [ ] **STATE-05**: Monitoring queries added for stuck partitions
- [ ] **STATE-06**: Auto-consolidation delay configuration persisted in database
- [ ] **STATE-07**: Auto-consolidation delay survives worker pod restarts

### Authentication

- [ ] **AUTH-01**: HMAC authentication removed from API middleware
- [ ] **AUTH-02**: API key-only authentication enforced on all endpoints
- [ ] **AUTH-03**: HMAC-related code and dependencies removed from codebase
- [ ] **AUTH-04**: API documentation updated to reflect API key-only auth

## v2 Requirements

Deferred to future release (observability infrastructure).

### Observability Foundation

- **OBS-01**: OpenTelemetry distributed tracing integrated with Application Insights
- **OBS-02**: Service Bus context propagation implemented (manual inject/extract)
- **OBS-03**: Trace ID and span ID automatically injected into Pino logs
- **OBS-04**: Health check endpoints added to all services (`/health/startup`, `/health/live`, `/health/ready`)
- **OBS-05**: Terraform health probes configured for all Container Apps (startup/liveness/readiness)
- **OBS-06**: Graceful shutdown handling implemented with SIGTERM

### DLQ & Alert Reliability

- **DLQ-01**: Azure Monitor metric alerts created for DLQ message count (>0 threshold)
- **DLQ-02**: DLQ processor implemented to log failed messages to database
- **DLQ-03**: Resubmit workflow added (API endpoint + dashboard UI)
- **ALERT-01**: Critical alerts migrated to Azure Monitor Action Groups (email + SMS + webhook)
- **ALERT-02**: Alert delivery monitoring added in Application Insights
- **ALERT-03**: Non-critical alerts keep using Resend

### Error Logging

- **LOG-01**: Error logging patterns standardized across all services
- **LOG-02**: Stack trace depth increased for better debugging
- **LOG-03**: Custom metrics added for key operations
- **LOG-04**: Raw body capture improved in auth middleware

### Enhancements

- **CACHE-01**: Event-driven cache invalidation via Service Bus topic
- **LIMIT-01**: Per-endpoint rate limiting added (search: 100/min, export: 10/min)
- **INFRA-01**: Application Insights workbook created for pipeline health
- **INFRA-02**: Heatmap algorithm documentation updated with adaptive stepping details

## Out of Scope

| Feature | Reason |
|---------|--------|
| Redis-backed distributed rate limiter | Dedicated proxy is simpler and sufficient; Redis only needed if ingestion must scale horizontally |
| Azure API Management | Cost ($260-500/month) and latency overhead don't justify for simple rate limiting |
| Service Bus SDK upgrade | Current version check shows >= 7.x (AMQP protocol) already in use |
| Multi-region deployment | Single region sufficient for initial production launch |
| Real-time cache invalidation | Current 30s polling is acceptable for use case; event-driven can be added in v2 if needed |
| Frontend redesign | UI improvements not in scope for technical debt cleanup |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RATE-01 | TBD | Pending |
| RATE-02 | TBD | Pending |
| RATE-03 | TBD | Pending |
| RATE-04 | TBD | Pending |
| RATE-05 | TBD | Pending |
| REL-01 | TBD | Pending |
| REL-02 | TBD | Pending |
| REL-03 | TBD | Pending |
| REL-04 | TBD | Pending |
| REL-05 | TBD | Pending |
| REL-06 | TBD | Pending |
| REL-07 | TBD | Pending |
| REL-08 | TBD | Pending |
| REL-09 | TBD | Pending |
| REL-10 | TBD | Pending |
| STATE-01 | TBD | Pending |
| STATE-02 | TBD | Pending |
| STATE-03 | TBD | Pending |
| STATE-04 | TBD | Pending |
| STATE-05 | TBD | Pending |
| STATE-06 | TBD | Pending |
| STATE-07 | TBD | Pending |
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| AUTH-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 26 ⚠️

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after initial definition*
