# Implementation Prompt: Slack Integration & Unified Notification System

## Objective

Replace the existing Resend email notification system with Slack webhook-based notifications. Create a unified notification service in `packages/shared` that eliminates code duplication, introduces structured error categories with severity levels, and extends notification coverage to all services (scheduler, API) that currently lack alerts.

---

## Part 1: Create the Slack Notification Service

### 1.1 New file: `packages/shared/src/utils/slack.ts`

Create a Slack notification client that sends messages via incoming webhooks.

**Environment variables (3 webhook URLs for channel routing):**

| Env Var | Purpose | Channel |
|---------|---------|---------|
| `SLACK_WEBHOOK_ERRORS` | Errors and failures | `#diamond-errors` |
| `SLACK_WEBHOOK_PIPELINE` | Pipeline status (run completion, consolidation results) | `#diamond-pipeline` |
| `SLACK_WEBHOOK_OPS` | Operational info (scheduler starts, config changes, repricing jobs) | `#diamond-ops` |

**Requirements:**
- Use native `fetch` (Node 18+) — no Slack SDK dependency needed. Slack incoming webhooks are just POST requests with a JSON body.
- Retry logic: 3 retries with exponential backoff (1s, 2s, 4s) for 5xx and network errors. Do not retry 4xx.
- Rate limiting: serialize sends with minimum 500ms spacing per webhook URL (Slack allows ~1 msg/sec per webhook).
- Fire-and-forget pattern: notifications must NEVER throw or crash the calling service. Wrap everything in try/catch, log failures via the pino logger, and move on.
- Graceful degradation: if webhook URL is not configured for a channel, log a warning once (not per message) and skip.
- Message body truncation: cap at 3000 characters (Slack block limit).
- Format messages using [Slack Block Kit](https://api.slack.com/block-kit) for rich formatting:
  - Header block with title
  - Section block with message body as mrkdwn
  - Context block with: service name, environment (`ENVIRONMENT` env var), timestamp, runId/traceId when available
  - Use color coding via attachment `color` field: `#dc3545` (red) for errors, `#28a745` (green) for success, `#ffc107` (yellow) for warnings, `#17a2b8` (blue) for info

### 1.2 Define notification channels enum

```typescript
export enum NotifyChannel {
  ERRORS = 'errors',     // Maps to SLACK_WEBHOOK_ERRORS
  PIPELINE = 'pipeline', // Maps to SLACK_WEBHOOK_PIPELINE
  OPS = 'ops',           // Maps to SLACK_WEBHOOK_OPS
}
```

### 1.3 Define error/event categories

```typescript
export enum NotifyCategory {
  // Pipeline lifecycle
  SCHEDULER_STARTED = 'scheduler_started',
  SCHEDULER_FAILED = 'scheduler_failed',
  RUN_COMPLETED = 'run_completed',
  RUN_PARTIAL_SUCCESS = 'run_partial_success',
  RUN_FAILED = 'run_failed',

  // Consolidation
  CONSOLIDATION_COMPLETED = 'consolidation_completed',
  CONSOLIDATION_SKIPPED = 'consolidation_skipped',
  CONSOLIDATION_FAILED = 'consolidation_failed',

  // Worker
  WORKER_ERROR = 'worker_error',

  // API
  API_ERROR = 'api_error',
  AUTH_FAILURE = 'auth_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',

  // Repricing
  REPRICING_COMPLETED = 'repricing_completed',
  REPRICING_FAILED = 'repricing_failed',

  // Infrastructure
  DATABASE_ERROR = 'database_error',
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
}
```

### 1.4 Category-to-channel mapping

Create a mapping that routes each `NotifyCategory` to the correct `NotifyChannel`:

- `ERRORS`: `SCHEDULER_FAILED`, `RUN_FAILED`, `WORKER_ERROR`, `CONSOLIDATION_FAILED`, `API_ERROR`, `AUTH_FAILURE`, `DATABASE_ERROR`, `EXTERNAL_SERVICE_ERROR`
- `PIPELINE`: `RUN_COMPLETED`, `RUN_PARTIAL_SUCCESS`, `CONSOLIDATION_COMPLETED`, `CONSOLIDATION_SKIPPED`
- `OPS`: `SCHEDULER_STARTED`, `RATE_LIMIT_EXCEEDED`, `REPRICING_COMPLETED`, `REPRICING_FAILED`

### 1.5 Unified `notify()` function

```typescript
export interface NotifyOptions {
  category: NotifyCategory;
  title: string;
  message: string;
  /** Optional structured context (runId, traceId, feed, etc.) displayed in the context block */
  context?: Record<string, string>;
  /** Optional error object for stack trace inclusion */
  error?: Error | unknown;
}

export async function notify(options: NotifyOptions): Promise<void>;
```

This function:
1. Looks up the channel from the category-to-channel mapping
2. Determines color from category (error categories → red, success → green, partial/skip → yellow, info → blue)
3. Formats the Slack Block Kit payload
4. Sends via the appropriate webhook URL
5. Logs success/failure via logger (never throws)

### 1.6 Export from `packages/shared`

Export `notify`, `NotifyChannel`, `NotifyCategory`, and `NotifyOptions` from `packages/shared/src/utils/index.ts` and `packages/shared/src/index.ts`.

---

## Part 2: Integrate `notify()` into the `safeLogError` Flow

### 2.1 Extend `safeLogError` in `packages/shared/src/utils/logger.ts`

Modify `safeLogError` to also call `notify()` after persisting to the database. This ensures every error that hits the error_logs table also gets a Slack notification automatically.

```typescript
export function safeLogError(
  persistFn: (...) => Promise<void>,
  service: string,
  error: unknown,
  context?: Record<string, unknown>,
  logger?: Logger,
): void {
  // ... existing DB persist logic ...

  // NEW: also send Slack notification for errors
  notify({
    category: NotifyCategory.DATABASE_ERROR, // or derive from service name
    title: `${service} error`,
    message: error instanceof Error ? error.message : String(error),
    context: context ? Object.fromEntries(
      Object.entries(context).map(([k, v]) => [k, String(v)])
    ) : undefined,
    error,
  }).catch(() => {}); // fire-and-forget
}
```

**Important nuance:** The category should NOT always be `DATABASE_ERROR`. Instead, accept an optional `category` parameter on `safeLogError` so callers can specify the appropriate category. Default to a general error category derived from the service name:
- `'scheduler'` → `NotifyCategory.SCHEDULER_FAILED`
- `'worker'` → `NotifyCategory.WORKER_ERROR`
- `'consolidator'` → `NotifyCategory.CONSOLIDATION_FAILED`
- `'api'` → `NotifyCategory.API_ERROR`
- fallback → `NotifyCategory.API_ERROR`

---

## Part 3: Remove Resend Email System

### 3.1 Delete email-specific files

- Delete `apps/worker/src/alerts.ts`
- Delete `apps/consolidator/src/alerts.ts`
- Delete `packages/api/src/services/reapply-emails.ts`

### 3.2 Remove `resend` dependency

- Remove `resend` from `package.json` in all workspaces where it appears (check `apps/worker/package.json`, `apps/consolidator/package.json`, `packages/api/package.json`).
- Run `npm install` to clean up the lockfile.

### 3.3 Remove email-related env vars from documentation and code

Remove references to `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` from:
- Code that reads these env vars
- `CLAUDE.md` documentation
- Any `.env.example` files

**Do NOT remove `DASHBOARD_URL`** — it's still useful for Slack message links.

---

## Part 4: Replace All `sendAlert()` Calls with `notify()`

### 4.1 Worker (`apps/worker/src/index.ts`)

Replace each `sendAlert()` call:

| Current | New |
|---------|-----|
| `sendAlert('Run Completed', ...)` | `notify({ category: NotifyCategory.RUN_COMPLETED, title: 'Run Completed', message: ..., context: { runId, feed, workers, ... } })` |
| `sendAlert('Run Completed (Partial Success)', ...)` | `notify({ category: NotifyCategory.RUN_PARTIAL_SUCCESS, title: 'Run Completed (Partial)', message: ..., context: { runId, feed, successRate, ... } })` |
| `sendAlert('Run Failed', ...)` | `notify({ category: NotifyCategory.RUN_FAILED, title: 'Run Failed', message: ..., context: { runId, feed, ... } })` |

Update imports: remove `sendAlert` from `./alerts`, add `notify, NotifyCategory` from `@diamond/shared`.

### 4.2 Consolidator (`apps/consolidator/src/index.ts`)

Replace each `sendAlert()` call:

| Current | New |
|---------|-----|
| `sendAlert('Consolidation Completed', ...)` | `notify({ category: NotifyCategory.CONSOLIDATION_COMPLETED, title: 'Consolidation Completed', message: ..., context: { runId, feed, processed, errors, ... } })` |
| `sendAlert('Consolidation Skipped', ...)` | `notify({ category: NotifyCategory.CONSOLIDATION_SKIPPED, title: 'Consolidation Skipped', message: ..., context: { runId, feed, ... } })` |
| `sendAlert('Consolidation Failed', ...)` | `notify({ category: NotifyCategory.CONSOLIDATION_FAILED, title: 'Consolidation Failed', message: ..., context: { runId, feed, ... }, error })` |

Update imports: remove `sendAlert` from `./alerts`, add `notify, NotifyCategory` from `@diamond/shared`.

### 4.3 API Repricing (`packages/api/src/routes/pricing-rules.ts`)

Replace `sendReapplyJobEmail()` calls with `notify()`:

| Current | New |
|---------|-----|
| `sendReapplyJobEmail({ status: 'completed', ... })` | `notify({ category: NotifyCategory.REPRICING_COMPLETED, title: 'Repricing Job Completed', message: <formatted stats>, context: { jobId, totalDiamonds, updated, duration, ... } })` |
| `sendReapplyJobEmail({ status: 'failed', ... })` | `notify({ category: NotifyCategory.REPRICING_FAILED, title: 'Repricing Job Failed', message: <error details>, context: { jobId, ... }, error })` |

Preserve the `formatDuration` helper — move it to `packages/shared/src/utils/format.ts` if it doesn't already exist there (check first), since it's useful for Slack messages too.

---

## Part 5: Add New Notification Coverage

These services currently have NO alert notifications. Add them.

### 5.1 Scheduler (`apps/scheduler/src/index.ts`)

Add these notifications:

1. **Run started** (after heatmap partitioning succeeds):
   ```typescript
   notify({
     category: NotifyCategory.SCHEDULER_STARTED,
     title: 'Pipeline Run Started',
     message: `Feed: ${feed}, Run type: ${runType}, Workers: ${partitions.length}`,
     context: { runId, traceId, feed, runType },
   });
   ```

2. **Scheduler failed** (in the catch block, alongside existing `safeLogError`):
   ```typescript
   notify({
     category: NotifyCategory.SCHEDULER_FAILED,
     title: 'Scheduler Failed',
     message: error instanceof Error ? error.message : String(error),
     context: { feed },
     error,
   });
   ```

### 5.2 API Error Handler (`packages/api/src/middleware/error-handler.ts`)

Add notification for 5xx errors (not 4xx — those are client errors):

```typescript
if (statusCode >= 500) {
  notify({
    category: NotifyCategory.API_ERROR,
    title: 'API Server Error',
    message: err.message,
    context: { method: req.method, path: req.url, statusCode: String(statusCode) },
    error: err,
  }).catch(() => {});
}
```

**Rate-limit these notifications** to prevent flooding during cascading failures: track a counter and only send 1 notification per 60 seconds for the same error message. A simple in-memory map with `errorMessage → lastNotifiedAt` works fine. Clear entries older than 5 minutes periodically.

### 5.3 API Auth Failures (`packages/api/src/middleware/auth.ts`)

Add notification for repeated auth failures (potential security concern). Do NOT notify on every single 401 — instead, track failures per IP or client ID and notify when a threshold is exceeded (e.g., 10 failures in 5 minutes from the same source):

```typescript
notify({
  category: NotifyCategory.AUTH_FAILURE,
  title: 'Repeated Auth Failures',
  message: `${count} failed auth attempts from ${source} in the last 5 minutes`,
  context: { source, count: String(count) },
});
```

### 5.4 Rate Limiter (`packages/api/src/middleware/rateLimiter.ts`)

Add notification when Nivoda proxy rate limiting kicks in frequently (e.g., more than 10 requests queued or rejected in a minute):

```typescript
notify({
  category: NotifyCategory.RATE_LIMIT_EXCEEDED,
  title: 'Rate Limit Pressure',
  message: `${queuedCount} requests queued, ${rejectedCount} rejected in the last minute`,
  context: { queuedCount: String(queuedCount), rejectedCount: String(rejectedCount) },
});
```

### 5.5 Database Connection Errors (`packages/database/src/client.ts`)

Add notification when the database pool emits an error event:

```typescript
pool.on('error', (err) => {
  notify({
    category: NotifyCategory.DATABASE_ERROR,
    title: 'Database Pool Error',
    message: err.message,
    error: err,
  }).catch(() => {});
});
```

### 5.6 Currency Service Errors (`packages/api/src/services/currency.ts`)

This file already sends email alerts for currency fetch failures. Replace the email send with:

```typescript
notify({
  category: NotifyCategory.EXTERNAL_SERVICE_ERROR,
  title: 'Currency Rate Fetch Failed',
  message: `Failed to fetch exchange rate: ${error.message}`,
  context: { service: 'currency' },
  error,
});
```

---

## Part 6: Update Documentation

### 6.1 Update `CLAUDE.md`

- Remove all references to Resend, `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`
- Add Slack webhook env vars to the environment variables section:
  ```
  SLACK_WEBHOOK_ERRORS    # Slack incoming webhook for error notifications
  SLACK_WEBHOOK_PIPELINE  # Slack incoming webhook for pipeline status (run/consolidation results)
  SLACK_WEBHOOK_OPS       # Slack incoming webhook for operational info (scheduler, repricing, rate limits)
  ```
- Update the "Key Files" section to include `packages/shared/src/utils/slack.ts`
- Update notification flow diagram to reflect Slack instead of email

### 6.2 Update `.env.example` (if it exists)

Replace email env vars with Slack webhook URLs.

---

## Part 7: Testing

### 7.1 Unit tests for the Slack client (`packages/shared`)

Create `packages/shared/src/utils/__tests__/slack.test.ts`:

- Test `notify()` sends correct payload to correct webhook URL based on category
- Test retry logic (mock fetch to fail then succeed)
- Test graceful degradation when webhook URL not configured (should log warning, not throw)
- Test message truncation at 3000 chars
- Test fire-and-forget behavior (never throws)
- Test rate limiting (sends are serialized with minimum spacing)
- Test Block Kit payload structure (correct blocks, colors, context fields)

### 7.2 Update existing tests

- Update any tests that mock or reference `sendAlert` or `sendReapplyJobEmail` to use `notify` instead
- Search for test files with `grep -r "sendAlert\|sendReapplyJobEmail\|alerts" --include="*.test.*"` and update

---

## Part 8: Build Verification

After all changes:

1. Run `npm run build` — must pass with no errors
2. Run `npm run typecheck` — must pass with no type errors
3. Run `npm run test` — all tests must pass
4. Run `npm run lint` — must pass

---

## Implementation Order

1. Create `packages/shared/src/utils/slack.ts` with types, channel mapping, and `notify()` function
2. Export from shared package
3. Extend `safeLogError` to accept optional category and call `notify()`
4. Replace `sendAlert()` calls in worker and consolidator with `notify()`
5. Replace `sendReapplyJobEmail()` calls in API with `notify()`
6. Add new coverage (scheduler, API error handler, auth, rate limiter, database, currency)
7. Delete old Resend files and remove `resend` dependency
8. Write unit tests for the Slack client
9. Update documentation (CLAUDE.md, .env.example)
10. Build + typecheck + test + lint

---

## Files to Create

- `packages/shared/src/utils/slack.ts`
- `packages/shared/src/utils/__tests__/slack.test.ts`

## Files to Modify

- `packages/shared/src/utils/logger.ts` (extend `safeLogError`)
- `packages/shared/src/utils/index.ts` (export slack module)
- `packages/shared/src/index.ts` (export slack module)
- `apps/worker/src/index.ts` (replace `sendAlert` → `notify`)
- `apps/consolidator/src/index.ts` (replace `sendAlert` → `notify`)
- `apps/scheduler/src/index.ts` (add new notifications)
- `packages/api/src/routes/pricing-rules.ts` (replace `sendReapplyJobEmail` → `notify`)
- `packages/api/src/middleware/error-handler.ts` (add 5xx notifications)
- `packages/api/src/middleware/auth.ts` (add repeated auth failure notifications)
- `packages/api/src/middleware/rateLimiter.ts` (add rate limit pressure notifications)
- `packages/api/src/services/currency.ts` (replace email alert → `notify`)
- `packages/database/src/client.ts` (add pool error notification)
- `CLAUDE.md` (update docs)

## Files to Delete

- `apps/worker/src/alerts.ts`
- `apps/consolidator/src/alerts.ts`
- `packages/api/src/services/reapply-emails.ts`

## Dependencies to Remove

- `resend` from all workspace `package.json` files where it appears
