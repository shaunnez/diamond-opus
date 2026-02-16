# Phase 1: Rate Limiting Separation - Research

**Researched:** 2026-02-17
**Domain:** Azure Container Apps architecture, rate limiting, internal service communication
**Confidence:** HIGH

## Summary

Phase 1 separates the Nivoda rate limiting from the customer-facing API by deploying a dedicated single-replica ingestion proxy as an internal Container App. The current architecture has an in-memory token bucket rate limiter on the customer API (which can scale 2-10 replicas), leading to effective rate limits of 50-250 req/s to Nivoda instead of the strict 25 req/s global limit required. The solution deploys a new `ingestion-proxy` Container App (single replica, internal ingress only) that hosts the existing Nivoda proxy route from the API, allowing scheduler and worker to route all Nivoda requests through this bottleneck while the customer API scales independently.

The codebase already has the proxy transport infrastructure (`ProxyGraphqlTransport`), proxy route (`/api/v2/internal/nivoda/graphql`), and rate limiter (`TokenBucketRateLimiter`). The work involves: (1) extracting the proxy route to a new service, (2) creating new Terraform resources, (3) updating scheduler/worker environment variables, and (4) adding health checks.

**Primary recommendation:** Create standalone `apps/ingestion-proxy` service reusing existing proxy/rate-limiter code, deploy as dedicated Container App with min/max replicas = 1, configure internal ingress only, add TCP health probes on port 3000.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RATE-01 | Dedicated ingestion proxy deployed as separate Container App (single replica, internal ingress only) | Azure Container Apps supports single-replica deployment (min/max = 1) with internal ingress. Terraform module needs new `azurerm_container_app` resource. |
| RATE-02 | Scheduler and worker services route Nivoda requests through dedicated ingestion proxy | `ProxyGraphqlTransport` already exists, initialized when `NIVODA_PROXY_BASE_URL` is set. Update scheduler/worker env vars to point to new proxy FQDN. |
| RATE-03 | Customer API can scale to 2-10 replicas without affecting Nivoda rate limit | Separating rate limiter to dedicated proxy decouples API scaling from ingestion rate. Customer API no longer needs `NIVODA_PROXY_BASE_URL` set. |
| RATE-04 | True 25 req/s global limit enforced to Nivoda during ingestion (verified under load) | `TokenBucketRateLimiter` enforces per-window limits with FIFO queuing. Single replica = global enforcement. Load testing needed for verification. |
| RATE-05 | Health checks configured for ingestion proxy in Terraform | Azure Container Apps supports startup/liveness/readiness probes via Terraform. TCP probe on port 3000 sufficient for proxy service. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express.js | 4.x | HTTP server for proxy | Already used in API, proven for high-throughput proxying |
| Azure Container Apps | Latest | Container orchestration | Native Azure serverless containers with auto-scaling and internal ingress |
| Terraform azurerm | ~> 3.0 | Infrastructure as Code | Already used for all infrastructure, consistent with existing modules |
| TypeScript | 5.x | Type safety | Codebase standard, prevents config errors |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@diamond/shared` | Workspace | Constants, logger, types | Reuse `NIVODA_PROXY_RATE_LIMIT`, `createServiceLogger` |
| `graphql-request` | Current | GraphQL client | Already used in `ProxyGraphqlTransport` |
| Pino | Current | Structured logging | Consistent with other services |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated proxy service | Redis-backed distributed limiter in API | Single-replica proxy is simpler; Redis only needed if ingestion must scale horizontally (not required per CLAUDE.md) |
| Container Apps | Azure API Management | APIM costs $260-500/mo and adds latency; overkill for simple rate limiting (out of scope per REQUIREMENTS.md) |
| Express.js proxy | Azure Functions proxy | Functions cold start adds unpredictability; long-running proxy better for continuous ingestion |

**Installation:**
```bash
# New workspace package (reuses existing dependencies)
cd apps/ingestion-proxy
npm install  # Inherits from root package.json
```

## Architecture Patterns

### Recommended Project Structure
```
apps/ingestion-proxy/
├── src/
│   ├── index.ts           # Server bootstrap, shutdown handling
│   ├── routes/
│   │   └── proxy.ts       # Extracted from packages/api/src/routes/nivodaProxy.ts
│   └── middleware/
│       ├── auth.ts        # Extracted from packages/api/src/middleware/nivodaProxyAuth.ts
│       └── rateLimiter.ts # Imported from packages/api/src/middleware/rateLimiter.ts (or move to @diamond/shared)
├── Dockerfile             # Reuse pattern from docker/Dockerfile.api
├── package.json
└── tsconfig.json
```

### Pattern 1: Internal Ingress Communication
**What:** Container Apps in same environment communicate via internal FQDN without leaving the environment
**When to use:** Scheduler and worker need to call ingestion proxy
**How it works:**
- Proxy deployed with `external_enabled = false` in Terraform
- Internal FQDN format: `<app-name>.<environment-unique-id>.<region>.azurecontainerapps.io`
- DNS resolution handled automatically within Container Apps environment
- Traffic never leaves Azure Container Apps environment (secure by default)

**Example:**
```hcl
# infrastructure/terraform/modules/container-apps/main.tf
resource "azurerm_container_app" "ingestion_proxy" {
  ingress {
    external_enabled = false  # Internal-only
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}
```

**Reference:** [Azure Container Apps: Communicate between container apps](https://learn.microsoft.com/en-us/azure/container-apps/connect-apps)

### Pattern 2: Single Replica Enforcement
**What:** Deploy with min_replicas = max_replicas = 1 to guarantee single instance
**When to use:** When global rate limiting requires single point of control
**Why it matters:** Multiple replicas = per-replica rate limits, defeating global enforcement

**Example:**
```hcl
resource "azurerm_container_app" "ingestion_proxy" {
  template {
    min_replicas = 1
    max_replicas = 1  # Prevents scaling

    container {
      cpu    = 0.5  # Sufficient for proxy workload
      memory = "1Gi"
    }
  }
}
```

**Caveat:** Single replica = single point of failure. Acceptable for ingestion (scheduler can retry, workers queue). NOT acceptable for customer API.

### Pattern 3: Proxy Transport Initialization
**What:** Nivoda adapter switches between direct GraphQL and proxy transport based on env vars
**When to use:** Services need to route through ingestion proxy
**Already implemented:** `packages/nivoda/src/adapter.ts` lines 179-199

**Configuration:**
```typescript
// Scheduler/Worker environment variables
const proxyUrl = optionalEnv('NIVODA_PROXY_BASE_URL', '');
const internalToken = optionalEnv('INTERNAL_SERVICE_TOKEN', '');

if (proxyUrl) {
  if (!internalToken) {
    throw new Error('INTERNAL_SERVICE_TOKEN required when NIVODA_PROXY_BASE_URL is set');
  }
  this.transport = new ProxyGraphqlTransport(proxyUrl, internalToken);
} else {
  this.transport = this.client;  // Direct GraphQL
}
```

**Terraform update:**
```hcl
# Scheduler/Worker containers
env {
  name  = "NIVODA_PROXY_BASE_URL"
  value = "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
}
```

### Pattern 4: Health Probes for Proxy Services
**What:** TCP probes sufficient for stateless proxy; HTTP probes for app logic
**When to use:** Ingestion proxy is stateless HTTP forwarder
**Best practice:** Startup probe prevents premature traffic, liveness detects hangs, readiness for load balancer

**Example:**
```hcl
resource "azurerm_container_app" "ingestion_proxy" {
  template {
    container {
      # Startup probe: ensure server listening before accepting traffic
      startup_probe {
        transport          = "TCP"
        port               = 3000
        initial_delay      = 1
        period_seconds     = 1
        timeout            = 3
        failure_threshold  = 30  # 30s total startup time allowed
      }

      # Liveness probe: detect hung process
      liveness_probe {
        transport         = "TCP"
        port              = 3000
        period_seconds    = 10
        timeout           = 1
        failure_threshold = 3  # Restart after 30s of failures
      }

      # Readiness probe: remove from load balancer if unhealthy
      readiness_probe {
        transport         = "TCP"
        port              = 3000
        period_seconds    = 5
        timeout           = 5
        failure_threshold = 3
      }
    }
  }
}
```

**Reference:** [Azure Container Apps: Health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)

### Pattern 5: Token Bucket Rate Limiter with Queue
**What:** In-memory FIFO queue drains at fixed rate when limit exceeded
**Already implemented:** `packages/api/src/middleware/rateLimiter.ts`
**Behavior:**
- Window resets every `windowMs` (default: 1000ms)
- Requests beyond `maxRequestsPerWindow` are queued
- Queue drains as windows reset
- 429 response if queued request waits > `maxWaitMs` (default: 60s)

**Configuration for 25 req/s global limit:**
```typescript
const rateLimiter = createRateLimiterMiddleware({
  maxRequestsPerWindow: 25,     // Strict Nivoda limit
  windowMs: 1000,                // 1-second windows
  maxWaitMs: 60000,              // Fail after 1 minute queued
});
```

**Idempotency note:** Worker `withRetry` already handles 429s with exponential backoff (no code changes needed).

### Anti-Patterns to Avoid
- **Scaling proxy horizontally:** Defeats global rate limit; use single replica
- **Missing INTERNAL_SERVICE_TOKEN:** Allows unauthorized proxy access; always validate token
- **Removing API rate limiter entirely:** Customer API still needs per-endpoint limits for DDoS protection (separate concern, out of scope for Phase 1)
- **HTTP probes without /health endpoint:** Adds complexity; TCP probes sufficient for stateless proxy

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting algorithm | Custom sliding window, token bucket from scratch | Existing `TokenBucketRateLimiter` class | Already implemented, tested in production API, handles FIFO queuing correctly |
| Service discovery | Manual FQDN construction, env var injection | Terraform `azurerm_container_app.*.ingress[0].fqdn` | Terraform automatically computes FQDN; manual construction breaks on region changes |
| Authentication | Custom JWT, API key rolling | Constant-time comparison with `INTERNAL_SERVICE_TOKEN` | Already implemented in `nivodaProxyAuth` middleware, prevents timing attacks |
| Health checks | Custom /health endpoints with dependency checks | TCP probes on port 3000 | Stateless proxy doesn't need complex health logic; TCP sufficient |
| Graceful shutdown | Custom SIGTERM handlers | Built-in Container Apps shutdown (30s default) | Azure handles draining, just ensure server closes on signal |

**Key insight:** Proxy services are commodity infrastructure. Reuse battle-tested components, avoid custom logic.

## Common Pitfalls

### Pitfall 1: Forgetting to Update Scheduler NIVODA_PROXY_BASE_URL
**What goes wrong:** Scheduler continues hitting Nivoda directly, bypassing rate limiter
**Why it happens:** Scheduler is deployed as Container Apps Job, separate resource from worker
**How to avoid:** Update both `azurerm_container_app.worker` and `azurerm_container_app_job.scheduler` in Terraform
**Warning signs:** Scheduler logs show `transportMode: direct` instead of `transportMode: proxy`

### Pitfall 2: Setting min_replicas = 0 on Ingestion Proxy
**What goes wrong:** Proxy scales to zero, scheduler/worker requests fail, run blocked
**Why it happens:** Default Container Apps behavior for cost savings
**How to avoid:** Explicitly set `min_replicas = 1` in Terraform
**Warning signs:** Workers log `ECONNREFUSED` or `proxy_request_failed` errors

### Pitfall 3: Using external_enabled = true for Ingestion Proxy
**What goes wrong:** Proxy exposed to internet, security risk, costs increase
**Why it happens:** Copy-paste from API Container App config
**How to avoid:** Always verify `external_enabled = false` for internal services
**Warning signs:** Public FQDN appears in Azure Portal, unnecessary egress charges

### Pitfall 4: Missing INTERNAL_SERVICE_TOKEN Validation
**What goes wrong:** Any service can call proxy, rate limit shared across unauthorized callers
**Why it happens:** Forgetting to add `nivodaProxyAuth` middleware
**How to avoid:** Always apply auth middleware before rate limiter in Express route
**Warning signs:** `nivodaProxyAuth` logs missing in proxy service

### Pitfall 5: Reusing Customer API Container for Proxy
**What goes wrong:** Customer API still scales 2-10 replicas, rate limit multiplied
**Why it happens:** Trying to avoid creating new service (premature optimization)
**How to avoid:** Always deploy dedicated Container App for single-replica enforcement
**Warning signs:** API logs show multiple replica IDs serving proxy requests

### Pitfall 6: No Health Probe Failure Threshold Tuning
**What goes wrong:** Proxy restarted prematurely during high load, cascading failures
**Why it happens:** Using default `failure_threshold = 3` without considering queued requests
**How to avoid:** Set liveness `failure_threshold` high enough for queue drain time (e.g., 10)
**Warning signs:** Frequent replica restarts in logs during ingestion runs

### Pitfall 7: Circular Dependency in Terraform
**What goes wrong:** `terraform apply` fails with cycle error when API depends on proxy and vice versa
**Why it happens:** API passes proxy FQDN to scheduler, scheduler deployed after API
**How to avoid:** Deploy ingestion proxy first, then reference its FQDN in scheduler/worker
**Warning signs:** `Error: Cycle` in Terraform plan output

## Code Examples

Verified patterns from existing codebase:

### Proxy Route Extraction
```typescript
// apps/ingestion-proxy/src/routes/proxy.ts
// Source: packages/api/src/routes/nivodaProxy.ts (lines 26-131)
import { Router } from "express";
import type { Request, Response } from "express";
import { nivodaProxyAuth } from "../middleware/auth.js";
import { createRateLimiterMiddleware } from "@diamond/shared";
import {
  requireEnv,
  createServiceLogger,
  NIVODA_PROXY_RATE_LIMIT,
  NIVODA_PROXY_RATE_LIMIT_WINDOW_MS,
  NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS,
  NIVODA_PROXY_TIMEOUT_MS,
} from "@diamond/shared";

const router = Router();
const logger = createServiceLogger('ingestion-proxy', { component: 'proxy' });

const rateLimiter = createRateLimiterMiddleware({
  maxRequestsPerWindow: NIVODA_PROXY_RATE_LIMIT,
  windowMs: NIVODA_PROXY_RATE_LIMIT_WINDOW_MS,
  maxWaitMs: NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS,
});

router.post(
  "/graphql",
  nivodaProxyAuth,  // Auth first
  rateLimiter,      // Rate limit second
  async (req: Request, res: Response) => {
    // ... existing proxy logic from nivodaProxy.ts
  }
);

export default router;
```

### Terraform Ingestion Proxy Resource
```hcl
# infrastructure/terraform/modules/container-apps/main.tf
resource "azurerm_container_app" "ingestion_proxy" {
  name                         = "${var.app_name_prefix}-ingestion-proxy"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = 1
    max_replicas = 1  # Single replica enforcement

    container {
      name   = "ingestion-proxy"
      image  = "${var.container_registry_login_server}/diamond-ingestion-proxy:${var.image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "SERVICE_NAME"
        value = "ingestion-proxy"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name        = "NIVODA_ENDPOINT"
        secret_name = "nivoda-endpoint"
      }

      env {
        name        = "INTERNAL_SERVICE_TOKEN"
        secret_name = "internal-service-token"
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT"
        value = tostring(var.nivoda_proxy_rate_limit)
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS"
        value = tostring(var.nivoda_proxy_rate_limit_max_wait_ms)
      }

      env {
        name  = "NIVODA_PROXY_TIMEOUT_MS"
        value = tostring(var.nivoda_proxy_timeout_ms)
      }

      # Health probes
      startup_probe {
        transport         = "TCP"
        port              = 3000
        initial_delay     = 1
        period_seconds    = 1
        timeout           = 3
        failure_threshold = 30
      }

      liveness_probe {
        transport         = "TCP"
        port              = 3000
        period_seconds    = 10
        timeout           = 1
        failure_threshold = 10
      }

      readiness_probe {
        transport         = "TCP"
        port              = 3000
        period_seconds    = 5
        timeout           = 5
        failure_threshold = 3
      }
    }
  }

  ingress {
    external_enabled = false  # Internal only
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server               = var.container_registry_login_server
    username             = var.container_registry_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "nivoda-endpoint"
    value = var.nivoda_endpoint
  }

  secret {
    name  = "internal-service-token"
    value = coalesce(var.internal_service_token, "not-configured")
  }

  tags = var.tags
}
```

### Update Scheduler/Worker to Use Proxy
```hcl
# infrastructure/terraform/modules/container-apps/main.tf
# Scheduler Job
resource "azurerm_container_app_job" "scheduler" {
  # ... existing config
  template {
    container {
      # ... existing env vars

      # NEW: Route through ingestion proxy
      env {
        name  = "NIVODA_PROXY_BASE_URL"
        value = "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
      }
    }
  }
}

# Worker Container App
resource "azurerm_container_app" "worker" {
  # ... existing config
  template {
    container {
      # ... existing env vars

      # NEW: Route through ingestion proxy
      env {
        name  = "NIVODA_PROXY_BASE_URL"
        value = "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
      }
    }
  }
}
```

### Dockerfile for Ingestion Proxy
```dockerfile
# docker/Dockerfile.ingestion-proxy
# Reuse pattern from docker/Dockerfile.api
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace package files
COPY package*.json ./
COPY tsconfig*.json ./

# Copy workspace packages
COPY packages ./packages
COPY apps/ingestion-proxy ./apps/ingestion-proxy

# Install dependencies and build
RUN npm ci
RUN npm run build -w @diamond/ingestion-proxy

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/ingestion-proxy/dist ./apps/ingestion-proxy/dist
COPY --from=builder /app/apps/ingestion-proxy/package.json ./apps/ingestion-proxy/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/ingestion-proxy/dist/index.js"]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-replica rate limiting in API | Dedicated single-replica proxy | Phase 1 (2026-02) | Enables API horizontal scaling without violating Nivoda 25 req/s limit |
| Manual health endpoint logic | TCP probes | Azure Container Apps default | Simpler, less code to maintain |
| External ingress for all services | Internal ingress for backend | Container Apps best practice | Improved security, reduced attack surface |
| Fixed-window rate limiting | Token bucket with FIFO queue | Already in codebase | Better burst handling, graceful degradation vs hard 429s |

**Deprecated/outdated:**
- External FQDN for internal service communication: Use internal ingress instead
- HTTP probes without /health endpoint: TCP probes sufficient for stateless proxy
- Redis-backed distributed rate limiter: Overkill for single-replica enforcement (REQUIREMENTS.md out of scope)

## Open Questions

1. **Load Testing Strategy**
   - What we know: Need to verify 25 req/s global limit under load (RATE-04)
   - What's unclear: Should load test be part of Phase 1 or separate verification phase?
   - Recommendation: Include basic smoke test in Phase 1 (verify single replica serves requests), defer full load test to Phase 8 verification

2. **Proxy Failure Handling**
   - What we know: Single replica = single point of failure
   - What's unclear: Acceptable downtime during proxy restart? Auto-retry from workers sufficient?
   - Recommendation: Document in operations runbook; workers already have `withRetry` with exponential backoff (no code change needed)

3. **Rate Limiter Constants Location**
   - What we know: `TokenBucketRateLimiter` in `packages/api/src/middleware/rateLimiter.ts`
   - What's unclear: Should rate limiter move to `@diamond/shared` for reuse?
   - Recommendation: Move to `@diamond/shared` in Phase 1; cleaner separation, reusable for future proxies

4. **Customer API Rate Limiter Removal**
   - What we know: Customer API no longer needs Nivoda proxy route
   - What's unclear: Should customer API rate limiter be removed or kept for DDoS protection?
   - Recommendation: Keep rate limiter for customer endpoints (search/export) at higher limits; remove only Nivoda proxy route. DDoS protection separate concern (Phase 3 or v2).

## Sources

### Primary (HIGH confidence)
- [Azure Container Apps: Communicate between container apps](https://learn.microsoft.com/en-us/azure/container-apps/connect-apps) - Internal ingress FQDN format, DNS resolution
- [Azure Container Apps: Health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes) - Startup/liveness/readiness probe configuration, default values
- Codebase files:
  - `packages/api/src/routes/nivodaProxy.ts` - Existing proxy route implementation
  - `packages/api/src/middleware/rateLimiter.ts` - Token bucket rate limiter with FIFO queue
  - `packages/nivoda/src/proxyTransport.ts` - Proxy transport client (65s timeout)
  - `packages/nivoda/src/adapter.ts` - ProxyGraphqlTransport initialization logic (lines 179-199)
  - `infrastructure/terraform/modules/container-apps/main.tf` - Existing Container Apps resources

### Secondary (MEDIUM confidence)
- [Azure Container Apps: Scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app) - KEDA autoscaling, replica limits
- [Azure Container Apps: Ingress overview](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview) - External vs internal ingress configuration
- [Terraform azurerm_container_app](https://registry.terraform.io/providers/hashicorp/azurerm/3.44.0/docs/resources/container_app) - Probe schema reference

### Tertiary (LOW confidence)
- [Azure Architecture: Rate Limiting pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern) - General guidance (not Container Apps specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, proven in production
- Architecture: HIGH - Container Apps internal ingress well-documented, proxy pattern already implemented
- Pitfalls: HIGH - Derived from existing Terraform resources and codebase patterns

**Research date:** 2026-02-17
**Valid until:** 2026-04-17 (60 days - Azure Container Apps is stable, slow-moving platform)
