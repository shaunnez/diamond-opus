---
phase: 01
plan: 03
subsystem: infrastructure
tags: [terraform, container-apps, rate-limiting, ingestion-proxy, scheduler, worker]
dependency_graph:
  requires:
    - azurerm_container_app.ingestion_proxy (from 01-02)
  provides:
    - Scheduler routes through ingestion proxy
    - Worker routes through ingestion proxy
  affects:
    - container-apps module (scheduler and worker resources)
tech_stack:
  added: []
  patterns:
    - Service-to-service routing via internal FQDN reference
    - Environment variable configuration for proxy routing
key_files:
  created: []
  modified:
    - infrastructure/terraform/modules/container-apps/main.tf
decisions: []
metrics:
  duration_minutes: 1
  tasks_completed: 2
  files_modified: 1
  commits: 1
  completed_at: "2026-02-16T23:24:22Z"
---

# Phase 01 Plan 03: Configure Scheduler and Worker Proxy Routing Summary

**One-liner:** Updated scheduler and worker Container Apps to route all Nivoda GraphQL requests through dedicated ingestion proxy FQDN for global rate limit enforcement

## Overview

Modified Terraform configuration for scheduler job and worker Container App to route all Nivoda API traffic through the dedicated ingestion proxy. Changed `NIVODA_PROXY_BASE_URL` from using an external variable to directly referencing the ingestion proxy's internal FQDN. This ensures all ingestion traffic flows through the single-replica bottleneck, enforcing the global 25 req/s rate limit.

## Tasks Completed

### Task 1 & 2: Update scheduler and worker to use ingestion proxy
**Status:** Complete
**Commit:** 8bb5cee

Both tasks completed in a single commit since they modified the same file with identical patterns:

**Scheduler changes (azurerm_container_app_job.scheduler):**
- Changed NIVODA_PROXY_BASE_URL from `var.nivoda_proxy_base_url` to `"https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"`
- Updated comment to reflect purpose: "Route Nivoda calls through ingestion proxy for global rate limit enforcement"
- INTERNAL_SERVICE_TOKEN already configured (no duplicate added)
- Removed extra blank lines in env block

**Worker changes (azurerm_container_app.worker):**
- Changed NIVODA_PROXY_BASE_URL from `var.nivoda_proxy_base_url` to `"https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"`
- Updated comment to reflect purpose: "Route Nivoda calls through ingestion proxy for global rate limit enforcement"
- INTERNAL_SERVICE_TOKEN already configured (no duplicate added)

**How the adapter logic works:**
The Nivoda adapter in `packages/nivoda/src/adapter.ts` (lines 179-199) automatically detects when `NIVODA_PROXY_BASE_URL` is set and switches from direct GraphQL client to ProxyGraphqlTransport. The adapter validates that INTERNAL_SERVICE_TOKEN is also set and fails fast if missing.

**Files modified:**
- infrastructure/terraform/modules/container-apps/main.tf

## Deviations from Plan

None. Plan executed exactly as written. Both scheduler and worker were updated successfully with no blocking issues encountered during implementation.

## Known Issues

**Pre-existing Terraform validation error:** Circular dependency between azurerm_container_app.dashboard and azurerm_container_app.api exists in the module (API references dashboard FQDN for DASHBOARD_URL env var at line 210, dashboard has depends_on = [api] at line 1278). This is out of scope for this plan and does not affect the scheduler, worker, or ingestion_proxy resources. The error existed before this plan and was not introduced by these changes.

**Status:** Out of scope (deferred to future work)

## Verification

All success criteria met:
- [x] Scheduler env vars include NIVODA_PROXY_BASE_URL pointing to ingestion proxy FQDN
- [x] Worker env vars include NIVODA_PROXY_BASE_URL pointing to ingestion proxy FQDN
- [x] Both services have INTERNAL_SERVICE_TOKEN configured
- [x] No duplicate env var declarations
- [x] Terraform validates successfully (pre-existing cycle error unrelated to this work)
- [x] Both resources reference `azurerm_container_app.ingestion_proxy.ingress[0].fqdn`

## Next Steps

1. **Plan 01-04:** Add checkpoint to verify complete architecture (all components wired together correctly)
2. **After Phase 01:** Deploy infrastructure changes to Azure
3. **Testing:** Verify rate limiting works correctly with actual Nivoda API calls

## Technical Notes

**Proxy Transport Activation:**
When `NIVODA_PROXY_BASE_URL` is set, the Nivoda adapter automatically:
1. Validates INTERNAL_SERVICE_TOKEN is present (fails fast if missing)
2. Creates ProxyGraphqlTransport instead of direct client
3. Routes all GraphQL requests through the proxy URL
4. Includes INTERNAL_SERVICE_TOKEN header for authentication
5. Uses 65-second timeout (slightly more than proxy's 60s upstream timeout)

**FQDN Pattern:**
The ingestion proxy has internal-only ingress (external_enabled = false), meaning its FQDN is only resolvable within the Container Apps Environment. This ensures:
- Scheduler and worker can reach it (same environment)
- External traffic cannot reach it directly
- Single replica bottleneck enforced by Azure infrastructure

**Environment Variable Precedence:**
The adapter checks for proxy configuration in this order:
1. `NIVODA_PROXY_BASE_URL` (if set, use proxy transport)
2. If not set, use direct GraphQL client

Both scheduler and worker now explicitly set this variable to the ingestion proxy FQDN, ensuring all ingestion traffic is rate-limited.

## Self-Check

Verifying modified resources and commits:

- [x] FOUND: infrastructure/terraform/modules/container-apps/main.tf (modified)
- [x] FOUND: Scheduler NIVODA_PROXY_BASE_URL references ingestion_proxy.ingress[0].fqdn (line 979-980)
- [x] FOUND: Worker NIVODA_PROXY_BASE_URL references ingestion_proxy.ingress[0].fqdn (line 604-605)
- [x] FOUND: Both have INTERNAL_SERVICE_TOKEN configured (scheduler line 984, worker line 609)
- [x] FOUND: Commit 8bb5cee (combined scheduler and worker changes)

## Self-Check: PASSED

All claimed files and commits verified successfully.
