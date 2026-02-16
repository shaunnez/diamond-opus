# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Reliable, observable ingestion pipeline that strictly enforces 25 req/s global rate limit to Nivoda during ingestion while enabling independent horizontal scaling of customer-facing API for high-traffic Shopify queries.
**Current focus:** Phase 1: Rate Limiting Separation

## Current Position

Phase: 1 of 8 (Rate Limiting Separation)
Plan: 1 of 4 in current phase
Status: Executing plans
Last activity: 2026-02-16 — Completed 01-01-PLAN.md (Create Standalone Ingestion-Proxy Service)

Progress: [██░░░░░░░░] 12%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 15 min
- Total execution time: 0.25 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 1 | 15 min | 15 min |

**Recent Completions:**
| Phase 01 P01 | 15 min | 3 tasks | 7 files |

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 01-01]: Docker build fails locally with npm "Exit handler never called!" bug (deferred - pattern matches Dockerfile.api which likely works in CI/CD)

## Session Continuity

Last session: 2026-02-16T23:21:54Z
Stopped at: Completed 01-01-PLAN.md (Create Standalone Ingestion-Proxy Service)
Resume file: None
