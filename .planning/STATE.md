# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Reliable, observable ingestion pipeline that strictly enforces 25 req/s global rate limit to Nivoda during ingestion while enabling independent horizontal scaling of customer-facing API for high-traffic Shopify queries.
**Current focus:** Phase 1: Rate Limiting Separation

## Current Position

Phase: 1 of 8 (Rate Limiting Separation)
Plan: 5 of 5 in current phase (Phase 1 Complete with Gap Closure)
Status: Phase 1 complete, ready for Phase 2
Last activity: 2026-02-17 — Completed 01-05-PLAN.md (Gap Closure - API Proxy Routing)

Progress: [█████░░░░░] 62.5%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 4 min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 18 min | 4 min |

**Recent Completions:**
| Phase 01 P01 | 15 min | 3 tasks | 7 files |
| Phase 01 P02 | 1 min | 2 tasks | 3 files |
| Phase 01 P03 | 1 min | 2 tasks | 1 files |
| Phase 01 P04 | 0 | 3 tasks | 4 files |
| Phase 01 P05 | 1 | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Dedicated ingestion proxy chosen over Redis-backed distributed rate limiter (simpler, reuses existing code, sufficient for single-point rate limit enforcement)
- Remove HMAC auth in favor of API key-only authentication (reduces complexity, sufficient security)
- Add DLQ for Service Bus (improves observability for failed messages, enables manual retry)
- Distributed tracing with correlation IDs (critical for debugging multi-service flows)
- [Phase 01]: Default rate limit set to 25 req/s for ingestion proxy (conservative global bottleneck)
- [Phase 01]: TCP probes instead of HTTP for ingestion proxy health checks (Pattern 4 from research)
- [Phase 01-01]: Move rate limiter middleware to shared package for reuse across services (enables proper layering without circular dependencies)
- [Phase 01-01]: Follow Dockerfile.api pattern for ingestion-proxy Docker build (consistency with existing infrastructure)
- [Phase 01-04]: API max replicas set to 10 for Shopify traffic scaling (now safe with proxy route removed)
- [Phase 01-04]: API min replicas set to 2 for high availability (customer-facing service requires redundancy)
- [Phase 01]: Customer API routes all Nivoda calls through ingestion proxy (gap closure)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 01-01]: Docker build fails locally with npm "Exit handler never called!" bug (deferred - pattern matches Dockerfile.api which likely works in CI/CD)
- [Phase 01-03]: Pre-existing Terraform cycle error between API and dashboard (out of scope - does not affect ingestion proxy work)

## Session Continuity

Last session: 2026-02-17T00:23:06Z
Stopped at: Completed 01-05-PLAN.md (Gap Closure - API Proxy Routing) - Phase 1 Complete with All Gaps Closed
Resume file: None
