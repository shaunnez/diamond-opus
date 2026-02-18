# Phase 2: Authentication Simplification - Research

**Researched:** 2026-02-19
**Domain:** Express middleware, authentication, codebase cleanup
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | HMAC authentication removed from API middleware | `packages/api/src/middleware/auth.ts` — entire HMAC block (lines 47–143) removed, `validateHmacSignature`, `getHmacSecrets`, HMAC import block, and module-level `cachedHmacSecrets` state all removed |
| AUTH-02 | API key-only authentication enforced on all endpoints | The existing `validateApiKey` function and `authMiddleware` API-key path are retained; the HMAC fallback branch is deleted; all 7 protected route groups in `packages/api/src/routes/index.ts` already apply `authMiddleware` — no route changes required |
| AUTH-03 | HMAC-related code and dependencies removed from codebase | HMAC touches: `packages/api/src/middleware/auth.ts` (primary), `packages/api/__tests__/auth.test.ts`, `packages/api/__tests__/routes.integration.test.ts`, `tests/local/helpers.ts`, `packages/api/src/routes/system.ts` (swagger comment), `packages/api/src/swagger/generator.ts` (description text), `packages/shared/src/constants.ts` (`HMAC_TIMESTAMP_TOLERANCE_SECONDS`), `packages/shared/src/utils/hash.ts` (`hmacSha256`), `docs/DIAMOND_OPUS.md`, `.env.example` |
| AUTH-04 | API documentation updated to reflect API key-only auth | Swagger generator (`generator.ts`) updates `ApiKeyAuth` description, removes HMAC mention; `system.ts` OpenAPI comment updated; `docs/DIAMOND_OPUS.md` section 7 (Authentication) rewritten; `.env.example` `HMAC_SECRETS` entry removed |
</phase_requirements>

---

## Summary

Phase 2 simplifies authentication from a dual system (API key + HMAC fallback) to API key-only. The change is highly localized: the primary target is a single 170-line middleware file (`packages/api/src/middleware/auth.ts`), with secondary cleanup across tests, docs, shared constants, and one route OpenAPI comment.

The ingestion proxy (`apps/ingestion-proxy`) uses its own completely separate auth middleware (`apps/ingestion-proxy/src/middleware/auth.ts`) based on `INTERNAL_SERVICE_TOKEN` header comparison. This is NOT the same as the main API auth and must not be touched.

The `captureRawBody` function is exported from `auth.ts` but is NOT used anywhere outside that file — it was needed for HMAC body hashing. However, `server.ts` already captures raw body via Express's `json()` verify callback. The `captureRawBody` export can be removed entirely.

**Primary recommendation:** Delete all HMAC code from `auth.ts`, update the six secondary files for test/doc/constant consistency, and verify typechecks pass. No route wiring changes are needed.

---

## Standard Stack

This phase involves no new libraries. It is a pure deletion/simplification within the existing stack.

### Existing auth infrastructure being simplified

| Component | File | Keep? | Notes |
|-----------|------|-------|-------|
| `validateApiKey` | `packages/api/src/middleware/auth.ts` | YES | Core of simplified auth |
| `trackAuthFailure` + Slack notify | `packages/api/src/middleware/auth.ts` | YES | Security monitoring preserved |
| `authMiddleware` | `packages/api/src/middleware/auth.ts` | YES (simplified) | Drop HMAC branch |
| `captureRawBody` | `packages/api/src/middleware/auth.ts` | NO | HMAC-specific, unused elsewhere |
| `validateHmacSignature` | `packages/api/src/middleware/auth.ts` | NO | Removed |
| `getHmacSecrets` / `cachedHmacSecrets` | `packages/api/src/middleware/auth.ts` | NO | Removed |
| `HmacSecrets` interface | `packages/api/src/middleware/auth.ts` | NO | Removed |
| `hmacSha256` | `packages/shared/src/utils/hash.ts` | NO | Only used by auth.ts HMAC code |
| `HMAC_TIMESTAMP_TOLERANCE_SECONDS` | `packages/shared/src/constants.ts` | NO | Only used by auth.ts |
| `nivodaProxyAuth` | `apps/ingestion-proxy/src/middleware/auth.ts` | YES — untouched | Separate service, separate auth |

---

## Architecture Patterns

### How auth middleware is wired (current and future state)

Auth is applied at the router level in `packages/api/src/routes/index.ts`. All 7 protected route groups already use `authMiddleware` as router-level middleware. No per-route changes are needed.

```typescript
// packages/api/src/routes/index.ts — UNCHANGED by this phase
router.use('/api/v2/diamonds', authMiddleware, diamondsRouter);
router.use('/api/v2/analytics', authMiddleware, analyticsRouter);
router.use('/api/v2/triggers', authMiddleware, triggersRouter);
router.use('/api/v2/heatmap', authMiddleware, heatmapRouter);
router.use('/api/v2/pricing-rules', authMiddleware, pricingRulesRouter);
router.use('/api/v2/rating-rules', authMiddleware, ratingRulesRouter);
router.use('/api/v2/system', authMiddleware, systemRouter);

// /health route remains unprotected — correct
router.use('/health', healthRouter);
```

### Simplified auth.ts (target state)

```typescript
import type { Request, Response, NextFunction } from "express";
import {
  sha256,
  notify,
  NotifyCategory,
} from "@diamond/shared";
import { getApiKeyByHash, updateApiKeyLastUsed } from "@diamond/database";

// Track repeated auth failures per source IP
const AUTH_FAILURE_THRESHOLD = 10;
const AUTH_FAILURE_WINDOW_MS = 5 * 60_000;

interface FailureRecord {
  count: number;
  windowStart: number;
  notified: boolean;
}

const authFailures = new Map<string, FailureRecord>();

function trackAuthFailure(source: string): void {
  // ... unchanged
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  const keyHash = sha256(apiKey);
  const apiKeyRecord = await getApiKeyByHash(keyHash);
  if (apiKeyRecord) {
    updateApiKeyLastUsed(apiKeyRecord.id).catch(() => {});
    return true;
  }
  return false;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (apiKey) {
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      next();
      return;
    }
  }

  const source = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  trackAuthFailure(source);
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key",
    },
  });
}
```

Note: `rawBody` type augmentation on `Request` in `server.ts` (`req.rawBody?: string`) can be kept as-is — it lives in the global Express namespace declaration there and does not require HMAC to exist.

### Anti-Patterns to Avoid

- **Do not remove `rawBody` capture in `server.ts`**: The `json()` verify callback that captures `rawBody` in `server.ts` should stay — it's a general pattern. Only the HMAC-specific code in `auth.ts` that _uses_ `rawBody` is removed.
- **Do not touch ingestion proxy auth**: `apps/ingestion-proxy/src/middleware/auth.ts` is completely separate. Its `nivodaProxyAuth` function uses `INTERNAL_SERVICE_TOKEN`, not HMAC.
- **Do not remove `sha256` from shared**: `sha256` is used by the API key validation path (`validateApiKey` calls `sha256(apiKey)`). Only `hmacSha256` is HMAC-specific.
- **Do not remove `secureCompare` without checking**: `secureCompare` in `hash.ts` is used only by HMAC signature comparison in `auth.ts`. Can be removed from `hash.ts` unless used elsewhere. Verify before deleting.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timing-safe comparison | Custom loop | `crypto.timingSafeEqual` (already used) | Prevents timing attacks |
| API key hashing | Custom hash | `sha256` from `@diamond/shared` (already used) | Already tested and consistent |

---

## Common Pitfalls

### Pitfall 1: Breaking the ingestion proxy auth

**What goes wrong:** Developer sees `nivodaProxyAuth` referenced in CLAUDE.md under "HMAC" context and deletes it.
**Why it happens:** The proxy auth uses header `x-internal-token` and `INTERNAL_SERVICE_TOKEN` env var — it is NOT HMAC and is completely separate from the main API auth.
**How to avoid:** The proxy auth file is at `apps/ingestion-proxy/src/middleware/auth.ts`. The main API auth file is at `packages/api/src/middleware/auth.ts`. Different packages, different files, different auth mechanisms.
**Warning signs:** If `apps/ingestion-proxy` stops working or 403s appear in proxy logs.

### Pitfall 2: TypeScript error from unused imports

**What goes wrong:** After removing HMAC code, the import of `hmacSha256`, `secureCompare`, `parseJsonEnv`, and `HMAC_TIMESTAMP_TOLERANCE_SECONDS` in `auth.ts` becomes unused — TypeScript strict mode will error.
**How to avoid:** Remove those specific symbols from the import statement. The remaining imports (`sha256`, `notify`, `NotifyCategory`) are still used.

### Pitfall 3: Test file references HMAC_SECRETS env var in beforeEach

**What goes wrong:** `packages/api/__tests__/auth.test.ts` sets `process.env['HMAC_SECRETS']` in `beforeEach`. `packages/api/__tests__/routes.integration.test.ts` also sets it in `beforeEach`/deletes in `afterEach`. If these are left after removing HMAC code, tests still pass but are testing dead code — or worse, referencing undefined behavior.
**How to avoid:** Remove HMAC test cases from `auth.test.ts` entirely (the `describe('HMAC Authentication', ...)` block, lines 73–160). Remove `HMAC_SECRETS` setup/teardown from `routes.integration.test.ts` (lines 56–75).

### Pitfall 4: `secureCompare` and `hmacSha256` used elsewhere

**What goes wrong:** Assuming `secureCompare` and `hmacSha256` are only used in `auth.ts` and deleting them from `hash.ts`, but another file imports them.
**How to avoid:** Run `grep -r "secureCompare\|hmacSha256" packages/ apps/` before deleting from `hash.ts`. Based on current research, `hmacSha256` is only imported in `packages/api/__tests__/auth.test.ts` (test file also being updated) and `packages/api/src/middleware/auth.ts`. `secureCompare` is only in `packages/api/src/middleware/auth.ts`. Both can be safely removed from `hash.ts`.

### Pitfall 5: E2E test helpers use HMAC for all API calls

**What goes wrong:** `tests/local/helpers.ts` defines `makeHmacHeaders`, `apiGet`, and `apiPost` functions that use HMAC auth for all API requests. These will stop working once HMAC is removed.
**How to avoid:** Update `tests/local/helpers.ts` to use API key auth instead. The `apiGet` and `apiPost` functions should send `X-API-Key` header using `process.env.API_KEY`. The `makeHmacHeaders` function and its supporting local `sha256`/`hmacSha256` functions should be removed.

### Pitfall 6: `captureRawBody` exported from middleware index

**What goes wrong:** `captureRawBody` is exported from `auth.ts` but the `middleware/index.ts` re-exports everything via `export * from './auth.js'`. If `captureRawBody` is removed from `auth.ts`, any code that imports it from `@diamond/api/middleware` will break.
**How to avoid:** Verify no external files import `captureRawBody`. Based on research: it is defined only in `auth.ts` and not imported anywhere else (confirmed via grep). Safe to delete.

### Pitfall 7: Swagger/OpenAPI still references HMACAuth security scheme

**What goes wrong:** `packages/api/src/routes/system.ts` has an OpenAPI comment `- HMACAuth: []` in the security array. Leaving this after removing HMAC causes documentation inconsistency (and will reference a non-existent scheme).
**How to avoid:** Update the `@openapi` comment in `system.ts` to remove `- HMACAuth: []`. Only keep `- ApiKeyAuth: []`.

---

## Code Examples

### Simplified authMiddleware (target state)

```typescript
// packages/api/src/middleware/auth.ts — after simplification
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (apiKey) {
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      next();
      return;
    }
  }

  const source = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  trackAuthFailure(source);
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key",
    },
  });
}
```

### Simplified imports in auth.ts

```typescript
// BEFORE
import {
  sha256,
  hmacSha256,
  secureCompare,
  parseJsonEnv,
  HMAC_TIMESTAMP_TOLERANCE_SECONDS,
  notify,
  NotifyCategory,
} from "@diamond/shared";

// AFTER
import {
  sha256,
  notify,
  NotifyCategory,
} from "@diamond/shared";
```

### Updated test file structure (auth.test.ts)

```typescript
// packages/api/__tests__/auth.test.ts — after simplification
// Remove: import { sha256, hmacSha256 } from '@diamond/shared'
// Keep: import { sha256 } from '@diamond/shared' — NOT needed either since
//        tests no longer need to hash anything directly. Can drop the import entirely
//        if only test-internal sha256 calls remain.

// Remove entire: describe('HMAC Authentication', () => { ... })
// Remove: process.env['HMAC_SECRETS'] setup in beforeEach
// Keep: describe('API Key Authentication', ...) block — unchanged
// Keep: describe('No Authentication', ...) block — unchanged
```

### Updated local test helper

```typescript
// tests/local/helpers.ts — replace HMAC-based API calls with API key
export function makeApiKeyHeaders(): Record<string, string> {
  const apiKey = process.env.API_KEY ?? 'local-test-api-key';
  return {
    'x-api-key': apiKey,
    'content-type': 'application/json',
  };
}

export async function apiGet(path: string): Promise<Response> {
  return fetch(`${API_BASE()}${path}`, {
    method: 'GET',
    headers: makeApiKeyHeaders(),
  });
}

export async function apiPost(path: string, body: unknown = {}): Promise<Response> {
  return fetch(`${API_BASE()}${path}`, {
    method: 'POST',
    headers: makeApiKeyHeaders(),
    body: JSON.stringify(body),
  });
}
```

### Updated swagger generator (auth section only)

```typescript
// packages/api/src/swagger/generator.ts — simplified securitySchemes
components: {
  securitySchemes: {
    ApiKeyAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
      description: 'API key for authentication. Pass the raw key value in the X-API-Key header.',
    }
  },
},
```

### Updated DIAMOND_OPUS.md section 7 (Authentication)

```markdown
### Authentication

API key authentication (checked first):

1. **API Key Auth**: `X-API-Key` header → SHA256 hash against `api_keys` table
2. Missing or invalid key → 401 Unauthorized
```

---

## Full Inventory of Files to Change

| File | Change Type | What Changes |
|------|-------------|--------------|
| `packages/api/src/middleware/auth.ts` | Simplify | Remove HMAC blocks, `captureRawBody`, reduce imports |
| `packages/shared/src/utils/hash.ts` | Delete exports | Remove `hmacSha256`, `secureCompare` |
| `packages/shared/src/constants.ts` | Delete constant | Remove `HMAC_TIMESTAMP_TOLERANCE_SECONDS` |
| `packages/api/__tests__/auth.test.ts` | Update tests | Remove HMAC describe block, remove HMAC_SECRETS env setup |
| `packages/api/__tests__/routes.integration.test.ts` | Update tests | Remove HMAC_SECRETS env setup/teardown |
| `tests/local/helpers.ts` | Rewrite auth helpers | Replace HMAC-based `apiGet`/`apiPost` with API key headers |
| `packages/api/src/routes/system.ts` | Update OpenAPI comment | Remove `- HMACAuth: []` from security array |
| `packages/api/src/swagger/generator.ts` | Update description | Remove HMAC mention from `ApiKeyAuth` description |
| `docs/DIAMOND_OPUS.md` | Update docs | Rewrite section 7 Authentication, section 14 env vars (remove HMAC_SECRETS), feature list |
| `.env.example` | Update docs | Remove `HMAC_SECRETS` entry |

**Files explicitly NOT changed:**
- `apps/ingestion-proxy/src/middleware/auth.ts` — separate service, keep as-is
- `apps/ingestion-proxy/src/routes/proxy.ts` — uses `nivodaProxyAuth`, keep as-is
- `packages/api/src/routes/index.ts` — no auth wiring changes needed
- `packages/api/src/server.ts` — `rawBody` capture in `json()` verify stays
- All other route files — no per-route auth changes needed

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Dual auth (API key OR HMAC fallback) | API key only | Simpler mental model, less attack surface, fewer env vars required |
| `captureRawBody` middleware for HMAC body hashing | Not needed | Body capture already done by Express `json()` verify for other purposes |
| `HMAC_SECRETS` env var required for API | Not required | One fewer required env var in deployment |

---

## Open Questions

1. **Are there any external callers currently using HMAC auth in production?**
   - What we know: HMAC support exists and `HMAC_SECRETS` is in `.env.example`. The local e2e helpers use HMAC for all API calls.
   - What's unclear: Whether any real production client uses HMAC (vs API key).
   - Recommendation: Prior decision was to remove HMAC — treat this as a known migration. The planner should note that local e2e test helpers (`tests/local/helpers.ts`) need updating to use API key auth instead. Coordinate with `API_KEY` env var availability in test environment.

2. **Should `secureCompare` be kept in `hash.ts` for future use?**
   - What we know: Currently only used by HMAC signature comparison in `auth.ts`. The ingestion proxy's `nivodaProxyAuth` uses `crypto.timingSafeEqual` directly, not `secureCompare`.
   - What's unclear: Whether any future feature would need it.
   - Recommendation: Remove it as part of this cleanup (consistent with "remove HMAC code and dependencies"). It's a one-line function that can be re-added trivially if needed.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `packages/api/src/middleware/auth.ts` — full understanding of HMAC and API key branches
- Direct code inspection of `packages/api/src/routes/index.ts` — confirmed route wiring
- Direct code inspection of `apps/ingestion-proxy/src/middleware/auth.ts` — confirmed separate auth system
- Direct code inspection of `packages/shared/src/utils/hash.ts` — confirmed `hmacSha256` and `secureCompare` exports
- Direct code inspection of `packages/shared/src/constants.ts` — confirmed `HMAC_TIMESTAMP_TOLERANCE_SECONDS`
- Direct code inspection of `packages/api/__tests__/auth.test.ts` — full HMAC test coverage mapped
- Direct code inspection of `packages/api/__tests__/routes.integration.test.ts` — HMAC_SECRETS env setup found
- Direct code inspection of `tests/local/helpers.ts` — HMAC-based API client found
- Direct code inspection of `packages/api/src/routes/system.ts` — HMACAuth swagger comment found
- Direct code inspection of `packages/api/src/swagger/generator.ts` — HMAC description in ApiKeyAuth found
- Grep across all TypeScript files for `captureRawBody` — confirmed zero external consumers

---

## Metadata

**Confidence breakdown:**
- File inventory: HIGH — confirmed by direct file reading and grep
- What to delete: HIGH — all HMAC usages traced via grep
- What to keep: HIGH — ingestion proxy auth clearly separate, verified by file inspection
- Test update scope: HIGH — both test files inspected, HMAC sections identified
- Local e2e helper impact: HIGH — HMAC-based `apiGet`/`apiPost` confirmed, API_KEY env var substitution is straightforward

**Research date:** 2026-02-19
**Valid until:** 2026-03-20 (stable codebase, 30-day window)
