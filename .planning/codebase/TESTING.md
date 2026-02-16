# Testing Patterns

**Analysis Date:** 2026-02-17

## Test Framework

**Runner:**
- Vitest v1.1.0
- Config: `tests/local/vitest.config.ts` (root level)
- ESM-compatible, TypeScript support native

**Assertion Library:**
- Vitest built-in (`expect()`)
- No separate assertion library

**Run Commands:**
```bash
npm run test                          # Run all tests across workspace (--workspaces --if-present)
npm run test -w @diamond/pricing-engine  # Run tests in specific workspace
npm run test:watch                    # Watch mode with auto-rerun
```

**Test Timeout Settings:**
- Unit tests: default timeout
- Integration tests: `testTimeout: 120_000` (2 minutes)
- Hook timeout: `hookTimeout: 60_000` (1 minute)
- Sequential test execution: `fileParallelism: false` (tests share database, must run sequentially)

## Test File Organization

**Location:**
- **Co-located with source:** `packages/*/src/queries/__tests__/*.test.ts`
- **Dedicated directory:** `packages/*/`**tests__/` for full adapter tests**
- **Integration tests:** `tests/local/` directory at root level (run against Docker stack)

**Naming:**
- Unit tests: `*.test.ts` (e.g., `engine.test.ts`, `heatmap.test.ts`)
- Integration tests: `*.integration.test.ts` (e.g., `diamonds.integration.test.ts`)
- E2E tests: `*-e2e.test.ts` (e.g., `e2e-pipeline.test.ts`)

**File Structure:**
```
packages/pricing-engine/
├── src/
│   └── engine.ts
└── __tests__/
    └── engine.test.ts

packages/database/
├── src/
│   ├── client.ts
│   └── queries/
│       ├── diamonds.ts
│       └── __tests__/
│           └── partition-progress.test.ts
│           └── analytics-feed.test.ts

tests/local/
├── vitest.config.ts
├── helpers.ts
├── integration.test.ts
└── e2e-pipeline.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('PricingEngine', () => {
  let engine: PricingEngine;

  beforeEach(() => {
    engine = new PricingEngine();
  });

  describe('getStoneType', () => {
    it('should return fancy when diamond has fancyColor', () => {
      expect(getStoneType({ labGrown: false, fancyColor: 'Fancy Yellow' }))
        .toBe('fancy');
    });

    it('should return lab when diamond is lab grown without fancyColor', () => {
      expect(getStoneType({ labGrown: true })).toBe('lab');
    });
  });

  describe('calculatePricing', () => {
    it('should use base margin with modifier for natural diamond', () => {
      engine.setRules([createMockRule({ stoneType: 'natural', marginModifier: 5 })]);
      const diamond = createMockDiamond({ feedPrice: 1000, labGrown: false });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.baseMargin).toBe(40);
      expect(pricing.effectiveMargin).toBe(45);
      expect(pricing.priceModelPrice).toBe(1450);
    });
  });
});
```

**Patterns:**
- `describe()` blocks organize related tests by functionality
- Nested `describe()` blocks for method-level grouping
- `beforeEach()` sets up shared state (don't use `before()` for test isolation)
- One assertion per `it()` block preferred, multiple assertions allowed if testing one behavior
- Test names are descriptive and read as executable statements: "should return fancy when..."

## Mocking

**Framework:** Vitest's native `vi` module

**Patterns:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock entire modules at top level
vi.mock('@diamond/database', () => ({
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();  // Reset mocks before each test
  });

  it('should pass with valid API key', async () => {
    const { getApiKeyByHash } = await import('@diamond/database');
    (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'key-1',
      keyHash: sha256('valid-api-key'),
      clientName: 'test',
      active: true,
    });

    mockReq.headers = { 'x-api-key': 'valid-api-key' };
    const { authMiddleware } = await import('../src/middleware/auth.js');
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
```

**What to Mock:**
- External API calls (Nivoda, Azure services)
- Database queries (in unit tests, not integration tests)
- File system operations
- Crypto/randomization (when determinism matters)
- HTTP requests

**What NOT to Mock:**
- Core business logic (pricing engine, heatmap algorithm)
- Internal utility functions (`withRetry`, `createLogger`)
- The function under test
- Database in integration tests (use real database)

**Mock Setup:**
- Use factory functions (`createMockRule()`, `createMockDiamond()`) to generate consistent test objects
- Factory functions accept `overrides` parameter for customization
- Overrides apply via spread operator: `{ ...defaults, ...overrides }`

## Fixtures and Factories

**Test Data:**
```typescript
// Factory function with defaults and override capability
const createMockRule = (overrides: Partial<PricingRule> = {}): PricingRule => ({
  id: 'test-rule',
  priority: 100,
  marginModifier: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockDiamond = (overrides: Partial<Diamond> = {}): Diamond => ({
  id: 'test-diamond',
  feed: 'nivoda',
  supplierStoneId: 'stone-1',
  offerId: 'offer-1',
  shape: 'ROUND',
  carats: 1.0,
  color: 'G',
  clarity: 'VS1',
  labGrown: false,
  treated: false,
  feedPrice: 5000,
  pricePerCarat: 5000,
  availability: 'available',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Usage
const cheapDiamond = createMockDiamond({ feedPrice: 500 });
const expensiveDiamond = createMockDiamond({ feedPrice: 8000 });
```

**Location:**
- Defined at top of test file or in `helpers.ts` for shared tests
- Factories return new instances each call (avoid shared state)
- Base objects include all required fields; tests override only what matters

## Coverage

**Requirements:** No minimum enforced

**View Coverage:**
```bash
npm run test -- --coverage
```

**Coverage Gaps Identified:**
- Some database integration queries have minimal coverage (complex schema interactions)
- Heatmap edge cases (boundary conditions between price ranges)
- Error paths in pipeline services (scheduler, worker, consolidator)

## Test Types

**Unit Tests:**
- Scope: Single function or class method
- Approach: All dependencies mocked, pure functions tested in isolation
- Examples: `packages/pricing-engine/__tests__/engine.test.ts`, `packages/feed-registry/__tests__/heatmap.test.ts`
- Execution: Fast, run on every save in watch mode

**Integration Tests:**
- Scope: Multiple components working together (database + service logic)
- Approach: Real database instance, mocked external APIs
- Examples: `packages/database/__tests__/diamonds.integration.test.ts`, `packages/shared/__tests__/pipeline.integration.test.ts`
- Execution: Moderate speed, require local database

**E2E Tests:**
- Scope: Full pipeline from ingestion through consolidation
- Approach: Docker Compose stack running all services, real database and Azure emulator
- Location: `tests/local/integration.test.ts`, `tests/local/e2e-pipeline.test.ts`
- Prerequisites: `npm run local:up` running, demo feed seeded
- Execution: `npm run local:e2e` (runs full E2E suite)

## Common Patterns

**Async Testing:**
```typescript
it('should fetch and validate API key', async () => {
  const { getApiKeyByHash } = await import('@diamond/database');
  (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'key-1',
    keyHash: sha256('valid-api-key'),
  });

  const isValid = await validateApiKey('valid-api-key');
  expect(isValid).toBe(true);
});
```

**Polling/Timeout Testing:**
```typescript
// From integration tests
it('should eventually populate the diamonds table', async () => {
  // Wait for consolidation to process records
  await pollUntil(
    async () => {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
      );
      return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
    },
    { label: 'diamonds table has demo rows', timeoutMs: 90_000, intervalMs: 3_000 }
  );

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
  );
  const count = parseInt(result.rows[0]?.count ?? '0', 10);
  expect(count).toBeGreaterThan(0);
});
```

**Error Testing:**
```typescript
it('should throw if rules not loaded', () => {
  const diamond = createMockDiamond();
  expect(() => engine.findMatchingRule(diamond)).toThrow(
    'Pricing rules not loaded'
  );
});

it('should reject invalid HMAC signature', async () => {
  const { getApiKeyByHash } = await import('@diamond/database');
  (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = sha256('original-body');
  const canonicalString = ['POST', '/api/v2/diamonds', timestamp, bodyHash].join('\n');
  const signature = hmacSha256('test-secret', canonicalString);

  mockReq.method = 'POST';
  mockReq.headers = {
    'x-client-id': 'test-client',
    'x-timestamp': timestamp,
    'x-signature': signature,
  };
  mockReq.rawBody = 'tampered-body';  // Body does not match signature

  const { authMiddleware } = await import('../src/middleware/auth.js');
  await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

  expect(mockNext).not.toHaveBeenCalled();
  expect(statusMock).toHaveBeenCalledWith(401);
});
```

**Mock Tracking:**
```typescript
it('should update API key last used on valid key', async () => {
  const { getApiKeyByHash, updateApiKeyLastUsed } = await import('@diamond/database');
  (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'key-1',
    keyHash: sha256('valid-api-key'),
  });

  mockReq.headers = { 'x-api-key': 'valid-api-key' };
  const { authMiddleware } = await import('../src/middleware/auth.js');
  await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

  expect(updateApiKeyLastUsed).toHaveBeenCalled();
});
```

## Database Testing

**Integration Test Helpers:**
```typescript
// From tests/local/helpers.ts
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

**Integration Test Pattern:**
```typescript
import { afterAll } from 'vitest';
import { query, closePool } from './helpers.js';

afterAll(async () => {
  await closePool();
});

describe('Consolidation', () => {
  it('should populate the diamonds table', async () => {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });
});
```

## E2E Testing

**Environment:**
- Requires Docker Compose stack: `npm run local:up`
- Sets: `DATABASE_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `API_BASE_URL`
- Demo feed seeded with 500 records before tests run

**Test Structure:**
```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { query, closePool, pollUntil, apiGet, apiPost, makeHmacHeaders } from './helpers.js';

describe('Partitioning + Heatmap', () => {
  it('should have created at least one run', async () => {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_metadata WHERE feed = 'demo'`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should have created partition_progress rows', async () => {
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM partition_progress pp
           JOIN run_metadata rm ON pp.run_id = rm.run_id
           WHERE rm.feed = 'demo'`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'partition_progress rows exist', timeoutMs: 30_000 }
    );
  });
});

describe('Worker + Raw Writes', () => {
  it('should have written raw diamonds', async () => {
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM raw_diamonds_demo`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'raw_diamonds_demo has rows', timeoutMs: 60_000 }
    );
  });

  it('should not have duplicate supplier_stone_id rows', async () => {
    const result = await query<{ supplier_stone_id: string; cnt: string }>(
      `SELECT supplier_stone_id, COUNT(*)::text AS cnt
       FROM raw_diamonds_demo
       GROUP BY supplier_stone_id
       HAVING COUNT(*) > 1`
    );
    expect(result.rows).toHaveLength(0);
  });
});

afterAll(async () => {
  await closePool();
});
```

**HMAC Auth in Tests:**
```typescript
export function makeHmacHeaders(
  method: string,
  path: string,
  body: string = '',
): Record<string, string> {
  const clientId = process.env.HMAC_CLIENT_ID ?? 'local';
  const secret = process.env.HMAC_SECRET ?? 'local-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = sha256(body);
  const canonical = [method, path, timestamp, bodyHash].join('\n');
  const signature = hmacSha256(secret, canonical);

  return {
    'x-client-id': clientId,
    'x-timestamp': timestamp,
    'x-signature': signature,
    'content-type': 'application/json',
  };
}

export async function apiPost(path: string, body: unknown = {}): Promise<Response> {
  const bodyStr = JSON.stringify(body);
  const headers = makeHmacHeaders('POST', path, bodyStr);
  return fetch(`${API_BASE()}${path}`, {
    method: 'POST',
    headers,
    body: bodyStr,
  });
}
```

## Mock Adapter Pattern

**For Heatmap Testing:**
```typescript
function createMockAdapter(items: MockInventoryItem[]): FeedAdapter {
  return {
    feedId: 'test',
    rawTableName: 'raw_diamonds_test',
    watermarkBlobName: 'test.json',
    maxPageSize: 1000,
    workerPageSize: 100,
    heatmapConfig: {},

    async getCount(query: FeedQuery): Promise<number> {
      let filtered = items;
      if (query.priceRange) {
        filtered = filtered.filter(
          i => i.price >= query.priceRange!.from && i.price <= query.priceRange!.to
        );
      }
      return filtered.length;
    },

    async search(query: FeedQuery, options: FeedSearchOptions): Promise<FeedSearchResult> {
      // Implementation filters by price range, applies offset/limit, returns items
      // Used to test partition boundary correctness
    },

    extractIdentity(item: Record<string, unknown>): FeedBulkRawDiamond {
      return {
        supplierStoneId: item.stone_id as string,
        offerId: item.stone_id as string,
        payload: item,
      };
    },

    mapRawToDiamond(payload: Record<string, unknown>): MappedDiamond {
      // Minimal mapping for test purposes
      return { /* ... */ };
    },

    async initialize(): Promise<void> { /* no-op */ },
  };
}
```

---

*Testing analysis: 2026-02-17*
