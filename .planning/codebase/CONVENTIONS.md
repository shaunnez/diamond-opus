# Coding Conventions

**Analysis Date:** 2026-02-17

## Naming Patterns

**Files:**
- **Source files:** Lowercase with hyphens for multiple words (e.g., `rate-limiter.ts`, `pricing-rules.ts`)
- **Directories:** Lowercase plural for collections (e.g., `packages/`, `apps/`, `routes/`, `utils/`, `middleware/`)
- **Test files:** Co-located with source using `__tests__/` directories or `.test.ts`/`.spec.ts` suffixes (e.g., `packages/pricing-engine/__tests__/engine.test.ts`)

**Functions:**
- Camel case for all functions and methods: `calculateRetryDelay()`, `isRetryableError()`, `scanHeatmap()`
- Prefix async functions clearly with context: `validateApiKey()`, `getDefaultPricingEngine()`, `fetchWatermark()`
- Utility factories use `create*` or `get*` prefix: `createLogger()`, `getPool()`, `createMockAdapter()`
- Predicate functions start with `is*` or `should*`: `isRetryableError()`, `shouldUsePretty()`, `isValid()`

**Variables:**
- Camel case for variables and constants declared at runtime
- All caps with underscores for compile-time constants: `WORKER_PAGE_SIZE`, `CONSOLIDATOR_BATCH_SIZE`, `HMAC_TIMESTAMP_TOLERANCE_SECONDS`
- Constants grouped in `packages/shared/src/constants.ts` with doc comments
- Cached/module-scoped variables use descriptive names: `cachedHmacSecrets`, `defaultEngine`, `pool`

**Types:**
- Pascal case for all type/interface names: `PricingEngine`, `FeedAdapter`, `LogContext`, `RetryOptions`
- Generic type parameters are single uppercase letters or semantic names: `<T>`, `<S extends QueryResultRow>`
- Interface names use no prefix: `Logger` not `ILogger`
- Type imports use explicit `type` keyword: `import type { Diamond } from '@diamond/shared'`
- Utility types exported from index files with star patterns: `export * from './types/index.js'`

## Code Style

**Formatting:**
- ESLint enforces style with TypeScript support
- Config: `.eslintrc.cjs` (root level)
- Target: ES2022, strict mode enabled in `tsconfig.json`
- Module resolution: NodeNext for ESM compatibility
- All source files transpile to `dist/` directory

**Linting:**
- ESLint base config extends `eslint:recommended` with `@typescript-eslint/parser`
- Unused variables flagged as warnings with pattern exception: `argsIgnorePattern: '^_'` (allows `_unused` pattern)
- `no-console` turned off (allowed for logging and debugging)
- `no-constant-condition` allowed in loops (for `while (true)` patterns used in service loops)
- `no-undef` disabled (TypeScript handles undefined variable checking)
- Run: `npm run lint` targets all `.ts` files across workspace

**Indentation:**
- 2 spaces (consistent throughout codebase)

## Import Organization

**Order:**
1. Node.js built-in modules: `import { createHash } from 'node:crypto'`
2. Third-party packages: `import express from 'express'`, `import type { Request } from 'express'`
3. Internal workspace packages: `import { ... } from '@diamond/shared'`, `import { ... } from '@diamond/database'`
4. Relative imports: `import { ... } from './utils.js'`, `import { ... } from '../handlers/index.js'`

**Path Aliases:**
- No path aliases in `tsconfig.json` — use relative imports within packages
- Cross-package imports use `@diamond/*` workspace scope: `import { createLogger } from '@diamond/shared'`
- All module extensions must be explicit: `.js` for imports (even in `.ts` files) for ESM compatibility

**Type Imports:**
- Use explicit `type` keyword for type-only imports: `import type { Diamond } from '@diamond/shared'`
- Separate from value imports: values before types, each group alphabetized

## Error Handling

**Patterns:**
- Errors propagate with context added at each layer
- Use `Error` constructor with descriptive messages: `throw new Error('Pricing rules not loaded. Call loadRules() first.')`
- Non-retryable errors throw immediately; retryable errors caught by `withRetry()`
- Validation errors (including malformed input) are non-retryable
- Network/timeout errors are retryable with exponential backoff

**Error Logging:**
- Errors logged with context using `logger.error(msg, error, data)`
- Stack traces truncated to 6 lines (5 frames) to avoid Azure log size limits (32KB per entry)
- Error messages capped to 1000 characters via `capErrorMessage()`
- Large payloads in logs truncated to 1KB-2KB per field

**Graceful Failures:**
- Service never crashes on log persistence failures: `safeLogError()` falls back to stdout
- Async updates that fail are not awaited with `.catch(() => {})` (e.g., `updateApiKeyLastUsed()`)
- Partial success thresholds define when pipelines continue vs. stop (e.g., `AUTO_CONSOLIDATION_SUCCESS_THRESHOLD = 0.70`)

## Logging

**Framework:** Pino with `pino-pretty` transport

**Configuration:**
- Created via `createLogger()` with service name and optional context
- Development uses colored, human-readable output; production outputs JSON
- Log level controlled by `LOG_LEVEL` env var, defaults to `info`

**Context Attachment:**
- `LogContext` interface defines standard fields: `runId`, `traceId`, `workerId`, `partitionId`, `supplier`, `diamondId`
- Child loggers inherit parent context: `logger.child({ runId: '123' })`
- Context automatically merged into all log entries

**Patterns:**
- Use `logger.info()` for state transitions and milestones
- Use `logger.debug()` for detailed processing steps (off by default)
- Use `logger.warn()` for degraded conditions that don't stop execution
- Use `logger.error(msg, error, data)` for caught errors with optional context
- Use `logger.fatal(msg, error, data)` only for unrecoverable initialization failures

**Service Logger:**
- `createServiceLogger()` provides typed context method: `.withContext({ runId, partitionId, traceId })`
- Enforces consistent field names across all services in the pipeline
- Used by scheduler, worker, and consolidator for correlation

**Trace IDs:**
- Generated via `generateTraceId()` (UUID v4)
- Passed through entire pipeline for request correlation
- Included in error logs and Azure Application Insights

## Comments

**When to Comment:**
- Complex algorithms with non-obvious intent: heatmap density scanning, retry backoff calculations
- Business logic that differs from code readability: why a 15-minute safety buffer, why certain errors are non-retryable
- External API contracts that differ from TypeScript types
- Do NOT comment obvious code: `const name = getName();` needs no explanation

**JSDoc/TSDoc:**
- Used for public APIs and exported functions
- Documents parameters, return types, and example usage
- Example: Function exports in `@diamond/shared` include doc blocks with `@example` sections
- Non-exported internal functions may omit JSDoc

**Inline Comments:**
- Sparse — prefer clear naming and structure
- When used, explain "why", not "what": "Truncate stack to first 5 frames to avoid exceeding Azure log size limits"

## Function Design

**Size:**
- Functions generally under 40 lines; longer functions broken into named helper functions
- Middleware functions nested in route handlers for clarity
- Core business logic (heatmap, pricing, consolidation) extracted to pure functions

**Parameters:**
- Typed parameters required in TypeScript files
- Optional parameters use `?:` syntax, not function overloads
- Pass options objects for 3+ parameters: `{ timeoutMs, intervalMs, label }`
- Destructure objects from parameters, not after

**Return Values:**
- Explicit `Promise<T>` return type on all async functions
- No implicit `Promise<void>` — always declare return type
- Functions that don't return use `void` (not `Promise<void>` for sync, `Promise<void>` for async)

## Module Design

**Exports:**
- Use ESM `export` syntax (codebase is `"type": "module"`)
- Named exports preferred: `export function foo()` not `export default foo()`
- Barrel files (`index.ts`) re-export from submodules: `export * from './types.js'`
- Workspace packages define both `main` and `types` in `package.json` exports field

**Barrel Files:**
- Common pattern in `packages/shared/src/types/index.ts` and `packages/shared/src/utils/index.ts`
- Simplify cross-package imports: `import { createLogger } from '@diamond/shared'` instead of `.../src/utils/logger.js`
- Used in `packages/feed-registry`, `packages/database`, `packages/pricing-engine`

**Package Scope:**
- Workspace packages under `@diamond/*` scope (npm workspaces)
- Packages declare internal dependencies via workspace version `*`: `"@diamond/shared": "*"`

## Async/Concurrency

**Patterns:**
- All async operations use `async/await`, no raw Promise chains
- Promise concurrency managed with `Promise.all()` for independent operations
- Sequential operations chain with `await` in loops
- Worker desynchronization via `randomDelay()` between API calls to prevent thundering herd

**Rate Limiting:**
- Integrated via `beforeAttempt` hook in `withRetry()` options
- Proxy-based rate limiter in API with token bucket + FIFO queue
- Per-replica rate limiting; global = `per_replica_limit * num_replicas`

**Timeouts:**
- Set explicitly on all external API calls
- Proxy upstream timeout: 60s; client transport timeout: 65s
- Database query timeouts defined per connection pool configuration

## Transaction Safety

**Database Transactions:**
- Use `transaction()` function from `@diamond/database` for multi-step operations
- Pattern: `const client = await pool.connect()`, `BEGIN`, execute, `COMMIT` or `ROLLBACK`
- Always release client in `finally` block
- Wrapped function receives `client` and executes within transaction

**Idempotency:**
- Worker writes idempotent via `offset` guards in partition progress tracking
- Consolidator marks raw diamonds with status to prevent reprocessing
- Watermark only advances after consolidation completes successfully

## TypeScript

**Configuration:**
- `strict: true` enables all strict type checks
- `isolatedModules: true` prevents cross-module type leakage
- `noImplicitOverride: true` requires explicit `override` keyword on subclass methods
- `declaration: true` generates `.d.ts` files for published packages

**Patterns:**
- Use `Pick<Type, 'field1' | 'field2'>` to require only specific fields
- Use `Omit<Type, 'field1'>` to exclude computed/generated fields from input
- Type parameters constrained when needed: `<T extends QueryResultRow>`
- No `any` type except in test mocks via `ReturnType<typeof vi.fn>()`

## Constants

**Organization:**
- All configurable constants in `packages/shared/src/constants.ts`
- Environment overrides via `parseInt(process.env.X ?? 'default', 10)`
- Related constants grouped with doc comments explaining purpose

**Patterns:**
- Retry/timeout constants tuned per context: `withRetry()` vs `withAuthRetry()`
- Batch sizes tuned for database pool limits: `CONSOLIDATOR_CONCURRENCY <= PG_POOL_MAX`
- Fixed vs. adaptive heatmap scanning parameters: `HEATMAP_DENSE_ZONE_STEP = 50`, `HEATMAP_INITIAL_STEP = 250`

---

*Convention analysis: 2026-02-17*
