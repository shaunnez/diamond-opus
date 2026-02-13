# Diamond Opus - Technical Documentation

> **This file was manually curated by Claude Code.** To regenerate it, ask Claude Code to
> "review and regenerate docs/DIAMOND_OPUS.md from the package READMEs".
>
> For the auto-generated full concatenation of all READMEs, run `npm run docs:generate`
> (outputs to `DIAMOND_OPUS_FULL.md`).

---

## 1. Overview

Diamond Opus is a production-ready TypeScript monorepo for ingesting, consolidating, pricing, and serving diamond inventory from Nivoda. It implements a two-stage data pipeline that:

1. **Ingests** diamond inventory from the Nivoda GraphQL API
2. **Applies** configurable pricing rules and markup calculations
3. **Serves** the consolidated inventory via a REST API with dual authentication
4. **Manages** operations via a React admin dashboard

---

## 2. Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────▶│ Service Bus │────▶│   Workers   │
│  (2 AM UTC) │     │  (Azure)    │     │  (1-10)     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                      │
       │ watermark                           │ raw data
       ▼                                      ▼
┌─────────────┐                         ┌─────────────┐
│Azure Storage│                         │ Supabase    │
│ (blob)      │                         │ PostgreSQL  │
└─────────────┘                         └─────────────┘
                                              │
                    ┌─────────────┐     ┌─────────────┐
                    │  diamonds   │◀────│ Consolidator│
                    │  (priced)   │     │             │
                    └─────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    │           │
              ┌─────▼───┐ ┌────▼──────┐
              │REST API │ │ Dashboard │
              │  :3000  │ │   :5173   │
              └─────────┘ └───────────┘
```

### Key Features

- **Heatmap-based partitioning**: Adaptive price-range partitioning ensures balanced workload distribution
- **Continuation pattern**: Workers process one page per message for reliability (no lock expiry)
- **Failure-tolerant**: Worker failures prevent consolidation and watermark advancement
- **Incremental sync**: Watermark tracks last successful sync for efficient updates
- **Rule-based pricing**: Database-driven pricing rules with priority-based matching
- **Dual authentication**: API Key and HMAC signature support
- **Azure-native**: Service Bus queues, Blob Storage, Container Apps

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES modules) |
| Runtime | Node.js 20 |
| Database | PostgreSQL (Supabase) |
| Queue | Azure Service Bus |
| Storage | Azure Blob Storage |
| Compute | Azure Container Apps |
| Registry | Azure Container Registry |
| IaC | Terraform 1.6 |
| CI/CD | GitHub Actions |
| API | Express + Swagger |
| Dashboard | React + Vite + Tailwind |
| Logging | Pino + Azure Log Analytics |
| Alerts | Resend (email) |

---

## 3. Project Structure

```
diamond-opus/
├── packages/                    # Shared libraries
│   ├── shared/                 # Types, utilities, constants, logging
│   ├── database/               # PostgreSQL client and queries
│   ├── nivoda/                 # Nivoda GraphQL adapter and mapper
│   ├── pricing-engine/         # Rule-based pricing logic
│   └── api/                    # Express REST API
├── apps/                        # Runnable applications
│   ├── scheduler/              # Job partitioning (cron)
│   ├── worker/                 # Diamond ingestion (queue consumer)
│   ├── consolidator/           # Data transformation (queue consumer)
│   └── dashboard/              # React admin dashboard (Vite + Tailwind)
├── infrastructure/              # Azure Terraform IaC
│   ├── terraform/modules/      # Reusable modules
│   └── scripts/                # Deployment scripts
├── docker/                      # Multi-stage Dockerfiles
├── sql/                         # Database schema and migrations
├── docs/                        # Additional documentation
└── .github/workflows/           # CI/CD pipelines
```

### Package Dependencies

```
@diamond/shared (types, utils, constants, logging)
    ↓
@diamond/database (pg client, queries)
    ↓
@diamond/nivoda (GraphQL adapter, mapper)
@diamond/pricing-engine (rule matching)
    ↓
@diamond/api (Express routes, middleware)
apps/scheduler, apps/worker, apps/consolidator

@diamond/dashboard (React + Vite, standalone)
```

---

## 4. Two-Stage Pipeline

### Stage 1: Raw Ingestion (Scheduler → Workers)

1. **Scheduler** runs at 2 AM UTC (or manually via dashboard)
2. Reads watermark from Azure Blob Storage
3. Performs **heatmap scan** to analyze Nivoda inventory density by price
4. Partitions workload into price ranges, creating `WorkItemMessage` for each
5. Sends work items to Azure Service Bus `work-items` queue
6. **Workers** consume messages using **continuation pattern** (one page per message)
7. Write raw JSON payloads to `raw_diamonds_nivoda` table via bulk upsert
8. Last successful worker triggers consolidation (atomic counter)

**Run Types:**
- **Full Run**: No watermark, scans $0-$250k, up to 10 workers
- **Incremental Run**: Uses watermark with 15-minute safety buffer, up to 10 workers

### Stage 2: Consolidation

1. **Consolidator** receives `ConsolidateMessage` from Service Bus
2. Validates all workers completed successfully (skips if any failed)
3. Claims raw diamonds using `FOR UPDATE SKIP LOCKED` (multi-replica safe)
4. Batches raw diamonds, maps to canonical schema via `@diamond/nivoda` mapper
5. Applies pricing rules from `pricing_rules` table via `@diamond/pricing-engine`
6. Batch upserts into `diamonds` table (100 per INSERT using UNNEST)
7. **Only on success**: Advances watermark in Azure Blob Storage

### Failure Handling

| Scenario | Behavior |
|----------|----------|
| Worker fails | Skip consolidation, don't advance watermark |
| Consolidator fails | Send alert via Resend, don't advance watermark |
| All workers succeed | Trigger consolidation, advance watermark |

### Worker Continuation Pattern

Workers process exactly **one page per Service Bus message**:

```
[WORK_ITEM offset=0] → Process Page → Enqueue [WORK_ITEM offset=30]
                                            → Process Page → Enqueue [WORK_ITEM offset=60]
                                                                  → ... → Last Page → WORK_DONE
```

Benefits:
- No lock expiry (each message completes in <60s)
- Idempotency via `partition_progress` table
- Database is source of truth for progress
- Graceful crash recovery

---

## 5. Configuration Constants

```typescript
// From packages/shared/src/constants.ts
RECORDS_PER_WORKER = 5000              // Target records per worker
WORKER_PAGE_SIZE = 30                  // Pagination size for Nivoda API
CONSOLIDATOR_BATCH_SIZE = 2000         // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100   // Diamonds per batch INSERT (uses UNNEST)
CONSOLIDATOR_CONCURRENCY = 2           // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
CONSOLIDATOR_CLAIM_TTL_MINUTES = 30    // Stuck claim recovery timeout
NIVODA_MAX_LIMIT = 50                  // Nivoda API max page size
TOKEN_LIFETIME_MS = 6 hours            // Nivoda token validity
HEATMAP_MAX_WORKERS = 10               // Max parallel workers (unified for all run types)
HEATMAP_MIN_RECORDS_PER_WORKER = 1000  // Minimum records to spawn worker
```

---

## 6. Database Schema

All prices stored in **dollars** as DECIMAL(12,2). Soft deletes via `status = 'deleted'` and `deleted_at`.

### Tables

| Table | Purpose |
|-------|---------|
| `api_keys` | API authentication (SHA256 hashed keys) |
| `raw_diamonds_nivoda` | Staging table for raw Nivoda JSON payloads |
| `diamonds` | Canonical inventory with pricing |
| `pricing_rules` | Rule-based pricing configuration |
| `run_metadata` | Batch run tracking |
| `worker_runs` | Per-partition execution tracking |
| `partition_progress` | Continuation pattern progress and idempotency |
| `hold_history` | Diamond hold audit trail |
| `purchase_history` | Purchase audit trail |
| `schema_migrations` | Migration version tracking |

### Key Identity Mapping

```
Nivoda Response:
{
  "id": "abc123",          ← OFFER_ID (use for ordering/holds)
  "diamond": {
    "id": "xyz789"         ← SUPPLIER_STONE_ID (use for tracking/dedup)
  }
}
```

### Counting Rule

**ALWAYS** use `diamonds_by_query_count` for accurate counts. **NEVER** use `total_count` from paginated search results (unreliable).

---

## 7. REST API

### Authentication

Dual auth system (checked in order):

1. **API Key Auth**: `X-API-Key` header → SHA256 hash against `api_keys` table
2. **HMAC Auth**: `X-Client-Id`, `X-Timestamp`, `X-Signature` headers
   - Canonical string: `METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)`
   - Timestamp tolerance: 300 seconds (5 minutes)
3. Neither valid → 401 Unauthorized

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/api/v2/diamonds` | Search diamonds |
| `GET` | `/api/v2/diamonds/:id` | Get single diamond |
| `POST` | `/api/v2/diamonds/:id/hold` | Create hold |
| `POST` | `/api/v2/diamonds/:id/purchase` | Create purchase |
| `POST` | `/api/v2/diamonds/:id/availability` | Update availability |
| `GET` | `/api/v2/analytics/*` | Run analytics and dashboard data |
| `POST` | `/api/v2/triggers/*` | Pipeline trigger endpoints |
| `POST` | `/api/v2/triggers/delete-run` | Delete a failed run and its data |
| `GET/POST` | `/api/v2/pricing-rules` | Pricing rules management |

Swagger UI available at `http://localhost:3000/api-docs`.

---

## 8. Dashboard

The React admin dashboard provides:

- **Pipeline Overview**: Real-time stats on runs, workers, and diamonds
- **Run Management**: View run history, trigger new runs, monitor progress, delete failed runs
- **Consolidation**: Trigger consolidation, view status, force consolidate
- **Worker Retry**: View failed workers, retry individual partitions
- **Diamond Query**: Search and browse the diamond inventory
- **Supplier Analytics**: View supplier performance metrics
- **Pricing Rules**: View and manage pricing rules
- **API Docs**: Embedded Swagger UI for API documentation

Runs on `http://localhost:5173` (Vite dev server) or port 80 (Docker/nginx).

---

## 9. Pricing Engine

Rules are matched in **priority order** (lower number = higher precedence). First matching rule wins.

```sql
-- Example rules
INSERT INTO pricing_rules (priority, shapes, carat_min, lab_grown, markup_ratio, rating)
VALUES (10, ARRAY['ROUND'], 3.0, false, 1.30, 9);  -- Premium large natural rounds

INSERT INTO pricing_rules (priority, lab_grown, markup_ratio, rating)
VALUES (20, true, 1.10, 6);  -- Lower markup for lab-grown

INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);  -- Default catch-all
```

---

## 10. Infrastructure (Azure)

### Terraform Modules

| Module | Resources Created |
|--------|------------------|
| **service-bus** | Namespace + 3 queues (work-items, work-done, consolidate) |
| **storage** | Storage account + watermarks container |
| **container-registry** | ACR with admin auth |
| **container-apps** | Log Analytics + Container Apps Environment + 5 services |

### Services

| Service | Type | Scaling |
|---------|------|---------|
| API | Container App (HTTP) | 1-5 replicas |
| Worker | Container App (Queue) | 0-10 replicas (KEDA on work-items) |
| Consolidator | Container App (Queue) | 1-3 replicas (KEDA on consolidate) |
| Scheduler | Container App Job | Cron: 2 AM UTC daily |
| Dashboard | Container App (HTTP) | 1-2 replicas |

### Environment Differences

| Aspect | Staging | Production |
|--------|---------|------------|
| Service Bus SKU | Basic/Standard | Standard |
| Storage Replication | LRS | GRS/ZRS |
| Min Replicas | 0 (scale-to-zero) | 1 (always-on) |
| Log Retention | 7 days | 30 days |
| Blob Versioning | Disabled | Enabled |

### Cost Estimates

| Environment | Monthly Cost |
|-------------|-------------|
| Staging | $15-70 (scales to zero) |
| Production | $85-245 (always-on) |

---

## 11. Database Connection Pooling

Connection pooling is critical for Supabase shared pooling. All settings configurable via env vars.

| Variable | Description | Default |
|----------|-------------|---------|
| `PG_POOL_MAX` | Max connections per replica | 2 |
| `PG_IDLE_TIMEOUT_MS` | Idle connection timeout | 30000 |
| `PG_CONN_TIMEOUT_MS` | Connection timeout | 10000 |
| `CONSOLIDATOR_CONCURRENCY` | Concurrent batch upserts | 2 |

**Recommended per-service settings:**

| Service | PG_POOL_MAX | Notes |
|---------|-------------|-------|
| Worker | 1 | High replica count, minimal connections |
| Consolidator | 2 | Set CONSOLIDATOR_CONCURRENCY=2 |
| API | 3 | Longer idle for HTTP keep-alive |
| Scheduler | 2 | Short-lived job |

---

## 12. CI/CD

### Workflows

| File | Purpose |
|------|---------|
| `ci-affected-staging.yaml` | Primary CI/CD: detects affected apps, builds/tests/deploys to staging |
| `main.yml` | Manual fallback for full builds (workflow_dispatch only) |

### Deployment Flow

```
Push to main
    │
    ▼
CI (build, test, typecheck - affected packages only)
    │
    ▼
Deploy Staging (build Docker images, update Container Apps)
    │
    ▼
Production (manual deployment)
```

### Required GitHub Secrets

See `docs/GITHUB_SECRETS_CHECKLIST.md` for the full list (17 secrets total).

---

## 13. Development Commands

```bash
# Install dependencies
npm install

# Build all packages (including dashboard)
npm run build

# Build backend packages only
npm run build:backend

# Build dashboard only
npm run build:dashboard

# Development servers
npm run dev:api          # API on port 3000
npm run dev:scheduler    # Run scheduler once (exits)
npm run dev:worker       # Long-running worker
npm run dev:consolidator # Long-running consolidator
npm run dev:dashboard    # Dashboard on port 5173 (Vite)

# Manual operations
npm run worker:retry         # Retry failed partitions
npm run consolidator:trigger # Manually trigger consolidation

# Quality
npm run test                 # Run all tests
npm run typecheck            # TypeScript validation
npm run lint                 # ESLint
npm run swagger              # Generate OpenAPI spec

# Documentation
npm run docs:generate        # Regenerate concatenated docs
```

---

## 14. Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_HOST` | Supabase PostgreSQL host | Yes |
| `DATABASE_PORT` | PostgreSQL port | Yes |
| `DATABASE_NAME` | Database name | Yes |
| `DATABASE_USERNAME` | Database user | Yes |
| `DATABASE_PASSWORD` | Database password | Yes |
| `NIVODA_ENDPOINT` | Nivoda GraphQL API URL | Yes |
| `NIVODA_USERNAME` | Nivoda account email | Yes |
| `NIVODA_PASSWORD` | Nivoda account password | Yes |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage for watermarks | Yes |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus for queues | Yes |
| `HMAC_SECRETS` | JSON object of client secrets | Yes (API) |
| `RESEND_API_KEY` | Resend API key for alerts | Yes (Consolidator) |
| `ALERT_EMAIL_TO` | Alert recipient email | Yes (Consolidator) |
| `ALERT_EMAIL_FROM` | Alert sender email | Yes (Consolidator) |
| `PG_POOL_MAX` | Max DB connections per replica | No (default: 2) |
| `CONSOLIDATOR_CONCURRENCY` | Concurrent batch upserts | No (default: 2) |
| `AZURE_SUBSCRIPTION_ID` | For scheduler job trigger | No (API only) |
| `AZURE_RESOURCE_GROUP` | For scheduler job trigger | No (API only) |
| `AZURE_SCHEDULER_JOB_NAME` | For scheduler job trigger | No (API only) |
| `VITE_API_URL` | Dashboard API base URL | No (default: http://localhost:3000) |

---

## 15. Troubleshooting

| Issue | Solution |
|-------|----------|
| Workers not processing | Check Service Bus queue depth in Azure Portal |
| Consolidation skipped | Check `run_metadata` table for failed workers |
| Wrong prices | Verify `pricing_rules` priority ordering |
| API returning 401 | Verify API key hash, check `api_keys.last_used_at` |
| Watermark not advancing | Check consolidator logs for errors |
| Partition stuck at offset | Check `partition_progress` table, worker logs |
| Dashboard sync mismatch | Worker counts now computed from `partition_progress` |

---

## 16. SQL Migrations

| Migration | Description |
|-----------|-------------|
| `001_add_indexes.sql` | Performance indexes for search and pipeline |
| `002_partition_progress.sql` | Continuation pattern progress tracking |
| `003_rename_supplier_to_feed.sql` | Rename supplier → feed for multi-source support |
| `004_partition_failed_flag.sql` | Add failed flag to partition_progress |
| `005_consolidator_claim_pattern.sql` | FOR UPDATE SKIP LOCKED claim pattern |
| `005_remove_counter_columns.sql` | Remove deprecated counter columns (optional) |
| `006_rate_limiter.sql` | Rate limiting infrastructure |
| `007_consolidation_status.sql` | Consolidation status tracking |
| `008_error_logs.sql` | Error logging table |
