# Infrastructure & Health Checks

**Domain:** Production-ready infrastructure for microservices on Azure Container Apps
**Researched:** 2026-02-17
**Overall confidence:** HIGH

## Problem Space

The diamond inventory platform currently lacks comprehensive health check configuration in Azure Container Apps infrastructure. Specific gaps identified:

1. **No health probes configured** - Services deployed without readiness, liveness, or startup probes
2. **Cache invalidation relies on polling** - Version-based cache uses 30s polling interval; no event-driven invalidation
3. **Missing rate limiting on data export** - API has rate limiting for Nivoda proxy but not for data export endpoints
4. **No graceful shutdown handling** - Services don't properly drain connections on termination
5. **Health check endpoints not implemented** - No `/health` or `/ready` endpoints in Express apps

**Current state:**
- Terraform modules: `infrastructure/terraform/modules/container-apps/main.tf`
- Services: API (Express REST), Worker (Service Bus consumer), Consolidator (Service Bus consumer), Scheduler (CronJob)
- Infrastructure: Azure Container Apps, PostgreSQL (Supabase), Service Bus, Blob Storage

**Production requirements:**
- Zero-downtime deployments
- Automatic failure recovery
- Observable health status
- Protected API endpoints from resource exhaustion

---

## Azure Container Apps Health Checks

### Three Probe Types

Azure Container Apps supports three distinct probe types, each serving a specific purpose:

| Probe Type | Purpose | Failure Behavior | When to Use |
|------------|---------|------------------|-------------|
| **Startup** | Validates successful container initialization | Restarts container if threshold exceeded | Slow-starting apps (>30s startup time) |
| **Liveness** | Detects deadlocks/hung processes | Restarts container | All long-running services |
| **Readiness** | Determines traffic eligibility | Removes from load balancer, retries without restart | All services receiving HTTP traffic |

**Key differences:**
- **Startup probes** delay liveness/readiness checks during initialization (prevents premature restarts)
- **Liveness probes** restart unhealthy containers (use for process health, not dependency health)
- **Readiness probes** control traffic routing without restarting (use for dependency validation)

### Terraform Configuration

Azure Container Apps health probes are configured within the `template.container` block:

```hcl
resource "azurerm_container_app" "api" {
  name                         = "diamond-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    container {
      name   = "api"
      image  = "registry.example.com/api:latest"
      cpu    = 0.5
      memory = "1Gi"

      # Startup probe - delays other probes during initialization
      startup_probe {
        transport                = "HTTP"
        port                     = 3000
        path                     = "/health/startup"
        interval_seconds         = 5
        timeout                  = 3
        failure_count_threshold  = 12  # 60s total (5s * 12)
        initial_delay            = 5
      }

      # Liveness probe - detects hung processes
      liveness_probe {
        transport                = "HTTP"
        port                     = 3000
        path                     = "/health/live"
        interval_seconds         = 10
        timeout                  = 3
        failure_count_threshold  = 3
        initial_delay            = 0  # Startup probe handles delay
      }

      # Readiness probe - controls traffic routing
      readiness_probe {
        transport                = "HTTP"
        port                     = 3000
        path                     = "/health/ready"
        interval_seconds         = 5
        timeout                  = 5
        failure_count_threshold  = 3
        success_count_threshold  = 1
        initial_delay            = 3
      }
    }
  }
}
```

**Available parameters:**

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `transport` | string | `HTTP`, `HTTPS`, `TCP` | — | Probe protocol (required) |
| `port` | int | 1-65535 | — | Target port (required) |
| `path` | string | — | `/` | HTTP/HTTPS path (optional) |
| `interval_seconds` | int | 1-240 | 10 | How often to probe |
| `timeout` | int | 1-240 | 1 | Probe timeout duration |
| `initial_delay` | int | 0-60 | 0 | Delay before first probe |
| `failure_count_threshold` | int | 1-10 | 3 | Consecutive failures = failed |
| `success_count_threshold` | int | 1-10 | 1 | Consecutive successes = healthy |

**HTTP probe configuration:**

```hcl
readiness_probe {
  transport = "HTTP"
  port      = 3000
  path      = "/health/ready"

  # Optional custom headers
  header {
    name  = "X-Health-Check"
    value = "readiness"
  }
}
```

**TCP probe configuration:**

```hcl
liveness_probe {
  transport        = "TCP"
  port             = 3000
  interval_seconds = 10
  timeout          = 2
}
```

### Default Probe Behavior

If ingress is enabled and no probes are explicitly configured, Azure Container Apps **automatically adds default TCP probes** to the main container:

| Probe | Protocol | Port | Timeout | Period | Initial Delay | Failure Threshold |
|-------|----------|------|---------|--------|---------------|-------------------|
| Startup | TCP | Ingress target | 3s | 1s | 1s | 240 |
| Liveness | TCP | Ingress target | 3s | 10s | 0s | 3 |
| Readiness | TCP | Ingress target | 5s | 5s | 3s | 48 |

**Important:** Default TCP probes only verify port connectivity, not application health. Always configure custom HTTP probes for production services.

### Message Consumer Services (Worker/Consolidator)

Services without HTTP ingress (Service Bus consumers) should use **TCP probes** or implement a basic HTTP health server:

**Option 1: TCP probe (simple, port-only check)**
```hcl
resource "azurerm_container_app" "worker" {
  template {
    container {
      name = "worker"

      # No ingress block - message consumer

      liveness_probe {
        transport                = "TCP"
        port                     = 3000  # App must listen on this port
        interval_seconds         = 30
        failure_count_threshold  = 3
      }
    }
  }
}
```

**Option 2: Dedicated health server (better observability)**
```javascript
// Worker health server (simple HTTP endpoint)
import http from 'http';

let isHealthy = true;

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const statusCode = isHealthy ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: isHealthy ? 'healthy' : 'unhealthy' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(3001, () => {
  logger.info('Health server listening on port 3001');
});

// Update health status based on message processing
export function setHealthStatus(healthy: boolean) {
  isHealthy = healthy;
}
```

---

## Health Check Endpoint Implementation

### Express.js Health Check Patterns

Health checks should be **fast (<1s), lightweight, and meaningful**. Implement three distinct endpoints:

#### 1. Startup Probe Endpoint (`/health/startup`)

**Purpose:** Validates one-time initialization tasks completed successfully
**When to fail:** Critical startup dependencies unavailable (config missing, migrations incomplete)

```typescript
// packages/api/src/routes/health.ts
import { Router } from 'express';
import { pool } from '@diamond/database';
import { createServiceLogger } from '@diamond/shared';

const router = Router();
const logger = createServiceLogger('api', { component: 'health' });

let startupComplete = false;

// Called after initialization completes
export function markStartupComplete() {
  startupComplete = true;
}

router.get('/health/startup', async (req, res) => {
  if (!startupComplete) {
    logger.warn('Startup probe failed: initialization incomplete');
    return res.status(503).json({
      status: 'starting',
      message: 'Service initializing'
    });
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});
```

**Usage in server.ts:**
```typescript
import { markStartupComplete } from './routes/health.js';

export async function startServer(): Promise<void> {
  const app = createApp();

  // Initialize services
  await initCurrencyService();
  await initCacheService();
  await initReapplyMonitor();

  // Signal startup complete BEFORE server.listen()
  markStartupComplete();

  app.listen(port, '0.0.0.0', () => {
    logger.info('Server started', { port });
  });
}
```

#### 2. Liveness Probe Endpoint (`/health/live`)

**Purpose:** Detects deadlocks, infinite loops, or hung processes
**When to fail:** Application unresponsive (not external dependencies)

```typescript
router.get('/health/live', (req, res) => {
  // Minimal check - just respond if event loop is alive
  res.status(200).json({
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
```

**Best practices:**
- **DO NOT** check database/external service health (use readiness probe instead)
- **DO NOT** add expensive operations (memory checks, file I/O)
- **DO** keep it synchronous and fast (<50ms)

**Why:** Failed liveness probes restart the container. External dependency failures should not trigger restarts (only prevent traffic via readiness).

#### 3. Readiness Probe Endpoint (`/health/ready`)

**Purpose:** Validates ability to serve requests (checks critical dependencies)
**When to fail:** Database unreachable, cache unavailable, Service Bus disconnected

```typescript
router.get('/health/ready', async (req, res) => {
  const checks: Record<string, boolean> = {
    database: false,
    cache: false,
  };

  try {
    // Database check (with timeout)
    const dbCheckPromise = pool.query('SELECT 1').then(() => true).catch(() => false);
    checks.database = await Promise.race([
      dbCheckPromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))
    ]);

    // Cache service check (verify polling active)
    const cacheStats = getCacheStats();
    checks.cache = cacheStats.version !== '0';

    const allHealthy = Object.values(checks).every(v => v === true);

    if (allHealthy) {
      return res.status(200).json({
        status: 'ready',
        checks,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.warn('Readiness check failed', { checks });
      return res.status(503).json({
        status: 'not_ready',
        checks,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Readiness check error', error);
    return res.status(503).json({
      status: 'error',
      checks,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
```

**Database health check with timeout:**
```typescript
async function checkDatabaseHealth(timeoutMs: number = 3000): Promise<boolean> {
  try {
    const result = await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
    return true;
  } catch (error) {
    logger.warn('Database health check failed', error);
    return false;
  }
}
```

**PostgreSQL connection pool validation:**
```typescript
import { pool } from '@diamond/database';

async function checkPoolHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    logger.error('Pool health check failed', error);
    return false;
  }
}
```

### Health Check Response Format

**Success response (HTTP 200):**
```json
{
  "status": "ready",
  "checks": {
    "database": true,
    "cache": true,
    "servicebus": true
  },
  "uptime": 3600,
  "timestamp": "2026-02-17T10:30:00.000Z"
}
```

**Failure response (HTTP 503):**
```json
{
  "status": "not_ready",
  "checks": {
    "database": false,
    "cache": true,
    "servicebus": true
  },
  "timestamp": "2026-02-17T10:30:00.000Z"
}
```

### Graceful Shutdown Implementation

Health checks alone are insufficient for zero-downtime deployments. Implement graceful shutdown to drain in-flight requests:

```typescript
// packages/api/src/server.ts
import http from 'http';
import { createTerminus } from '@godaddy/terminus';

let server: http.Server;

export async function startServer(): Promise<void> {
  const app = createApp();

  await initCurrencyService();
  await initCacheService();
  await initReapplyMonitor();

  markStartupComplete();

  server = app.listen(port, '0.0.0.0', () => {
    logger.info('Server started', { port });
  });

  setupGracefulShutdown(server);
}

function setupGracefulShutdown(server: http.Server): void {
  createTerminus(server, {
    signals: ['SIGTERM', 'SIGINT'],
    timeout: 30000, // 30s grace period

    beforeShutdown: async () => {
      logger.info('Received shutdown signal, starting graceful shutdown');
      // Wait for load balancer to remove from pool (readiness probe interval)
      return new Promise(resolve => setTimeout(resolve, 5000));
    },

    onSignal: async () => {
      logger.info('Cleaning up resources');

      // Stop accepting new connections (server.close() called by terminus)

      // Stop background services
      stopCacheService();

      // Close database pool
      await pool.end();

      logger.info('Cleanup complete');
    },

    onShutdown: async () => {
      logger.info('Server shut down');
    },

    logger: (msg, error) => {
      if (error) {
        logger.error(msg, error);
      } else {
        logger.info(msg);
      }
    }
  });
}
```

**Worker/Consolidator graceful shutdown:**
```typescript
// packages/worker/src/index.ts
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  isShuttingDown = true;

  // Stop accepting new messages
  await receiver.close();

  // Wait for in-flight messages to complete (up to 30s)
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Cleanup connections
  await pool.end();

  process.exit(0);
});

// In message handler
receiver.subscribe({
  processMessage: async (message) => {
    if (isShuttingDown) {
      logger.warn('Rejecting message during shutdown');
      // Return message to queue
      return;
    }

    // Process message...
  }
});
```

### Health Check Best Practices

1. **Separate endpoints for each probe type** - Don't reuse `/health` for all probes
2. **Fast execution** - Readiness checks should complete in <1s (preferably <500ms)
3. **Timeouts on dependency checks** - Never let health checks hang indefinitely
4. **Structured logging** - Log health check failures with context
5. **No authentication** - Health endpoints should be publicly accessible (internal network)
6. **Idempotent** - Health checks must not modify state
7. **Caching** - Consider caching dependency health status (5-10s) to reduce check overhead

**Anti-patterns:**
- ❌ Single `/health` endpoint for all probe types
- ❌ Checking external service health in liveness probes
- ❌ Expensive operations in health checks (full database scans, API calls)
- ❌ Returning 200 with `{"status": "unhealthy"}` body (probes only check HTTP status)

---

## Cache Invalidation Patterns

### Current Implementation (Polling-Based)

The diamond platform uses a **version-based cache invalidation** strategy with polling:

**How it works:**
1. Consolidator increments `dataset_versions.version` after successful run
2. API polls `dataset_versions` table every 30s (`CACHE_VERSION_POLL_INTERVAL_MS`)
3. When version changes, existing cache entries become stale (version mismatch)
4. Next request misses cache, fetches fresh data, caches with new version

**Strengths:**
- Simple implementation (no message bus dependency for invalidation)
- Eventually consistent (max 30s staleness)
- Works across API replicas without coordination

**Weaknesses:**
- Fixed 30s staleness window (can't invalidate immediately)
- Polling overhead (repeated database queries)
- Not suitable for real-time requirements (<5s staleness)

### Event-Driven Cache Invalidation

For faster invalidation, implement event-driven pattern using Azure Service Bus:

**Architecture:**
```
Consolidator → Service Bus Topic (cache-invalidation) → API Replicas (subscribers)
```

**Implementation:**

```typescript
// packages/shared/src/types.ts
export interface CacheInvalidationEvent {
  feed: string;
  version: number;
  timestamp: string;
  reason: 'consolidation_complete' | 'manual_invalidation';
}
```

```typescript
// packages/consolidator/src/index.ts
import { ServiceBusClient } from '@azure/service-bus';

async function notifyCacheInvalidation(feed: string, newVersion: number): Promise<void> {
  const sbClient = new ServiceBusClient(process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!);
  const sender = sbClient.createSender('cache-invalidation');

  const event: CacheInvalidationEvent = {
    feed,
    version: newVersion,
    timestamp: new Date().toISOString(),
    reason: 'consolidation_complete'
  };

  await sender.sendMessages({ body: event });
  await sender.close();
  await sbClient.close();

  logger.info('Cache invalidation event sent', { feed, version: newVersion });
}

// After incrementing dataset version
const newVersion = await incrementDatasetVersion(pool, feedName);
await notifyCacheInvalidation(feedName, newVersion);
```

```typescript
// packages/api/src/services/cache.ts
import { ServiceBusClient } from '@azure/service-bus';

let invalidationReceiver: ServiceBusReceiver | null = null;

export async function initCacheService(): Promise<void> {
  logger.info('Initializing cache service');

  // Initial version load
  await pollVersions();

  // Start version polling (fallback)
  versionPollTimer = setInterval(pollVersions, CACHE_VERSION_POLL_INTERVAL_MS);

  // Subscribe to cache invalidation events (primary)
  await subscribeCacheInvalidation();

  logger.info('Cache service initialized', { version: getCompositeVersion() });
}

async function subscribeCacheInvalidation(): Promise<void> {
  const sbClient = new ServiceBusClient(process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!);
  invalidationReceiver = sbClient.createReceiver('cache-invalidation', 'api-subscriber', {
    subQueue: 'deadletter'
  });

  invalidationReceiver.subscribe({
    processMessage: async (message) => {
      const event = message.body as CacheInvalidationEvent;
      logger.info('Received cache invalidation event', event);

      // Update local version immediately
      datasetVersions[event.feed] = event.version;

      logger.info('Cache invalidated', {
        feed: event.feed,
        newVersion: event.version,
        oldComposite: getCompositeVersion()
      });
    },
    processError: async (error) => {
      logger.error('Cache invalidation subscription error', error);
    }
  });
}

export function stopCacheService(): void {
  if (versionPollTimer) {
    clearInterval(versionPollTimer);
  }
  if (invalidationReceiver) {
    invalidationReceiver.close();
  }
  searchCache.clear();
  countCache.clear();
  analyticsCache.clear();
}
```

**Azure Service Bus Topic setup (Terraform):**

```hcl
# infrastructure/terraform/modules/service-bus/main.tf

resource "azurerm_servicebus_topic" "cache_invalidation" {
  name         = "cache-invalidation"
  namespace_id = azurerm_servicebus_namespace.main.id

  enable_partitioning = false
}

resource "azurerm_servicebus_subscription" "cache_invalidation_api" {
  name               = "api-subscriber"
  topic_id           = azurerm_servicebus_topic.cache_invalidation.id
  max_delivery_count = 10

  # Each API replica gets messages (not competing consumers)
  requires_session = false
}
```

**Hybrid approach (recommended):**
- Use **event-driven invalidation** for immediate updates (<1s)
- Keep **polling as fallback** (30s interval) for reliability if messages fail
- Log discrepancies between event version and polled version

### Cache Invalidation Strategies Comparison

| Strategy | Latency | Complexity | Reliability | Cost |
|----------|---------|------------|-------------|------|
| **TTL-only** | Fixed (e.g., 5min) | Low | High | Low |
| **Version polling** | Fixed (e.g., 30s) | Medium | High | Low |
| **Event-driven** | Near-instant (<1s) | High | Medium | Medium |
| **Hybrid (polling + events)** | Near-instant with fallback | High | Very High | Medium |

**Recommendation for diamond platform:**
- **Short term:** Keep version polling (already implemented, works well)
- **Long term:** Add event-driven invalidation if real-time requirements emerge (e.g., pricing changes must reflect within 5s)

---

## API Rate Limiting

### Current State

The diamond platform has **in-memory rate limiting for Nivoda proxy** (`packages/api/src/middleware/rateLimiter.ts`):
- Token bucket algorithm
- 25 req/s per API replica (configurable via `NIVODA_PROXY_RATE_LIMIT`)
- Request queueing with max 60s wait
- 429 responses after queue timeout

**Gap:** No rate limiting on data export endpoints (`/api/search`, `/api/diamonds/:id`).

### Per-Endpoint Rate Limiting

Implement tiered rate limiting for different endpoint categories:

```typescript
// packages/api/src/middleware/rateLimiter.ts

interface RateLimitConfig {
  tokensPerInterval: number;
  intervalMs: number;
  maxQueueWait: number;
}

const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  search: {
    tokensPerInterval: 100,
    intervalMs: 60000, // 100 req/min
    maxQueueWait: 5000
  },
  export: {
    tokensPerInterval: 10,
    intervalMs: 60000, // 10 req/min (expensive)
    maxQueueWait: 10000
  },
  write: {
    tokensPerInterval: 50,
    intervalMs: 60000, // 50 req/min
    maxQueueWait: 5000
  },
  nivodaProxy: {
    tokensPerInterval: 25,
    intervalMs: 1000, // 25 req/s
    maxQueueWait: 60000
  }
};

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<{ resolve: () => void; reject: () => void; timestamp: number }> = [];

  constructor(
    private config: RateLimitConfig
  ) {
    this.tokens = config.tokensPerInterval;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Queue request
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timestamp: Date.now() };
      this.queue.push(entry);

      // Timeout handling
      setTimeout(() => {
        const index = this.queue.indexOf(entry);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error('Rate limit queue timeout'));
        }
      }, this.config.maxQueueWait);
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.config.intervalMs) * this.config.tokensPerInterval;

    this.tokens = Math.min(
      this.config.tokensPerInterval,
      this.tokens + tokensToAdd
    );
    this.lastRefill = now;

    // Process queue
    while (this.queue.length > 0 && this.tokens >= 1) {
      const entry = this.queue.shift();
      if (entry && Date.now() - entry.timestamp <= this.config.maxQueueWait) {
        this.tokens -= 1;
        entry.resolve();
      }
    }
  }
}

const buckets = new Map<string, TokenBucket>();

export function createRateLimiter(category: keyof typeof RATE_LIMIT_CONFIGS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const bucketKey = `${category}:${clientId}`;

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, new TokenBucket(RATE_LIMIT_CONFIGS[category]));
    }

    const bucket = buckets.get(bucketKey)!;

    try {
      await bucket.acquire();

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', RATE_LIMIT_CONFIGS[category].tokensPerInterval);
      res.setHeader('X-RateLimit-Remaining', Math.floor(bucket['tokens']));

      next();
    } catch (error) {
      req.log.warn('Rate limit exceeded', { category, clientId });
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded for ${category} endpoints`,
        retryAfter: Math.ceil(RATE_LIMIT_CONFIGS[category].intervalMs / 1000)
      });
    }
  };
}
```

**Apply rate limiting to routes:**

```typescript
// packages/api/src/routes/index.ts
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Search endpoints (100 req/min per client)
router.get('/api/search', createRateLimiter('search'), searchHandler);

// Export endpoints (10 req/min per client - expensive)
router.get('/api/export/csv', createRateLimiter('export'), exportCSVHandler);
router.get('/api/export/json', createRateLimiter('export'), exportJSONHandler);

// Write endpoints (50 req/min per client)
router.post('/api/pricing-rules', createRateLimiter('write'), createPricingRuleHandler);
router.put('/api/pricing-rules/:id', createRateLimiter('write'), updatePricingRuleHandler);

export default router;
```

### Rate Limiting Best Practices

1. **Per-client tracking** - Use IP address or API key as identifier (not global limit)
2. **Response headers** - Include `X-RateLimit-*` headers for client visibility
3. **Retry-After** - Provide explicit retry timing in 429 responses
4. **Tiered limits** - Different limits for read vs write vs export operations
5. **Graceful degradation** - Queue requests briefly before rejecting (better UX)
6. **Monitoring** - Log rate limit hits for capacity planning
7. **Distributed state** - For multi-replica deployments, use Redis for shared state (optional)

**Redis-backed rate limiting (for multi-replica consistency):**

```typescript
import { Redis } from 'ioredis';

class RedisTokenBucket {
  private redis: Redis;

  constructor(private config: RateLimitConfig) {
    this.redis = new Redis(process.env.REDIS_URL!);
  }

  async acquire(clientId: string): Promise<boolean> {
    const key = `ratelimit:${clientId}`;
    const now = Date.now();

    // Lua script for atomic token acquisition
    const script = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local interval = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local tokens = redis.call('get', key)
      if not tokens then
        tokens = limit
      else
        tokens = tonumber(tokens)
      end

      if tokens >= 1 then
        redis.call('set', key, tokens - 1, 'PX', interval)
        return 1
      else
        return 0
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      key,
      this.config.tokensPerInterval,
      this.config.intervalMs,
      now
    );

    return result === 1;
  }
}
```

**Note:** Redis adds operational complexity. Use only if exact cross-replica limits are required. Otherwise, per-replica in-memory limits are simpler (effective limit = per_replica_limit * num_replicas).

---

## Terraform Best Practices

### Module Organization

Current structure:
```
infrastructure/terraform/
├── environments/
│   ├── prod/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── staging/
├── modules/
│   ├── container-apps/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── service-bus/
│   ├── storage/
│   └── container-registry/
```

**Best practices applied:**
- ✅ Environment-specific overrides in `environments/`
- ✅ Reusable modules in `modules/`
- ✅ Secrets via Terraform variables (not hardcoded)

**Improvements:**

1. **Health check variables in module:**

```hcl
# infrastructure/terraform/modules/container-apps/variables.tf

variable "api_health_check_config" {
  description = "Health check configuration for API"
  type = object({
    startup_enabled             = bool
    startup_path                = string
    startup_interval_seconds    = number
    startup_failure_threshold   = number
    liveness_path               = string
    liveness_interval_seconds   = number
    readiness_path              = string
    readiness_interval_seconds  = number
    readiness_failure_threshold = number
  })
  default = {
    startup_enabled             = true
    startup_path                = "/health/startup"
    startup_interval_seconds    = 5
    startup_failure_threshold   = 12
    liveness_path               = "/health/live"
    liveness_interval_seconds   = 10
    readiness_path              = "/health/ready"
    readiness_interval_seconds  = 5
    readiness_failure_threshold = 3
  }
}
```

2. **Conditional probe creation:**

```hcl
# infrastructure/terraform/modules/container-apps/main.tf

resource "azurerm_container_app" "api" {
  # ... existing config

  template {
    container {
      name = "api"

      # Startup probe (optional)
      dynamic "startup_probe" {
        for_each = var.api_health_check_config.startup_enabled ? [1] : []
        content {
          transport                = "HTTP"
          port                     = 3000
          path                     = var.api_health_check_config.startup_path
          interval_seconds         = var.api_health_check_config.startup_interval_seconds
          failure_count_threshold  = var.api_health_check_config.startup_failure_threshold
          timeout                  = 3
          initial_delay            = 5
        }
      }

      # Liveness probe
      liveness_probe {
        transport                = "HTTP"
        port                     = 3000
        path                     = var.api_health_check_config.liveness_path
        interval_seconds         = var.api_health_check_config.liveness_interval_seconds
        failure_count_threshold  = 3
        timeout                  = 3
        initial_delay            = 0
      }

      # Readiness probe
      readiness_probe {
        transport                = "HTTP"
        port                     = 3000
        path                     = var.api_health_check_config.readiness_path
        interval_seconds         = var.api_health_check_config.readiness_interval_seconds
        failure_count_threshold  = var.api_health_check_config.readiness_failure_threshold
        timeout                  = 5
        initial_delay            = 3
      }
    }
  }
}
```

3. **Environment-specific overrides:**

```hcl
# infrastructure/terraform/environments/prod/main.tf

module "container_apps" {
  source = "../../modules/container-apps"

  # ... existing config

  api_health_check_config = {
    startup_enabled             = true
    startup_path                = "/health/startup"
    startup_interval_seconds    = 5
    startup_failure_threshold   = 12  # 60s total
    liveness_path               = "/health/live"
    liveness_interval_seconds   = 10
    readiness_path              = "/health/ready"
    readiness_interval_seconds  = 5
    readiness_failure_threshold = 3
  }
}
```

### Monitoring Configuration

Configure Log Analytics queries for health probe failures:

```hcl
# infrastructure/terraform/modules/container-apps/main.tf

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "health_probe_failures" {
  name                = "${var.app_name_prefix}-health-probe-failures"
  location            = var.location
  resource_group_name = var.resource_group_name

  scopes = [azurerm_log_analytics_workspace.main.id]

  criteria {
    query = <<-QUERY
      ContainerAppSystemLogs_CL
      | where TimeGenerated > ago(5m)
      | where Log_s contains "Probe failed"
      | summarize FailureCount = count() by ContainerAppName_s, bin(TimeGenerated, 1m)
      | where FailureCount > 3
    QUERY

    time_aggregation_method = "Count"
    threshold               = 3
    operator                = "GreaterThan"
  }

  severity    = 2  # Warning
  frequency   = "PT5M"
  window_duration = "PT5M"

  action {
    action_groups = [azurerm_monitor_action_group.alerts.id]
  }
}
```

### Infrastructure Validation

Add validation rules for health check configuration:

```hcl
variable "api_health_check_config" {
  # ... type definition

  validation {
    condition     = var.api_health_check_config.startup_interval_seconds >= 1 && var.api_health_check_config.startup_interval_seconds <= 240
    error_message = "startup_interval_seconds must be between 1 and 240"
  }

  validation {
    condition     = var.api_health_check_config.startup_failure_threshold >= 1 && var.api_health_check_config.startup_failure_threshold <= 10
    error_message = "startup_failure_threshold must be between 1 and 10"
  }

  validation {
    condition     = var.api_health_check_config.readiness_interval_seconds >= 1 && var.api_health_check_config.readiness_interval_seconds <= 240
    error_message = "readiness_interval_seconds must be between 1 and 240"
  }
}
```

---

## Recommendations

### High Priority (Implement Now)

| Recommendation | Confidence | Rationale |
|----------------|------------|-----------|
| **Add health check endpoints to API** | HIGH | Zero-downtime deployments require readiness probes; current default TCP probes insufficient |
| **Configure HTTP probes in Terraform** | HIGH | Default TCP probes only check port connectivity, not application health |
| **Implement graceful shutdown** | HIGH | Prevents connection errors during deployments/scaling |
| **Add startup probes for slow services** | MEDIUM | Prevents premature restarts during initialization (API has multiple init steps) |

**Implementation order:**
1. Add health endpoints to API (`/health/startup`, `/health/live`, `/health/ready`)
2. Update Terraform with HTTP probe configuration
3. Add graceful shutdown handling (terminus library)
4. Deploy and validate with rolling update

### Medium Priority (Next Iteration)

| Recommendation | Confidence | Rationale |
|----------------|------------|-----------|
| **Per-endpoint rate limiting** | HIGH | Data export endpoints can cause resource exhaustion without limits |
| **Health server for Worker/Consolidator** | MEDIUM | Improves observability vs TCP-only probes; not critical (message consumers auto-recover) |
| **Cache invalidation events** | MEDIUM | Current 30s polling acceptable; events only needed for real-time requirements (<5s) |

### Low Priority (Optional Enhancements)

| Recommendation | Confidence | Rationale |
|----------------|------------|-----------|
| **Redis-backed rate limiting** | LOW | Per-replica in-memory limits sufficient unless exact cross-replica limits required |
| **Advanced health metrics** | LOW | Basic probes sufficient; advanced metrics (memory, CPU) add complexity with limited value |
| **Multi-region failover** | LOW | Current single-region deployment adequate; multi-region adds significant complexity |

### Anti-Patterns to Avoid

1. **Single health endpoint for all probes** - Liveness and readiness have different failure semantics (restart vs traffic removal)
2. **Checking external services in liveness** - External failures should affect readiness, not trigger restarts
3. **Long startup without startup probe** - Liveness probe will restart container before initialization completes
4. **Ignoring graceful shutdown** - Health probes alone insufficient for zero-downtime deployments
5. **Default TCP probes in production** - Only validate port connectivity, not application health

### Configuration Recommendations

**API (Express REST):**
```hcl
startup_probe {
  transport                = "HTTP"
  path                     = "/health/startup"
  interval_seconds         = 5
  failure_count_threshold  = 12  # 60s max startup time
  timeout                  = 3
}

liveness_probe {
  transport                = "HTTP"
  path                     = "/health/live"
  interval_seconds         = 10
  failure_count_threshold  = 3
  timeout                  = 3
}

readiness_probe {
  transport                = "HTTP"
  path                     = "/health/ready"
  interval_seconds         = 5
  failure_count_threshold  = 3
  timeout                  = 5
}
```

**Worker/Consolidator (Service Bus consumers):**
```hcl
liveness_probe {
  transport                = "TCP"
  port                     = 3001  # Dedicated health server
  interval_seconds         = 30
  failure_count_threshold  = 3
  timeout                  = 3
}
```

**Scheduler (CronJob - no probes needed):**
- Container Apps Jobs don't support health probes
- Job timeout and retry configuration sufficient

---

## References

### Official Documentation (HIGH confidence)

- [Health probes in Azure Container Apps | Microsoft Learn](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)
- [Container Apps: Troubleshooting and configuration with Health Probes](https://azureossd.github.io/2023/08/23/Container-Apps-Troubleshooting-and-configuration-with-Health-Probes/)
- [Microsoft.App/containerApps - ARM template reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/containerapps)
- [azurerm_container_app - Terraform Registry](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app)
- [Health Checks and Graceful Shutdown - Express.js](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)

### Practical Guides (MEDIUM confidence)

- [How to implement a health check in Node.js - LogRocket](https://blog.logrocket.com/how-to-implement-a-health-check-in-node-js/)
- [How to Add Rate Limiting to Express APIs](https://oneuptime.com/blog/post/2026-02-02-express-rate-limiting/view)
- [Token Bucket Algorithm (Rate Limiting) | Medium](https://medium.com/@surajshende247/token-bucket-algorithm-rate-limiting-db4c69502283)
- [Cache Invalidation Strategies Time-Based vs Event-Driven | Leapcell](https://leapcell.io/blog/cache-invalidation-strategies-time-based-vs-event-driven)
- [Graceful shutdown with Node.js and Kubernetes - RisingStack](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/)

### Community Resources (MEDIUM confidence)

- [Support for additional settings in liveness_probe - GitHub Issue #25457](https://github.com/hashicorp/terraform-provider-azurerm/issues/25457)
- [Azure/terraform-azurerm-avm-res-app-containerapp - GitHub](https://github.com/Azure/terraform-azurerm-avm-res-app-containerapp)
- [http-graceful-shutdown - npm](https://www.npmjs.com/package/http-graceful-shutdown)
- [Caches in Microservice architecture | SoftwareMill](https://softwaremill.com/caches-in-microservice-architecture/)

### PostgreSQL Connection Pooling (MEDIUM confidence)

- [Connection Pool — PostgREST Documentation](https://postgrest.org/en/stable/references/connection_pool.html)
- [Health Check - Pgpool-II Documentation](https://www.pgpool.net/docs/latest/en/html/runtime-config-health-check.html)
- [Database Connection Pool Optimization | Medium](https://medium.com/@shahharsh172/database-connection-pool-optimization-from-500-errors-to-99-9-uptime-9deb985f5164)
