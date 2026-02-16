# Diamond Inventory Platform - Technical Debt Cleanup

## What This Is

A production-ready TypeScript pipeline for ingesting diamond inventory from multiple feeds (Nivoda, demo), applying dynamic pricing rules, and serving via REST API to dashboard and storefront applications. This milestone focuses on eliminating technical debt to prepare for production Shopify integration with horizontal scaling.

## Core Value

Reliable, observable ingestion pipeline that strictly enforces 25 req/s global rate limit to Nivoda during ingestion while enabling independent horizontal scaling of customer-facing API for high-traffic Shopify queries.

## Requirements

### Validated

Existing production capabilities:

- ✓ Multi-feed ingestion pipeline (Nivoda GraphQL, demo feed) — existing
- ✓ Heatmap-based work partitioning with adaptive density scanning — existing
- ✓ Message-driven architecture via Azure Service Bus — existing
- ✓ Fault-tolerant continuation pattern with partition progress tracking — existing
- ✓ Canonical diamond transformation with pricing rule engine — existing
- ✓ REST API with search, filtering, LRU caching, ETag support — existing
- ✓ Dashboard (React) for run management, analytics, pricing rules — existing
- ✓ Storefront (React) for diamond search, holds, orders — existing
- ✓ Watermark-based incremental ingestion with Azure Blob storage — existing
- ✓ Repricing job workflow with batch processing and email notifications — existing
- ✓ Dataset version-based cache invalidation — existing

### Active

Technical debt items for this milestone:

- [ ] **Rate Limiter Architecture**: Dedicated ingestion proxy to enforce true 25req/s global limit (currently per-replica, breaks with scaling)
- [ ] **HMAC Auth Removal**: Simplify to API key-only authentication
- [ ] **Silent Alert Failures**: Fix alert firing in worker and consolidator
- [ ] **Pricing Rule Locking**: Prevent pricing rule updates during consolidation (related to "100%" error in logs)
- [ ] **Raw Body Capture**: Improve auth middleware security/debugging
- [ ] **Error Logging Consistency**: Standardize error patterns across services
- [ ] **Worker Auto-Consolidation Persistence**: Ensure delay settings survive restarts
- [ ] **Input Validation**: Add validation for price ranges and other inputs
- [ ] **Consolidator Stuck Claim Visibility**: Better monitoring for stuck claims
- [ ] **LRU Cache Concurrency**: Fix eviction issues under high concurrency
- [ ] **Health Checks**: Configure Terraform health checks across all services
- [ ] **Worker Partition State Machine**: Formalize state transitions
- [ ] **Heatmap Algorithm Documentation**: Document adaptive stepping logic
- [ ] **Cache Invalidation Strategy**: Improve version poll-based invalidation
- [ ] **Dead-Letter Queue**: Add DLQ for failed Service Bus messages
- [ ] **Distributed Tracing**: Add tracing across services with correlation IDs
- [ ] **Data Export Rate Limiting**: Add rate limits on export endpoints

### Out of Scope

- New feature development — Focus is stability and observability
- Database schema migrations — Keep existing schema intact
- Frontend redesign — UI improvements deferred to future milestone
- Multi-region deployment — Single region for initial production launch

## Context

**Production readiness blocker:** Current rate limiter design limits deployment to 1 API replica because each replica independently enforces 25req/s to Nivoda. Scaling to handle Shopify traffic would bypass the rate limit (N replicas × 25req/s = uncontrolled rate).

**Architectural constraint:** Scheduler and workers must route through dedicated ingestion proxy for rate limiting. Customer-facing API (search, holds, orders) must scale independently without affecting ingestion rate limits.

**Known issues:**
- `invalid input syntax for type boolean: "100%"` error appearing in Supabase logs during consolidation (rare, suspected pricing-related)
- Alert failures going unnoticed (silent failures in worker/consolidator)
- Consolidator claims occasionally stuck without visibility

**Brownfield context:** Existing codebase with TypeScript monorepo (npm workspaces), Azure Container Apps infrastructure, PostgreSQL (Supabase), React frontends. See `.planning/codebase/` for detailed architecture and stack analysis.

## Constraints

- **Performance**: Must maintain 25 req/s global limit to Nivoda during ingestion (external API contract)
- **Scaling**: Customer API must scale horizontally for Shopify traffic without breaking rate limits
- **Timeline**: Preparing for production launch with Shopify storefront integration
- **Infrastructure**: Azure Container Apps deployment via Terraform
- **Database**: PostgreSQL via Supabase (no migration to other databases)
- **Backwards Compatibility**: No breaking changes to existing API contracts or dashboard functionality

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Dedicated ingestion proxy | Separate single-replica proxy for scheduler/workers allows customer API to scale independently while enforcing global rate limit | — Pending |
| Remove HMAC auth | API key authentication sufficient, reduces complexity | — Pending |
| Add DLQ for Service Bus | Improves observability for failed messages, enables manual retry | — Pending |
| Distributed tracing with correlation IDs | Critical for debugging multi-service flows (scheduler → worker → consolidator) | — Pending |

---
*Last updated: 2026-02-17 after initialization*
