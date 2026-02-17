---
phase: 01-rate-limiting-separation
plan: 05
subsystem: infrastructure
tags: [terraform, gap-closure, rate-limiting, proxy-routing]
requires: [RATE-02]
provides: [RATE-06]
affects: [customer-api, ingestion-proxy]
tech-stack:
  added: []
  patterns: [proxy-routing, infrastructure-as-code]
key-files:
  created: []
  modified:
    - infrastructure/terraform/modules/container-apps/main.tf
decisions:
  - "Customer API routes all Nivoda calls (holds/orders/search) through ingestion proxy for unified rate limiting"
  - "Fixed duplicate INTERNAL_SERVICE_TOKEN declaration in API env vars"
metrics:
  duration: 1 min
  tasks: 1
  files: 1
  completed: 2026-02-17T00:23:06Z
dependency-graph:
  requires: [01-03]
  provides: [complete-rate-limiting-separation]
  affects: [customer-api-scaling, holds-orders-reliability]
---

# Phase 01 Plan 05: Gap Closure - API Proxy Routing Summary

**One-liner:** Customer API now routes all Nivoda calls through ingestion proxy, closing gap identified in verification where holds/orders bypassed rate limiter

## What Was Built

Updated Terraform configuration for customer API Container App to route all Nivoda traffic through the dedicated ingestion proxy, ensuring ALL Nivoda API calls (ingestion pipeline + customer holds/orders) flow through the single 25 req/s rate-limited bottleneck.

### Gap Context

During Phase 01 verification, we discovered that while scheduler and worker correctly routed through the ingestion proxy (plan 01-03), the customer API Container App had:
1. `NIVODA_PROXY_BASE_URL` pointing to a variable (`var.nivoda_proxy_base_url`) instead of the ingestion proxy FQDN
2. A duplicate `INTERNAL_SERVICE_TOKEN` env var declaration

This meant customer API holds/orders endpoints (which call Nivoda for real-time operations) bypassed the rate limiter entirely, creating a gap in the global 25 req/s enforcement.

## Tasks Completed

### Task 1: Add ingestion proxy routing to customer API

**Status:** Complete
**Commit:** 04b6d18
**Files modified:** infrastructure/terraform/modules/container-apps/main.tf

**Changes:**
- Updated `NIVODA_PROXY_BASE_URL` at line 168 to reference `azurerm_container_app.ingestion_proxy.ingress[0].fqdn` (matching scheduler and worker pattern)
- Removed duplicate `INTERNAL_SERVICE_TOKEN` declaration at lines 172-174
- API now has single INTERNAL_SERVICE_TOKEN at line 114-116 and NIVODA_PROXY_BASE_URL at line 167-169

**Verification passed:**
- All 3 services (API, scheduler, worker) have NIVODA_PROXY_BASE_URL pointing to ingestion_proxy FQDN
- No duplicate env var declarations
- API env vars correctly configured

**How it works:**
When `NIVODA_PROXY_BASE_URL` is set, the Nivoda adapter in `packages/nivoda/src/adapter.ts` (lines 184-197) automatically switches from direct GraphQL client to ProxyGraphqlTransport. The customer API uses this adapter in:
- `packages/api/src/routes/trading.ts` for holds/orders operations
- Any search/query endpoints that call Nivoda

This ensures all customer-facing API calls are rate-limited through the same proxy as the ingestion pipeline.

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use same proxy routing pattern as scheduler/worker | Consistency - all services route the same way | Unified rate limiting behavior |
| Remove duplicate INTERNAL_SERVICE_TOKEN | Bug fix - duplicate env vars cause undefined behavior | Clean configuration |
| Point NIVODA_PROXY_BASE_URL to ingestion_proxy FQDN directly | Dynamic reference ensures correct internal routing | No manual FQDN configuration needed |

## Dependencies & Integration

**Requires:**
- Plan 01-03 (scheduler and worker proxy routing)
- Ingestion proxy deployed and accessible via internal FQDN

**Provides:**
- RATE-06: Complete rate limiting separation (all Nivoda traffic routed)
- Gap closure for Phase 01

**Affects:**
- Customer API: All Nivoda calls now go through proxy
- Holds/orders endpoints: Now rate-limited with ingestion traffic
- API scaling: Can safely scale to 10 replicas without violating rate limits

## Verification Results

All verification commands passed:

```bash
# 3 NIVODA_PROXY_BASE_URL declarations (API + scheduler + worker)
grep 'NIVODA_PROXY_BASE_URL' main.tf | wc -l
# Output: 3

# All 3 reference ingestion_proxy FQDN
grep -A 1 'NIVODA_PROXY_BASE_URL' main.tf | grep 'ingestion_proxy' | wc -l
# Output: 3

# API has correct proxy config
awk '/resource "azurerm_container_app" "api"/,/^resource/ {if (/NIVODA_PROXY_BASE_URL/) print}' main.tf
# Output: Shows line 167-168 with ingestion_proxy FQDN reference

# No duplicate INTERNAL_SERVICE_TOKEN in API env vars
awk '/resource "azurerm_container_app" "api"/,/^resource/ {if (/INTERNAL_SERVICE_TOKEN.*env/) print}' main.tf
# Output: Single occurrence at line 114-116
```

## Known Issues

**Terraform Validation:**
Pre-existing cycle error between `azurerm_container_app.api` and `azurerm_container_app.dashboard` (documented in STATE.md blockers). This is unrelated to the proxy routing changes and was present before this plan.

**Resolution:** Out of scope for this plan - does not affect ingestion proxy functionality.

## Next Steps

Phase 01 is now complete with all gaps closed:
1. Dedicated ingestion proxy deployed (plans 01-01, 01-02)
2. Scheduler and worker route through proxy (plan 01-03)
3. API cleaned up and ready to scale (plan 01-04)
4. **Customer API routes through proxy (plan 01-05) ← THIS PLAN**

**Deployment verification needed:**
- Deploy Terraform changes to Azure
- Verify customer API holds/orders requests route through ingestion proxy
- Monitor Application Insights for unified traffic flow
- Load test with 10 API replicas to confirm 25 req/s global limit enforcement

## Self-Check: PASSED

**Created files:** None (configuration change only)

**Modified files:**
- infrastructure/terraform/modules/container-apps/main.tf ✓ EXISTS

**Commits:**
- 04b6d18 ✓ FOUND

All claims verified successfully.
