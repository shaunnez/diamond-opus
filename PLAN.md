# Sequential Feed Ingestion Plan

## Problem

Running `nivoda-natural` and `nivoda-labgrown` concurrently causes Nivoda's CDN/WAF to
return HTTP 403 errors. The combined request volume from both feeds (up to 20 workers)
triggers Nivoda's abuse detection. The feeds must run sequentially.

## Solution: Chain-trigger (Option B / Option 1)

After natural's consolidation completes and the watermark is advanced, the consolidator
automatically triggers the labgrown scheduler job. Natural runs on a cron as the
recurring heartbeat; labgrown has no cron and relies entirely on the chain.

```
[midnight cron] → natural scheduler
                → natural workers
                → natural consolidator + watermark advance
                → triggers labgrown scheduler   ← new
                → labgrown workers
                → labgrown consolidator + watermark advance
                → (done, wait for next midnight cron)
```

The gap between cycles is controlled by natural's cron period. With ~3h incremental
runs each, total cycle time is ~6h. A cron of every 6h gives minimal headroom; every
12h gives comfortable buffer. TBD with you.

---

## Changes Required

### 1. `apps/consolidator/src/chain.ts` (new file)
Trigger logic: after a feed's watermark is saved, look up `FEED_CHAIN` and fire the
next scheduler job via the Azure Container Apps Jobs API. Same pattern already used in
`packages/api/src/routes/triggers.ts`. No-ops gracefully if not in Azure or no chain
is configured for the completed feed.

### 2. `apps/consolidator/src/index.ts`
In `handleConsolidateMessage`, after `processConsolidation` succeeds, call
`triggerNextFeed(adapter.feedId, runMetadata.runType)`. Fire-and-forget with a warning
log on failure — a chain failure must never fail the consolidation itself.

### 3. `apps/consolidator/package.json`
Add `@azure/arm-appcontainers` and `@azure/identity` dependencies (already present in
the API package, same versions).

### 4. `infrastructure/terraform/modules/container-apps/main.tf`
- Add `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_SCHEDULER_JOB_NAME_PREFIX`
  env vars to the consolidator container (same vars already on the API container).
- Add `consolidator_scheduler_job_operator` role assignment so the consolidator's
  managed identity can trigger scheduler jobs (mirrors the existing
  `api_scheduler_job_operator` assignment).

### 5. `infrastructure/terraform/modules/container-apps/main.tf` + `variables.tf`
Update the `scheduler_feeds` variable and resource to support both trigger types:
- `niv-natural`: `schedule_trigger_config` with a cron (e.g. `0 */6 * * *` or `0 */12 * * *` — TBD)
- `niv-labgrown`: `manual_trigger_config` only — no cron, triggered exclusively by the chain

This requires making `cron_expression` optional in the `scheduler_feeds` variable type
and adding a conditional in the resource to use `manual_trigger_config` when no cron is
provided.

### 6. `infrastructure/terraform/environments/prod/main.tf`
Replace `scheduler_cron_expression` with `scheduler_feeds`:
```hcl
scheduler_feeds = {
  niv-natural  = { cron_expression = "0 */6 * * *", feed = "nivoda-natural" }
  niv-labgrown = { feed = "nivoda-labgrown" }  # no cron_expression = manual only
}
```

---

## What stays the same

- Worker logic: unchanged
- Scheduler logic: unchanged
- Watermark logic: unchanged
- All existing manual trigger endpoints in the dashboard: still work
- If the chain fails for any reason, labgrown can be triggered manually from the
  dashboard as today

# Ignore this
https://diamond-prod-dashboard.thankfulforest-9a1d2cd4.australiaeast.azurecontainerapps.io/runs/8b634f9e-83dd-4ebb-b185-e983f72f7b6b
https://diamond-prod-storefront.thankfulforest-9a1d2cd4.australiaeast.azurecontainerapps.io/
