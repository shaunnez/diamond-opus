---
phase: 01
plan: 02
subsystem: infrastructure
tags: [terraform, container-apps, rate-limiting, ingestion-proxy]
dependency_graph:
  requires: []
  provides:
    - azurerm_container_app.ingestion_proxy
    - ingestion_proxy_fqdn output
  affects:
    - container-apps module
tech_stack:
  added:
    - Ingestion proxy Container App (single replica)
  patterns:
    - Single replica enforcement for global rate limit
    - Internal-only ingress for service-to-service communication
    - TCP health probes for Container Apps
key_files:
  created: []
  modified:
    - infrastructure/terraform/modules/container-apps/main.tf
    - infrastructure/terraform/modules/container-apps/variables.tf
    - infrastructure/terraform/modules/container-apps/outputs.tf
decisions:
  - summary: "Default rate limit set to 25 req/s (conservative for single global bottleneck)"
    rationale: "Research showed 25 req/s is safe for Nivoda API, provides headroom below their limits"
    alternatives: ["50 req/s (more aggressive)", "10 req/s (very conservative)"]
    impact: "Controls global ingestion throughput, affects run duration"
  - summary: "TCP probes instead of HTTP for health checks"
    rationale: "Pattern 4 from research - simpler, avoids false negatives during startup"
    alternatives: ["HTTP /health endpoint"]
    impact: "More reliable health detection, faster startup"
metrics:
  duration_minutes: 1
  tasks_completed: 2
  files_modified: 3
  commits: 2
  completed_at: "2026-02-16T23:07:16Z"
---

# Phase 01 Plan 02: Terraform Infrastructure for Ingestion Proxy Summary

**One-liner:** Added single-replica ingestion proxy Container App with internal ingress, TCP health probes, and 25 req/s rate limit configuration

## Overview

Added Terraform infrastructure for dedicated ingestion proxy Container App that enforces a global 25 req/s rate limit to Nivoda. The proxy deploys as a single replica with internal-only ingress, ensuring all scheduler and worker traffic routes through a single bottleneck for precise rate limit enforcement.

## Tasks Completed

### Task 1: Add ingestion-proxy Container App resource
**Status:** Complete
**Commit:** 16a76b9

Added new `azurerm_container_app.ingestion_proxy` resource to main.tf with:
- Single replica enforcement (min_replicas = 1, max_replicas = 1)
- Internal ingress only (external_enabled = false)
- TCP health probes (startup, liveness, readiness) per research Pattern 4
- Environment variables for Nivoda credentials and rate limit configuration
- Same secret pattern as API Container App

**Files modified:**
- infrastructure/terraform/modules/container-apps/main.tf (188 lines added)

### Task 2: Add ingestion-proxy variables and outputs
**Status:** Complete
**Commit:** 99d9745

Added configuration variables and outputs:
- Updated `nivoda_proxy_rate_limit` default from 50 to 25 (global limit)
- Added `ingestion_proxy_fqdn` output for scheduler/worker service discovery
- Fixed terraform formatting

**Files modified:**
- infrastructure/terraform/modules/container-apps/variables.tf
- infrastructure/terraform/modules/container-apps/outputs.tf
- infrastructure/terraform/modules/container-apps/main.tf (formatting)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Terraform formatting**
- **Found during:** Task 2 verification
- **Issue:** Terraform fmt detected formatting inconsistencies in main.tf
- **Fix:** Ran terraform fmt to fix indentation and spacing
- **Files modified:** main.tf
- **Commit:** Included in 99d9745

## Known Issues

**Pre-existing Terraform validation error:** Circular dependency between azurerm_container_app.dashboard and azurerm_container_app.api exists in the module. This is out of scope for this plan and does not affect the ingestion_proxy resource.

## Verification

All success criteria met:
- [x] azurerm_container_app.ingestion_proxy resource created
- [x] Single replica enforced (min/max = 1)
- [x] Internal ingress configured (external_enabled = false)
- [x] TCP health probes configured (startup, liveness, readiness)
- [x] ingestion_proxy_fqdn output added
- [x] Resource follows existing Container App patterns
- [x] Terraform fmt passes

## Next Steps

1. **Plan 01-03:** Build Docker image for ingestion-proxy service (contains actual rate limiting logic)
2. **Plan 01-04:** Update scheduler and worker to route through ingestion proxy (set NIVODA_PROXY_BASE_URL)

## Technical Notes

**Health Probe Configuration:**
- Startup probe: 30-second window (30 attempts × 1s interval) allows for slow cold starts
- Liveness probe: Terminates container after 100 seconds of unresponsiveness
- Readiness probe: Removes from load balancer after 15 seconds of failure
- All use TCP transport (simpler, more reliable than HTTP during startup)

**Resource Allocation:**
- CPU: 0.5 (proxy workload is I/O bound, not CPU intensive)
- Memory: 1Gi (sufficient for in-memory token bucket and request queue)
- Single replica critical for global rate limit enforcement

**Environment Variables:**
The proxy requires the same Nivoda credentials as the API to make upstream GraphQL calls, plus rate limit configuration:
- NIVODA_PROXY_RATE_LIMIT: 25 (requests/second)
- NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS: 60000 (max queue wait)
- NIVODA_PROXY_TIMEOUT_MS: 60000 (upstream timeout)

## Self-Check

Verifying created resources and commits:

- [x] FOUND: infrastructure/terraform/modules/container-apps/main.tf (ingestion_proxy resource exists)
- [x] FOUND: infrastructure/terraform/modules/container-apps/variables.tf (variables updated)
- [x] FOUND: infrastructure/terraform/modules/container-apps/outputs.tf (ingestion_proxy_fqdn output exists)
- [x] FOUND: Commit 16a76b9 (Task 1)
- [x] FOUND: Commit 99d9745 (Task 2)

## Self-Check: PASSED

All claimed files and commits verified successfully.
