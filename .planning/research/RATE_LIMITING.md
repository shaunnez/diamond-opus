# Rate Limiting & Scaling Patterns

**Research Date:** 2026-02-17
**Context:** Distributed rate limiting for Azure Container Apps diamond inventory platform
**Researched By:** GSD Project Researcher

## Problem Space

### Current State

The diamond inventory platform runs on Azure Container Apps with a message-driven pipeline (scheduler → workers → consolidator) via Service Bus. The API serves two distinct workloads:

1. **Ingestion Proxy** (internal traffic): Scheduler and workers route Nivoda API calls through the API proxy to enforce rate limiting
2. **Customer API** (external traffic): Shopify integration queries for diamond inventory

**Current Implementation:**
- Per-replica in-memory token bucket rate limiter on API proxy route
- Rate limit: 25 req/s per replica (NIVODA_PROXY_RATE_LIMIT constant)
- FIFO queue with max wait time (60s default)
- Proxy timeout: 60s upstream, 65s client transport

### The Core Problem

**Constraint:** Must enforce strict global 25 req/s to Nivoda during ingestion (vendor requirement)

**Current Limitation:** Rate limiting is per-replica independent
- With 1 replica: 25 req/s (correct)
- With N replicas: N × 25 req/s (violates vendor limit)

**Business Impact:**
- API stuck at 1 replica due to rate limiting constraint
- Cannot horizontally scale to handle Shopify traffic spikes
- Ingestion workload competes with customer query workload
- Single point of failure for both workloads

### Requirements

1. **Global Rate Limit:** True 25 req/s enforcement across all replicas during ingestion
2. **Horizontal Scaling:** Customer API must scale independently (2-10+ replicas for Shopify traffic)
3. **Separation of Concerns:** Ingestion rate limiting should not block customer query scaling
4. **Reliability:** Graceful degradation if shared state becomes unavailable
5. **Low Latency:** Minimal overhead for rate limit decisions (<50ms p99)
6. **Azure-Native:** Leverage existing Azure infrastructure where possible

## Solution Patterns

### Pattern 1: Dedicated Ingestion Proxy (Recommended)

**Architecture:** Deploy a separate Container App specifically for ingestion proxy, independent of customer API.

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│  Scheduler  │────▶│ Ingestion Proxy  │────▶│   Nivoda   │
│  (Job)      │     │  (1 replica)     │     │    API     │
└─────────────┘     │  25 req/s limit  │     └────────────┘
                    └──────────────────┘
┌─────────────┐
│  Workers    │────▶│                  │
│ (1-10 rep.) │     │                  │
└─────────────┘     └──────────────────┘

┌─────────────┐     ┌──────────────────┐
│   Shopify   │────▶│  Customer API    │
│             │     │  (2-10 replicas) │
└─────────────┘     │  No rate limit   │
                    └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │    Database      │
                    └──────────────────┘
```

**Implementation:**

1. **New Container App:** `diamond-ingestion-proxy`
   - Single replica (min=1, max=1)
   - Internal ingress only (not exposed to internet)
   - Existing in-memory rate limiter works correctly at 1 replica
   - Routes to Nivoda with 25 req/s enforcement

2. **Environment Variables:**
   ```typescript
   // Ingestion Proxy
   NIVODA_ENDPOINT: https://api.nivoda.net/graphql
   NIVODA_USERNAME: <credentials>
   NIVODA_PASSWORD: <credentials>
   INTERNAL_SERVICE_TOKEN: <auth token>
   NIVODA_PROXY_RATE_LIMIT: 25
   NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS: 60000
   NIVODA_PROXY_TIMEOUT_MS: 60000
   ```

3. **Scheduler/Worker Configuration:**
   ```typescript
   // Point to ingestion proxy instead of customer API
   NIVODA_PROXY_BASE_URL: https://diamond-ingestion-proxy.internal
   INTERNAL_SERVICE_TOKEN: <same token>
   ```

4. **Customer API Configuration:**
   ```typescript
   // Remove Nivoda proxy entirely
   // No NIVODA_PROXY_BASE_URL
   // No rate limiting on query routes
   MIN_REPLICAS: 2
   MAX_REPLICAS: 10
   ```

**Pros:**
- ✅ **Simplest implementation** - reuse existing rate limiter code, just deploy separately
- ✅ **No shared state** - no Redis/database required, no distributed coordination
- ✅ **Perfect isolation** - ingestion and customer workloads completely independent
- ✅ **Failure isolation** - ingestion proxy failure doesn't affect customer queries
- ✅ **Cost-effective** - minimal infrastructure overhead (one small Container App)
- ✅ **Operational simplicity** - no complex distributed system debugging
- ✅ **Horizontal scaling unlocked** - customer API scales freely without rate limit concerns
- ✅ **Zero latency overhead** - in-memory rate limiter (existing ~50-100ms proxy overhead)

**Cons:**
- ❌ **Single replica bottleneck** - ingestion proxy cannot scale horizontally
- ❌ **Single point of failure** - if ingestion proxy crashes, all ingestion stops (mitigated by Container Apps auto-restart)
- ❌ **Potential throughput limit** - 25 req/s at 60s timeout = ~1,500 concurrent requests max (likely sufficient for current scale)

**Trade-offs:**
- **Complexity:** LOW (reuse existing code, minimal changes)
- **Latency:** EXCELLENT (no shared state, in-memory rate limiting)
- **Cost:** LOW (single small replica ~0.25 vCPU, 0.5Gi RAM)
- **Reliability:** GOOD (Container Apps auto-restart, health probes)
- **Scalability:** LIMITED for ingestion (fixed 25 req/s), UNLIMITED for customer API

**Confidence:** HIGH - This is a proven architectural pattern (separation of concerns, dedicated gateways per workload type)

**Implementation Effort:** 2-4 hours
- Create new Terraform module for ingestion proxy Container App
- Update scheduler/worker environment variables to point to new proxy
- Remove Nivoda proxy routes from customer API
- Add health checks and monitoring
- Test end-to-end ingestion flow

### Pattern 2: Redis-Backed Distributed Rate Limiter

**Architecture:** Replace in-memory rate limiter with Redis-backed token bucket using Lua scripts for atomic operations.

```
┌─────────────┐     ┌──────────────────┐
│  Scheduler  │────▶│   Customer API   │
│  (Job)      │     │  (N replicas)    │
└─────────────┘     │                  │
                    │  ┌────────────┐  │     ┌────────────┐
┌─────────────┐     │  │Rate Limiter│──┼────▶│   Redis    │
│  Workers    │────▶│  │(Lua script)│  │     │  (shared)  │
│ (1-10 rep.) │     │  └────────────┘  │     └────────────┘
└─────────────┘     │         │        │
                    │         ▼        │     ┌────────────┐
┌─────────────┐     │  Nivoda Proxy   │────▶│   Nivoda   │
│   Shopify   │────▶│                  │     │    API     │
└─────────────┘     └──────────────────┘     └────────────┘
```

**Implementation:**

1. **Add Azure Cache for Redis:**
   ```hcl
   # Terraform: infrastructure/terraform/modules/redis/main.tf
   resource "azurerm_redis_cache" "main" {
     name                = "${var.environment_name}-redis"
     location            = var.location
     resource_group_name = var.resource_group_name
     capacity            = 0  # Basic C0 (250MB) sufficient
     family              = "C"
     sku_name            = "Basic"
     enable_non_ssl_port = false
     minimum_tls_version = "1.2"
   }
   ```

2. **Lua Script for Token Bucket:**
   ```lua
   -- redis_rate_limiter.lua
   -- KEYS[1] = rate limit key (e.g., "nivoda:rate_limit")
   -- ARGV[1] = max tokens (25)
   -- ARGV[2] = refill rate (tokens per second, 25)
   -- ARGV[3] = current timestamp (seconds)
   -- ARGV[4] = bucket capacity (25)

   local key = KEYS[1]
   local max_tokens = tonumber(ARGV[1])
   local refill_rate = tonumber(ARGV[2])
   local now = tonumber(ARGV[3])
   local capacity = tonumber(ARGV[4])

   local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
   local tokens = tonumber(bucket[1]) or max_tokens
   local last_refill = tonumber(bucket[2]) or now

   -- Refill tokens based on elapsed time
   local elapsed = now - last_refill
   local new_tokens = math.min(capacity, tokens + (elapsed * refill_rate))

   -- Try to consume one token
   if new_tokens >= 1 then
     new_tokens = new_tokens - 1
     redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
     redis.call('EXPIRE', key, 10)  -- Auto-cleanup
     return {1, new_tokens}  -- Success, remaining tokens
   else
     redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
     redis.call('EXPIRE', key, 10)
     return {0, new_tokens}  -- Rejected, remaining tokens
   end
   ```

3. **TypeScript Implementation:**
   ```typescript
   // packages/shared/src/redis-rate-limiter.ts
   import Redis from 'ioredis';
   import { readFileSync } from 'fs';
   import { join } from 'path';

   export class RedisRateLimiter {
     private redis: Redis;
     private luaScript: string;
     private scriptSha: string | null = null;

     constructor(redisUrl: string) {
       this.redis = new Redis(redisUrl, {
         retryStrategy: (times) => Math.min(times * 50, 2000),
         maxRetriesPerRequest: 3,
       });
       this.luaScript = readFileSync(
         join(__dirname, 'redis_rate_limiter.lua'),
         'utf-8'
       );
     }

     async acquire(key: string, maxTokens: number, refillRate: number): Promise<boolean> {
       try {
         // Load script if not cached
         if (!this.scriptSha) {
           this.scriptSha = await this.redis.script('LOAD', this.luaScript);
         }

         const now = Math.floor(Date.now() / 1000);
         const result = await this.redis.evalsha(
           this.scriptSha,
           1,
           key,
           maxTokens,
           refillRate,
           now,
           maxTokens
         );

         return result[0] === 1;
       } catch (err) {
         logger.error('Redis rate limiter failed', err);
         // Fail open: allow request if Redis unavailable
         return true;
       }
     }

     async destroy(): Promise<void> {
       await this.redis.quit();
     }
   }
   ```

4. **Middleware Update:**
   ```typescript
   // packages/api/src/middleware/rateLimiter.ts
   import { RedisRateLimiter } from '@diamond/shared';

   export function createRedisRateLimiterMiddleware() {
     const limiter = new RedisRateLimiter(
       requireEnv('REDIS_CONNECTION_STRING')
     );

     return async (req: Request, res: Response, next: NextFunction) => {
       const allowed = await limiter.acquire(
         'nivoda:rate_limit',
         NIVODA_PROXY_RATE_LIMIT,
         NIVODA_PROXY_RATE_LIMIT
       );

       if (!allowed) {
         res.setHeader('Retry-After', '1');
         res.status(429).json({
           error: {
             code: 'TOO_MANY_REQUESTS',
             message: 'Global rate limit exceeded',
           },
         });
         return;
       }

       next();
     };
   }
   ```

**Pros:**
- ✅ **True global rate limiting** - all replicas share Redis state
- ✅ **Horizontal scaling** - customer API can scale to any replica count
- ✅ **Atomic operations** - Lua scripts prevent race conditions
- ✅ **Production-proven** - widely used pattern (Redis docs, multiple tutorials)
- ✅ **Single workload** - no need for separate proxy service

**Cons:**
- ❌ **Shared state dependency** - Redis becomes critical path for all requests
- ❌ **Latency overhead** - every request adds Redis round-trip (~5-15ms p50, ~20-50ms p99 in Azure)
- ❌ **Operational complexity** - Redis monitoring, failover, connection pooling
- ❌ **Cost** - Azure Cache for Redis Basic C0 ~$16/month (minimal but non-zero)
- ❌ **Failure mode risk** - if Redis fails, must choose: fail open (violate rate limit) or fail closed (break ingestion)

**Trade-offs:**
- **Complexity:** MEDIUM (new infrastructure, Lua scripts, connection management)
- **Latency:** MODERATE (~20-50ms p99 added to each request)
- **Cost:** MEDIUM ($16-50/month depending on tier)
- **Reliability:** MODERATE (Redis HA available but adds complexity)
- **Scalability:** EXCELLENT for both ingestion and customer API

**Confidence:** HIGH - Production-proven pattern, extensive documentation and implementations

**Implementation Effort:** 1-2 days
- Add Azure Cache for Redis via Terraform
- Implement Lua script and TypeScript wrapper
- Replace in-memory rate limiter middleware
- Add Redis connection health checks
- Load testing to validate global rate limiting
- Monitor Redis performance and failover behavior

### Pattern 3: Azure API Management

**Architecture:** Use Azure API Management as centralized gateway with built-in rate limiting policies.

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│  Scheduler  │────▶│  API Management  │────▶│   Nivoda   │
│  (Job)      │     │                  │     │    API     │
└─────────────┘     │  rate-limit-by-  │     └────────────┘
                    │  key: 25/sec     │
┌─────────────┐     │                  │
│  Workers    │────▶│  (Azure-hosted)  │
│ (1-10 rep.) │     └──────────────────┘
└─────────────┘
                    ┌──────────────────┐
┌─────────────┐     │  Customer API    │
│   Shopify   │────▶│  (2-10 replicas) │
└─────────────┘     └──────────────────┘
```

**Implementation:**

1. **API Management Configuration:**
   ```xml
   <!-- Nivoda proxy policy -->
   <policies>
     <inbound>
       <base />
       <rate-limit-by-key calls="25" renewal-period="1" counter-key="@("nivoda-global")" />
       <authentication-managed-identity resource="https://api.nivoda.net" />
     </inbound>
     <backend>
       <forward-request timeout="60" />
     </backend>
     <outbound>
       <base />
     </outbound>
   </policies>
   ```

2. **Terraform Setup:**
   ```hcl
   resource "azurerm_api_management" "main" {
     name                = "${var.environment_name}-apim"
     location            = var.location
     resource_group_name = var.resource_group_name
     publisher_name      = "Diamond Inventory"
     publisher_email     = var.admin_email
     sku_name            = "Consumption_0"  # Pay-per-use
   }

   resource "azurerm_api_management_api" "nivoda_proxy" {
     name                = "nivoda-proxy"
     resource_group_name = var.resource_group_name
     api_management_name = azurerm_api_management.main.name
     revision            = "1"
     display_name        = "Nivoda Proxy"
     path                = "nivoda"
     protocols           = ["https"]
     service_url         = "https://api.nivoda.net"
   }
   ```

**Pros:**
- ✅ **Managed service** - Azure handles scaling, HA, monitoring
- ✅ **Built-in rate limiting** - no custom code required
- ✅ **Rich policies** - transformation, auth, caching all included
- ✅ **Global enforcement** - rate limit across all APIM gateway instances
- ✅ **Observability** - Azure Monitor integration, request tracing

**Cons:**
- ❌ **Cost** - Consumption tier ~$4/million calls (could be $100-500/month at scale)
- ❌ **Latency overhead** - APIM adds ~50-200ms per request (multiple hops)
- ❌ **Cold start** - Consumption tier can have 10-30s cold starts for first request
- ❌ **Multi-region caveat** - rate limits are per-region in multi-region deployments
- ❌ **Vendor lock-in** - tighter coupling to Azure APIM policies
- ❌ **Accuracy caveat** - "rate limiting is never completely accurate" per docs

**Trade-offs:**
- **Complexity:** LOW (managed service, declarative policies)
- **Latency:** MODERATE-HIGH (~50-200ms added)
- **Cost:** HIGH ($100-500/month depending on traffic)
- **Reliability:** EXCELLENT (Azure SLA, auto-scaling)
- **Scalability:** EXCELLENT (managed by Azure)

**Confidence:** MEDIUM - Azure APIM is proven, but rate limiting accuracy caveat and per-region limitations are concerns

**Implementation Effort:** 2-3 days
- Provision APIM instance via Terraform
- Configure rate limiting policies
- Update scheduler/worker to use APIM endpoint
- Load test to validate rate limiting accuracy
- Monitor cost and latency impact

### Pattern 4: PostgreSQL Advisory Locks (Not Recommended)

**Architecture:** Use PostgreSQL advisory locks for distributed rate limiting state.

**Rationale for Not Recommending:**
- Database becomes hot path for every request (not designed for this)
- PostgreSQL connection pool exhaustion risk
- Significantly higher latency than Redis (~50-100ms vs ~5-15ms)
- Database load competes with actual data queries
- Cleanup job required to prevent table growth
- More complex than dedicated proxy, slower than Redis

**Confidence:** HIGH (negative recommendation) - PostgreSQL rate limiting is an anti-pattern for high-throughput proxies

## Recommendations

### Primary Recommendation: Dedicated Ingestion Proxy (Pattern 1)

**Confidence Level:** HIGH

**Rationale:**
1. **Simplest implementation** - reuse existing code with zero shared state
2. **Cost-effective** - minimal infrastructure overhead
3. **Excellent isolation** - ingestion and customer workloads completely independent
4. **Operational simplicity** - no distributed system debugging
5. **Unlocks horizontal scaling** - customer API scales freely
6. **Low latency** - in-memory rate limiting, no shared state overhead

**When to use:**
- ✅ Current scale (25 req/s fixed limit acceptable for ingestion)
- ✅ Team values simplicity and operational ease
- ✅ Cost-conscious (minimal additional infrastructure)
- ✅ Prioritize customer API scaling over ingestion throughput

**When to reconsider:**
- ❌ Need to burst >25 req/s for ingestion (unlikely given vendor constraint)
- ❌ Require ingestion HA across availability zones (Container Apps single-zone today)

### Secondary Recommendation: Redis-Backed Distributed Rate Limiter (Pattern 2)

**Confidence Level:** HIGH

**Rationale:**
1. **True global rate limiting** - proven pattern for distributed systems
2. **Horizontal scaling** - API scales to any replica count while enforcing limit
3. **Production-proven** - extensive documentation and battle-tested implementations
4. **Flexible** - can adjust rate limits dynamically via Redis TTL

**When to use:**
- ✅ Need future flexibility to scale ingestion workload horizontally
- ✅ Already using Redis for other purposes (caching, sessions, etc.)
- ✅ Team comfortable with Redis operations and monitoring
- ✅ Can tolerate ~20-50ms p99 latency overhead

**When to reconsider:**
- ❌ Team lacks Redis operational experience
- ❌ Latency extremely sensitive (<100ms p99 requirement)
- ❌ Cost-conscious and don't need Redis for other purposes

### Not Recommended: Azure API Management (Pattern 3)

**Confidence Level:** MEDIUM-LOW

**Rationale:**
1. **Cost too high** for simple rate limiting use case ($100-500/month)
2. **Latency overhead** significant (~50-200ms)
3. **Rate limiting accuracy caveat** per Azure docs
4. **Cold start issues** on Consumption tier
5. **Overkill** - brings transformation/auth features not needed here

**When to reconsider:**
- Only if organization already has APIM for other APIs (shared cost)
- Need rich policy features beyond rate limiting

## Implementation Considerations

### Dedicated Ingestion Proxy Implementation Guide

#### 1. Infrastructure (Terraform)

**Create New Module:** `infrastructure/terraform/modules/container-apps/ingestion-proxy.tf`

```hcl
# Ingestion Proxy Container App (internal, single replica)
resource "azurerm_container_app" "ingestion_proxy" {
  name                         = "${var.app_name_prefix}-ingestion-proxy"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = 1
    max_replicas = 1  # Fixed single replica

    container {
      name   = "ingestion-proxy"
      image  = "${var.container_registry_login_server}/diamond-ingestion-proxy:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "SERVICE_NAME"
        value = "ingestion-proxy"
      }

      env {
        name  = "PORT"
        value = "3001"
      }

      env {
        name        = "NIVODA_ENDPOINT"
        secret_name = "nivoda-endpoint"
      }

      env {
        name        = "NIVODA_USERNAME"
        secret_name = "nivoda-username"
      }

      env {
        name        = "NIVODA_PASSWORD"
        secret_name = "nivoda-password"
      }

      env {
        name        = "INTERNAL_SERVICE_TOKEN"
        secret_name = "internal-service-token"
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT"
        value = "25"
      }

      env {
        name  = "NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS"
        value = "60000"
      }

      env {
        name  = "NIVODA_PROXY_TIMEOUT_MS"
        value = "60000"
      }

      # Health probe
      liveness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/health"
      }

      readiness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/ready"
      }
    }
  }

  ingress {
    external_enabled = false  # Internal only
    target_port      = 3001
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  # Secrets inherited from main module
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
    name  = "nivoda-username"
    value = var.nivoda_username
  }

  secret {
    name  = "nivoda-password"
    value = var.nivoda_password
  }

  secret {
    name  = "internal-service-token"
    value = var.internal_service_token
  }

  secret {
    name  = "registry-password"
    value = var.container_registry_password
  }

  tags = var.tags
}

# Output for other services to consume
output "ingestion_proxy_fqdn" {
  value = azurerm_container_app.ingestion_proxy.ingress[0].fqdn
}
```

**Update Worker/Scheduler Configuration:**
```hcl
# In azurerm_container_app.worker and azurerm_container_app_job.scheduler
env {
  name  = "NIVODA_PROXY_BASE_URL"
  value = "https://${azurerm_container_app.ingestion_proxy.ingress[0].fqdn}"
}
```

**Update Customer API Configuration:**
```hcl
# In azurerm_container_app.api
# Remove Nivoda proxy environment variables entirely
# Remove: NIVODA_ENDPOINT, NIVODA_USERNAME, NIVODA_PASSWORD
# Remove: NIVODA_PROXY_RATE_LIMIT, etc.
# Update scaling:
template {
  min_replicas = 2
  max_replicas = 10
  # ... rest of config
}
```

#### 2. Application Code (Minimal Changes)

**Create Ingestion Proxy App:** `apps/ingestion-proxy/`

```typescript
// apps/ingestion-proxy/src/index.ts
import express from 'express';
import { createServiceLogger, requireEnv } from '@diamond/shared';
import nivodaProxyRouter from './routes/nivodaProxy';

const app = express();
const logger = createServiceLogger('ingestion-proxy');
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '1mb' }));

// Health endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.get('/ready', (req, res) => {
  res.status(200).json({ status: 'ready' });
});

// Nivoda proxy route (with rate limiting)
app.use('/graphql', nivodaProxyRouter);

app.listen(port, () => {
  logger.info('ingestion_proxy_started', { port });
});
```

**Reuse Existing Middleware:**
```typescript
// apps/ingestion-proxy/src/routes/nivodaProxy.ts
// Identical to existing packages/api/src/routes/nivodaProxy.ts
// Just repackage for deployment
import { Router } from 'express';
import { nivodaProxyAuth } from '@diamond/api/middleware/nivodaProxyAuth';
import { createRateLimiterMiddleware } from '@diamond/api/middleware/rateLimiter';
// ... rest of implementation (copy from existing)
```

**Update Customer API:**
```typescript
// packages/api/src/index.ts
// Remove Nivoda proxy routes entirely
// app.use('/internal/nivoda', nivodaProxyRouter);  // DELETE THIS LINE

// Customer API routes remain unchanged
app.use('/api/diamonds', diamondsRouter);
app.use('/api/pricing-rules', pricingRulesRouter);
// ... etc
```

#### 3. Dockerfile

**Create New Dockerfile:** `docker/Dockerfile.ingestion-proxy`

```dockerfile
# Multi-stage build (similar to existing API Dockerfile)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build:ingestion-proxy

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/ingestion-proxy ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "index.js"]
```

**Update GitHub Actions:** `.github/workflows/deploy.yml`

```yaml
- name: Build and push ingestion proxy image
  run: |
    docker build -f docker/Dockerfile.ingestion-proxy \
      -t ${{ secrets.ACR_LOGIN_SERVER }}/diamond-ingestion-proxy:${{ github.sha }} .
    docker push ${{ secrets.ACR_LOGIN_SERVER }}/diamond-ingestion-proxy:${{ github.sha }}
```

#### 4. Health Checks and Monitoring

**Liveness Probe:**
- Endpoint: `GET /health`
- Returns 200 if process is running
- Container Apps restarts on failure

**Readiness Probe:**
- Endpoint: `GET /ready`
- Returns 200 if ready to accept traffic
- Traffic stopped on failure (not restarted)

**Metrics to Monitor:**
```typescript
// Add to ingestion proxy logging
logger.info('ingestion_proxy_request', {
  traceId,
  queueDepth: rateLimiter.queueDepth,
  method: req.method,
  operationName,
  duration,
  statusCode,
});

// Alert on:
// - queueDepth > 100 (sustained backpressure)
// - 429 rate limit errors > 10/min (workers overwhelming proxy)
// - 502 upstream errors > 5/min (Nivoda connectivity issues)
// - p99 latency > 5s (request timeouts)
```

**Azure Monitor Queries:**
```kusto
// Ingestion proxy health
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "diamond-ingestion-proxy"
| where Log_s contains "ingestion_proxy"
| summarize
    RequestCount = countif(Log_s contains "request"),
    RateLimited = countif(Log_s contains "rate_limited"),
    Errors = countif(Log_s contains "failed"),
    AvgQueueDepth = avg(toint(extract("queueDepth\":([0-9]+)", 1, Log_s)))
  by bin(TimeGenerated, 1m)
| render timechart

// Worker retry patterns (indicates proxy overload)
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "diamond-worker"
| where Log_s contains "nivoda_request_retry"
| summarize RetryCount = count() by bin(TimeGenerated, 1m)
| render timechart
```

#### 5. Testing Strategy

**Unit Tests:**
```typescript
// apps/ingestion-proxy/src/routes/nivodaProxy.test.ts
describe('Ingestion Proxy Rate Limiting', () => {
  it('enforces 25 req/s limit', async () => {
    // Send 50 requests rapidly
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        fetch('http://localhost:3001/graphql', {
          method: 'POST',
          body: JSON.stringify({ query: '{ test }' }),
        })
      )
    );

    const accepted = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    const rateLimited = results.filter(r => r.status === 'fulfilled' && r.value.status === 429);

    expect(accepted.length).toBeLessThanOrEqual(26); // 25 + 1 tolerance
    expect(rateLimited.length).toBeGreaterThan(20);
  });

  it('queues requests when limit exceeded', async () => {
    // TODO: Test queue depth and wait time
  });
});
```

**Integration Tests:**
```typescript
// tests/integration/ingestion-proxy.test.ts
describe('Ingestion Proxy Integration', () => {
  it('scheduler and workers can authenticate to proxy', async () => {
    const response = await fetch(`${INGESTION_PROXY_URL}/graphql`, {
      method: 'POST',
      headers: {
        'x-internal-token': INTERNAL_SERVICE_TOKEN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: '{ diamonds_by_query_count(query: {}) }',
      }),
    });

    expect(response.status).toBe(200);
  });

  it('customer API does not route through proxy', async () => {
    // Verify customer API has no NIVODA_PROXY_BASE_URL
    // Verify customer API cannot reach ingestion proxy (internal only)
  });
});
```

**Load Tests:**
```bash
# Validate 25 req/s enforcement under load
artillery quick --count 100 --num 50 \
  -p '{"url": "http://ingestion-proxy.internal/graphql"}' \
  -o load-test-results.json

# Expected: ~25 req/s sustained, 429 errors for excess
```

#### 6. Rollout Plan

**Phase 1: Deploy Ingestion Proxy (no traffic)**
1. Deploy ingestion proxy Container App via Terraform
2. Verify health endpoints responding
3. Smoke test: single request from local machine
4. No changes to scheduler/workers yet

**Phase 2: Canary Traffic (scheduler only)**
1. Update scheduler environment variable: `NIVODA_PROXY_BASE_URL=https://ingestion-proxy.internal`
2. Trigger manual scheduler run
3. Monitor ingestion proxy metrics for errors
4. Verify scheduler completes successfully
5. Roll back if issues (remove env var)

**Phase 3: Full Ingestion Traffic**
1. Update workers environment variable: `NIVODA_PROXY_BASE_URL=https://ingestion-proxy.internal`
2. Trigger full ingestion run (scheduler + workers)
3. Monitor queue depth, rate limit metrics, Nivoda response times
4. Verify consolidation completes successfully

**Phase 4: Scale Customer API**
1. Remove Nivoda proxy routes from customer API code
2. Deploy customer API changes
3. Scale customer API to 2 replicas
4. Load test customer query endpoints
5. Gradually increase to 5-10 replicas based on Shopify traffic

**Phase 5: Cleanup**
1. Remove unused Nivoda environment variables from customer API
2. Archive old Nivoda proxy code from customer API repository
3. Update documentation and runbooks

**Rollback Plan:**
- If ingestion proxy fails: revert scheduler/worker env vars to point directly to Nivoda
- If customer API issues: scale back to 1 replica, revert code changes
- Container Apps makes rollback trivial (change env var, restart)

### Redis Implementation Guide (Pattern 2)

If choosing Redis-backed rate limiter instead:

#### 1. Infrastructure

```hcl
# infrastructure/terraform/modules/redis/main.tf
resource "azurerm_redis_cache" "main" {
  name                = "${var.environment_name}-redis"
  location            = var.location
  resource_group_name = var.resource_group_name
  capacity            = 0  # Basic C0 (250MB)
  family              = "C"
  sku_name            = "Basic"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"

  redis_configuration {
    maxmemory_policy = "allkeys-lru"
  }

  tags = var.tags
}

output "redis_connection_string" {
  value     = azurerm_redis_cache.main.primary_connection_string
  sensitive = true
}
```

#### 2. Dependencies

```json
// packages/shared/package.json
{
  "dependencies": {
    "ioredis": "^5.3.2"
  },
  "devDependencies": {
    "@types/ioredis": "^5.0.0"
  }
}
```

#### 3. Lua Script File

**Location:** `packages/shared/src/redis_rate_limiter.lua`

(See Pattern 2 implementation section for complete Lua script)

#### 4. Health Checks

```typescript
// packages/api/src/middleware/rateLimiter.ts
export class RedisRateLimiter {
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}

// packages/api/src/index.ts
app.get('/ready', async (req, res) => {
  const redisHealthy = await rateLimiter.healthCheck();
  if (!redisHealthy) {
    res.status(503).json({ status: 'unhealthy', reason: 'redis' });
    return;
  }
  res.status(200).json({ status: 'ready' });
});
```

#### 5. Failure Modes

**Fail Open vs Fail Closed:**
```typescript
async acquire(): Promise<boolean> {
  try {
    const result = await this.redis.evalsha(/* ... */);
    return result[0] === 1;
  } catch (err) {
    logger.error('Redis rate limiter failed', err, {
      failureMode: 'fail_open',
    });

    // DECISION POINT: Choose failure mode
    // Option 1: Fail open (allow request, risk violating rate limit)
    return true;

    // Option 2: Fail closed (reject request, risk breaking ingestion)
    // return false;

    // Option 3: Hybrid (fail open with in-memory fallback)
    // return this.fallbackRateLimiter.acquire();
  }
}
```

**Recommendation:** Fail open with monitoring
- Risk: Temporary rate limit violation during Redis outage
- Mitigation: Azure Cache for Redis has 99.9% SLA, rare outages
- Alert on Redis failures to enable manual intervention

#### 6. Monitoring

```typescript
// Metrics to track
logger.info('redis_rate_limiter_metrics', {
  allowed: boolean,
  remainingTokens: number,
  latency: number,
  redisHealthy: boolean,
});

// Alerts
// - Redis connection failures > 5/min
// - Rate limiter latency p99 > 100ms
// - Fail-open fallback triggered (indicates Redis issue)
```

### Azure API Management Considerations (Pattern 3)

If organization already uses APIM:

**Configuration:**
```xml
<policies>
  <inbound>
    <rate-limit-by-key calls="25" renewal-period="1"
                       counter-key="@("nivoda-global")"
                       increment-condition="@(context.Response.StatusCode >= 200 && context.Response.StatusCode < 300)" />
    <set-header name="x-internal-token" exists-action="override">
      <value>@(context.Variables.GetValueOrDefault<string>("internal-token"))</value>
    </set-header>
  </inbound>
  <backend>
    <forward-request timeout="60" />
  </backend>
</policies>
```

**Monitoring:**
- Use APIM Analytics for request counts, latency, errors
- Set up alerts for 429 rate limit responses
- Monitor APIM gateway health and cold starts (Consumption tier)

## Failure Modes and Mitigation

### Dedicated Ingestion Proxy Failures

| Failure Mode | Impact | Detection | Mitigation |
|--------------|--------|-----------|------------|
| Proxy crashes | Ingestion stops | Health probe fails | Container Apps auto-restarts within seconds |
| Proxy overload (>25 req/s) | Requests queued, timeouts | Queue depth >100, 429 errors | Workers already have retry with backoff |
| Nivoda API down | All requests fail 502 | Upstream errors in logs | Workers retry with exponential backoff |
| Internal auth token leaked | Unauthorized access | Unusual request patterns | Rotate token, redeploy all services |
| Network partition | Scheduler/workers can't reach proxy | Connection timeouts | Azure Container Apps in same virtual network, rare |

### Redis Failures (Pattern 2)

| Failure Mode | Impact | Detection | Mitigation |
|--------------|--------|-----------|------------|
| Redis crashes | Rate limiting fails | Connection errors, fail-open triggers | Azure Cache has auto-restart, 99.9% SLA |
| Redis network partition | Rate limiting fails | Connection timeouts | Fail-open allows traffic, alert for manual intervention |
| Redis overload (CPU/memory) | Slow responses, timeouts | Latency spikes, throttle errors | Scale up Redis tier (C0 → C1) |
| Lua script bug | Rate limiting broken | Incorrect allow/deny decisions | Test scripts thoroughly, monitor allow rate vs expected |
| Connection pool exhaustion | New requests fail | Connection errors | Tune ioredis connection pool settings |

### General Recommendations

1. **Observability:** Structured logging with trace IDs across all components
2. **Alerting:** Set up alerts for failure modes (health probe failures, high error rates, latency spikes)
3. **Runbooks:** Document recovery procedures for each failure mode
4. **Testing:** Regular chaos engineering (kill proxy, simulate Redis outage, etc.)
5. **Graceful Degradation:** Prefer fail-open for rate limiting (temporary violation better than complete outage)

## Cost Analysis

### Dedicated Ingestion Proxy (Pattern 1)

**Infrastructure Costs:**
- Container App: 1 replica × 0.25 vCPU × 0.5Gi RAM × 730 hours/month
  - Compute: ~$8-12/month (Container Apps pricing)
- No additional services required

**Total: ~$10/month**

### Redis-Backed Rate Limiter (Pattern 2)

**Infrastructure Costs:**
- Azure Cache for Redis Basic C0 (250MB): ~$16/month
- Container App (customer API): No change (already exists)
- Slight increase in egress traffic (Redis queries): <$1/month

**Total: ~$17/month**

### Azure API Management (Pattern 3)

**Infrastructure Costs:**
- APIM Consumption tier: ~$4 per million calls
- Estimated ingestion traffic: 25 req/s × 86,400 sec/day × 30 days = ~65M calls/month
- APIM cost: 65M × $4 = $260/month
- Plus customer API traffic (queries): additional cost

**Total: $260-500/month** (depending on customer traffic)

### Cost Comparison

| Pattern | Monthly Cost | Notes |
|---------|--------------|-------|
| Dedicated Proxy (1) | ~$10 | Minimal infrastructure overhead |
| Redis Rate Limiter (2) | ~$17 | Basic Redis tier sufficient |
| Azure APIM (3) | $260-500 | High cost for simple rate limiting |

**Recommendation:** Dedicated Proxy (Pattern 1) is most cost-effective for this use case.

## Sources

### Rate Limiting Patterns
- [Rate Limiting pattern - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern)
- [How to Build a Distributed Rate Limiter with Redis](https://oneuptime.com/blog/post/2026-01-21-redis-distributed-rate-limiter/view)
- [How to Implement Rate Limiting with Redis](https://oneuptime.com/blog/post/2026-01-21-redis-rate-limiting/view)
- [Design a Distributed Rate Limiter | Hello Interview System Design in a Hurry](https://www.hellointerview.com/learn/system-design/problem-breakdowns/distributed-rate-limiter)
- [Rate Limiting: A Dynamic Distributed Rate Limiting with Redis | by Mohamed El-Bably | Medium](https://medium.com/@m-elbably/rate-limiting-a-dynamic-distributed-rate-limiting-with-redis-339f9504200f)

### Redis Implementation
- [Redis Rate Limiting](https://redis.io/glossary/rate-limiting/)
- [How to Build a Distributed Rate Limiting System Using Redis and Lua Scripts](https://www.freecodecamp.org/news/build-rate-limiting-system-using-redis-and-lua/)
- [Build 5 Rate Limiters with Redis: Comparing Algorithms from Fixed Window to Leaky Bucket](https://redis.io/tutorials/howtos/ratelimiting/)
- [Implementing a Token Bucket Rate Limiter with Redis | by Farhan Ahmad | Medium](https://medium.com/@farhanahmad091/implementing-a-token-bucket-rate-limiter-with-redis-ef4133c69140)

### Azure-Specific Patterns
- [Azure API Management policy reference - rate-limit | Microsoft Learn](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-policy)
- [Rate Limiting in Azure API Management | Ronald's Blog](https://ronaldbosma.github.io/blog/2026/01/06/rate-limiting-in-azure-api-management/)
- [Advanced Request Throttling with Azure API Management | Microsoft Learn](https://learn.microsoft.com/en-us/azure/api-management/api-management-sample-flexible-throttling)
- [Monitor Azure Cache for Redis - Azure Managed Redis | Microsoft Learn](https://learn.microsoft.com/en-us/azure/redis/monitor-cache)

### Architecture Patterns
- [The API gateway pattern versus the direct client-to-microservice communication - .NET | Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/direct-client-to-microservice-communication-versus-the-api-gateway-pattern)
- [Service Proxy vs Service Mesh vs API Gateway](https://tyk.io/blog/res-service-proxy-service-mesh-or-api-gateway-which-do-you-need/)
- [API gateways - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway)
- [API Gateway vs API Proxy: Understanding The Differences | Kong Inc.](https://konghq.com/blog/engineering/api-gateway-vs-api-proxy-understanding-the-differences)

### Database-Backed Rate Limiting
- [Distributed Rate Limiting in Java: Bucket4j + PostgreSQL](https://dzone.com/articles/distributed-rate-limiting-java-bucket4j-postgresql)
- [Rate Limiting in Postgres - Neon Guides](https://neon.com/guides/rate-limiting)
- [PostgreSQL · animir/node-rate-limiter-flexible Wiki · GitHub](https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL)

### Azure Container Apps
- [Networking in Azure Container Apps environment | Microsoft Learn](https://learn.microsoft.com/en-us/azure/container-apps/networking)
- [Configure ingress in an Azure Container Apps environment | Microsoft Learn](https://learn.microsoft.com/en-us/azure/container-apps/ingress-environment-configuration)
- [Azure Container Apps External Networking: Ingress, Environment Architecture, and Traffic Flow | by Anand Rao | Medium](https://medium.com/@anandctx/introduction-3a47b0f6400b)

### Failure Modes and Reliability
- [API Rate Limiting at Scale: Patterns, Failures, and Control Strategies](https://www.gravitee.io/blog/rate-limiting-apis-scale-patterns-strategies)
- [How to implement rate limiting with Redis · Peakscale](https://www.peakscale.com/redis-rate-limiting/)
- [Rate Limiting with Redis and Node.js: Under the Hood – Webdock](https://webdock.io/en/docs/how-guides/javascript-guides/rate-limiting-redis-and-nodejs-under-hood)
