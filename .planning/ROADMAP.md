# Roadmap: Diamond Platform Technical Debt Cleanup

## Overview

This milestone eliminates production-blocking technical debt to enable horizontal scaling of the customer API while maintaining strict 25 req/s rate limit to Nivoda during ingestion. Work progresses from rate limiting separation (unblocks scaling) through observability foundation (enables safe deployments) to critical reliability fixes (prevents data corruption) and finally authentication simplification and state machine formalization. The roadmap delivers a production-ready platform with distributed tracing, health checks, and robust error handling.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Rate Limiting Separation** - Dedicated ingestion proxy enables API horizontal scaling
- [ ] **Phase 2: Authentication Simplification** - Remove HMAC auth, API key-only
- [ ] **Phase 3: Input Validation** - Zod schemas for API endpoints and environment variables
- [ ] **Phase 4: Pricing Rule Concurrency** - Optimistic locking prevents consolidation race conditions
- [ ] **Phase 5: LRU Cache Replacement** - Replace custom cache with battle-tested library
- [ ] **Phase 6: Consolidator Claim Management** - SKIP LOCKED pattern eliminates stuck claims
- [ ] **Phase 7: State Machine Formalization** - Explicit worker partition state transitions
- [ ] **Phase 8: Configuration Persistence** - Auto-consolidation delay survives restarts

## Phase Details

### Phase 1: Rate Limiting Separation
**Goal**: Customer API can scale horizontally (2-10 replicas) while maintaining strict 25 req/s global limit to Nivoda during ingestion
**Depends on**: Nothing (first phase)
**Requirements**: RATE-01, RATE-02, RATE-03, RATE-04, RATE-05
**Success Criteria** (what must be TRUE):
  1. Dedicated ingestion proxy deployed as separate Container App (single replica, internal ingress only)
  2. Scheduler and worker services successfully route all Nivoda requests through ingestion proxy
  3. Customer API can scale to 10 replicas without exceeding 25 req/s to Nivoda (verified under load test)
  4. Health checks configured and passing for ingestion proxy
  5. API search/export endpoints respond successfully with 10 API replicas running
**Plans**: 4 plans in 3 waves

Plans:
- [ ] 01-01-PLAN.md — Create ingestion-proxy service (extract proxy route, Docker build)
- [ ] 01-02-PLAN.md — Add Terraform infrastructure (Container App, health probes)
- [ ] 01-03-PLAN.md — Wire scheduler/worker to proxy (env vars, routing)
- [ ] 01-04-PLAN.md — Verify separation and scaling (cleanup API, smoke test)

### Phase 2: Authentication Simplification
**Goal**: Authentication middleware simplified to API key-only, HMAC code removed
**Depends on**: Phase 1 (ingestion proxy needs API key auth)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. API middleware authenticates requests using only X-API-Key header (HMAC paths removed)
  2. All API endpoints reject requests without valid API key with 401 Unauthorized
  3. HMAC authentication code, middleware, and dependencies removed from codebase
  4. API documentation updated to reflect API key-only authentication
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Input Validation
**Goal**: All API endpoints and services validate inputs at boundaries using Zod schemas
**Depends on**: Phase 2 (auth simplification reduces validation surface area)
**Requirements**: REL-05, REL-06, REL-07
**Success Criteria** (what must be TRUE):
  1. Price range filter endpoints reject invalid ranges (negative prices, price_from > price_to, unbounded spans) with 400 Bad Request
  2. All API endpoint parameters validated with Zod schemas (search filters, pagination, sorting)
  3. All services validate environment variables at startup and fail fast with clear error messages
  4. Invalid requests return descriptive validation errors (field name, constraint violated, acceptable values)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Pricing Rule Concurrency
**Goal**: Pricing rules cannot be updated during active consolidation, preventing data corruption
**Depends on**: Phase 3 (validation infrastructure established)
**Requirements**: REL-01, REL-02, REL-10
**Success Criteria** (what must be TRUE):
  1. Database prevents pricing rule updates when consolidation is active (via consolidation flag or lock)
  2. Pricing rules table includes version column with optimistic concurrency control
  3. "100%" boolean error eliminated from Supabase logs (verified over 7 day observation period)
  4. Dashboard displays clear message when pricing rule updates blocked due to active consolidation
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: LRU Cache Replacement
**Goal**: API search cache uses proven LRU implementation with 70%+ hit rate
**Depends on**: Phase 4 (concurrency patterns established)
**Requirements**: REL-03, REL-04
**Success Criteria** (what must be TRUE):
  1. Custom Map-based LRU cache replaced with lru-cache npm library across all API replicas
  2. API search cache hit rate improves to 70%+ (measured via X-Cache header logs over 24 hour period)
  3. Cache eviction operates correctly under high concurrency load (no thrashing observed)
  4. Cache invalidation still triggered correctly by dataset version changes
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Consolidator Claim Management
**Goal**: Consolidator claims use SKIP LOCKED pattern, stuck claims cleaned up automatically
**Depends on**: Phase 5 (reliability patterns established)
**Requirements**: REL-08, REL-09
**Success Criteria** (what must be TRUE):
  1. Consolidator claim acquisition uses FOR UPDATE SKIP LOCKED pattern instead of TTL-based locking
  2. Crashed consolidator processes release claims immediately (no 30 minute wait)
  3. Multiple consolidator instances cannot claim same feed simultaneously (race condition eliminated)
  4. Consolidation runs complete successfully after consolidator pod crashes and restarts
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: State Machine Formalization
**Goal**: Worker partition progress uses explicit state enum with validated transitions
**Depends on**: Phase 6 (database concurrency patterns mature)
**Requirements**: STATE-01, STATE-02, STATE-03, STATE-04, STATE-05
**Success Criteria** (what must be TRUE):
  1. Partition progress table includes explicit state column (pending/running/completed/failed enum)
  2. State transition validation prevents invalid transitions (e.g., pending → completed without running)
  3. Race conditions on partition offset updates prevented by state machine constraints
  4. Retry tracking added with exponential backoff (max 3 retries before manual intervention)
  5. Dashboard monitoring query identifies stuck partitions (running >60 min, no offset progress)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Configuration Persistence
**Goal**: Auto-consolidation delay configuration persists in database, survives worker restarts
**Depends on**: Phase 7 (state management patterns established)
**Requirements**: STATE-06, STATE-07
**Success Criteria** (what must be TRUE):
  1. Auto-consolidation delay configuration stored in database (not in-memory)
  2. Worker pod restart does not lose scheduled consolidation delay (Service Bus ScheduledEnqueueTimeUtc preserved)
  3. Dashboard displays current auto-consolidation configuration and allows updates
  4. Partial success consolidation triggers correctly after configured delay (default 5 minutes) even after worker restart
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Rate Limiting Separation | 0/? | Not started | - |
| 2. Authentication Simplification | 0/? | Not started | - |
| 3. Input Validation | 0/? | Not started | - |
| 4. Pricing Rule Concurrency | 0/? | Not started | - |
| 5. LRU Cache Replacement | 0/? | Not started | - |
| 6. Consolidator Claim Management | 0/? | Not started | - |
| 7. State Machine Formalization | 0/? | Not started | - |
| 8. Configuration Persistence | 0/? | Not started | - |
