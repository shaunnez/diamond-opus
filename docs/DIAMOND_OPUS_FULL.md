# Diamond Opus - Consolidated Documentation

> Auto-generated from package READMEs. Run `npm run docs:generate` to regenerate.
> Last generated: 2026-02-06 12:49 UTC

---


## Project Overview (README.md)


A production-ready TypeScript monorepo for ingesting, consolidating, pricing, and serving diamond inventory from suppliers (Nivoda).

## Overview

Diamond Opus implements a robust two-stage data pipeline that:

1. **Ingests** diamond inventory from the Nivoda GraphQL API
2. **Applies** configurable pricing rules and markup calculations
3. **Serves** the consolidated inventory via a REST API with dual authentication

The system is designed for reliability with watermark-based incremental sync, failure-tolerant worker orchestration, and comprehensive alerting.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────▶│ Service Bus │────▶│   Workers   │
│  (2 AM UTC) │     │  (Azure)    │     │  (1-30)     │
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
                          ▼
                    ┌─────────────┐
                    │  REST API   │
                    │   :3000     │
                    └─────────────┘
```

### Key Features

- **Heatmap-based partitioning**: Adaptive price-range partitioning ensures balanced workload distribution
- **Failure-tolerant**: Worker failures prevent consolidation and watermark advancement
- **Incremental sync**: Watermark tracks last successful sync for efficient updates
- **Rule-based pricing**: Database-driven pricing rules with priority-based matching
- **Dual authentication**: API Key and HMAC signature support
- **Azure-native**: Service Bus queues, Blob Storage, Container Apps

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase account (PostgreSQL database)
- Azure account (Service Bus, Storage Account)
- Nivoda API credentials

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `NIVODA_ENDPOINT` | Nivoda GraphQL API URL |
| `NIVODA_USERNAME` | Nivoda account email |
| `NIVODA_PASSWORD` | Nivoda account password |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage for watermarks |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus |
| `HMAC_SECRETS` | JSON object of client secrets |

### 3. Initialize Database

Run the bootstrap SQL in your Supabase SQL Editor:

```bash
# Copy contents of sql/bootstrap.sql to Supabase SQL Editor and execute
```

### 4. Build All Packages

```bash
npm run build
```

### 5. Run Services

```bash
# Terminal 1: API Server
npm run dev:api

# Terminal 2: Worker (long-running)
npm run dev:worker

# Terminal 3: Consolidator (long-running)
npm run dev:consolidator

# Terminal 4: Scheduler (run once to trigger pipeline)
npm run dev:scheduler
```

## Project Structure

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
└── .github/workflows/           # CI/CD pipelines
```

## Development

### Available Commands

```bash
# Build
npm run build                    # Build all packages (including dashboard)
npm run build:backend            # Build backend packages only
npm run build:dashboard          # Build dashboard only

# Development
npm run dev:api                  # API on port 3000
npm run dev:scheduler            # Run scheduler once
npm run dev:worker               # Long-running worker
npm run dev:consolidator         # Long-running consolidator
npm run dev:dashboard            # Dashboard on port 5173

# Manual Operations
npm run worker:retry             # Retry failed partitions
npm run consolidator:trigger     # Force consolidation

# Quality
npm run test                     # Run all tests
npm run test -w @diamond/nivoda  # Package-specific tests
npm run typecheck                # TypeScript validation
npm run lint                     # ESLint
npm run swagger                  # Generate OpenAPI spec
```

### Testing

```bash
# All tests
npm run test

# Specific package
npm run test -w @diamond/pricing-engine

# Watch mode
npm run test:watch
```

## Two-Stage Pipeline

### Stage 1: Raw Ingestion

1. **Scheduler** runs at 2 AM UTC (or manually)
2. Reads watermark from Azure Blob Storage
3. Performs **heatmap scan** to analyze inventory density
4. Creates price-range partitions (up to 30 workers)
5. Sends `WorkItemMessage` to Service Bus queue

**Workers** (1-30 instances):
- Consume work items from queue
- Fetch diamonds from Nivoda GraphQL API
- Write raw JSON to `raw_diamonds_nivoda` table
- Report completion; last worker triggers consolidation

### Stage 2: Consolidation

1. **Consolidator** receives trigger message
2. Validates all workers completed successfully
3. Maps raw Nivoda data to canonical diamond schema
4. Applies pricing rules (markup, rating)
5. Upserts to `diamonds` table
6. Advances watermark **only on success**

### Failure Handling

| Scenario | Behavior |
|----------|----------|
| Worker fails | Skip consolidation, don't advance watermark |
| Consolidator fails | Send alert via Resend, don't advance watermark |
| All workers succeed | Trigger consolidation, advance watermark |

## API Authentication

The API supports two authentication methods:

### 1. API Key

```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/v2/diamonds
```

### 2. HMAC Signature

```bash
# Headers required:
# X-Client-Id: your-client-id
# X-Timestamp: unix-timestamp-seconds
# X-Signature: hmac-sha256-signature

# Signature computation:
# canonical = METHOD + '\n' + PATH + '\n' + TIMESTAMP + '\n' + SHA256(BODY)
# signature = HMAC-SHA256(secret, canonical)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/api/v2/diamonds` | Search diamonds |
| `GET` | `/api/v2/diamonds/:id` | Get single diamond |
| `POST` | `/api/v2/diamonds/:id/hold` | Create hold |
| `POST` | `/api/v2/diamonds/:id/purchase` | Create purchase |
| `POST` | `/api/v2/diamonds/:id/availability` | Update availability |

Swagger UI available at `http://localhost:3000/api-docs` when API is running.

## Dashboard

The admin dashboard provides a web UI for monitoring and managing the diamond pipeline.

### Features

- **Pipeline Overview**: Real-time stats on runs, workers, and diamonds
- **Run Management**: View run history, trigger new runs, monitor progress
- **Consolidation**: Trigger consolidation, view status, force consolidate
- **Worker Retry**: View failed workers, retry individual partitions
- **Diamond Query**: Search and browse the diamond inventory
- **Supplier Analytics**: View supplier performance metrics

### Running the Dashboard

```bash
# Development mode (hot reload)
npm run dev:dashboard

# Production build
npm run build:dashboard
```

The dashboard runs on `http://localhost:5173` and requires the API server to be running.

## Pricing Rules

Pricing is controlled by rules in the `pricing_rules` table:

```sql
-- Example: Higher markup for large lab-grown diamonds
INSERT INTO pricing_rules (priority, carat_min, lab_grown, markup_ratio, rating)
VALUES (10, 3.0, true, 1.25, 7);

-- Default rule (lowest priority)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

Rules are matched by priority (lower = higher precedence). First matching rule wins.

## Docker

Build images for deployment:

```bash
docker build -f docker/Dockerfile.api -t diamond-api .
docker build -f docker/Dockerfile.scheduler -t diamond-scheduler .
docker build -f docker/Dockerfile.worker -t diamond-worker .
docker build -f docker/Dockerfile.consolidator -t diamond-consolidator .
```

## Infrastructure

See [infrastructure/README.md](infrastructure/README.md) for Azure deployment using Terraform.

### Cost Estimates

| Environment | Monthly Cost |
|-------------|--------------|
| Staging | $15-70 (scales to zero) |
| Production | $85-245 (always-on) |

## CI/CD

GitHub Actions workflows:

- **ci-affected-staging.yaml**: Primary CI/CD - detects affected apps, builds/tests/deploys to staging on push to main
- **main.yml**: Manual fallback for full builds (workflow_dispatch only)

### Deployment Flow

```
Push to main
    │
    ▼
CI (build, test, typecheck)
    │
    ▼
Deploy Staging (if CI passes)
    │
    ├──▶ Build Docker images with SHA tag
    │
    └──▶ Update Container Apps via Azure CLI

Infrastructure changes (terraform/**)
    │
    ▼
Infrastructure workflow
    │
    ├──▶ Get current image tag from running containers
    │
    └──▶ Terraform plan/apply (preserves image tags)
```

### Manual Deployment

```bash
# Option 1: Trigger GitHub Actions
gh workflow run "Deploy Staging" --ref main
gh workflow run "Infrastructure" -f environment=staging -f action=apply

# Option 2: Manual CLI deployment
IMAGE_TAG=$(git rev-parse --short HEAD)
RG="diamond-staging-rg"
ACR="<your-acr>.azurecr.io"

# Build and push
for app in api scheduler worker consolidator dashboard; do
  docker build -t $ACR/diamond-${app}:${IMAGE_TAG} -f docker/Dockerfile.${app} .
  docker push $ACR/diamond-${app}:${IMAGE_TAG}
done

# Deploy containers
az containerapp update --name diamond-staging-api --resource-group $RG --image $ACR/diamond-api:$IMAGE_TAG
az containerapp update --name diamond-staging-worker --resource-group $RG --image $ACR/diamond-worker:$IMAGE_TAG
az containerapp update --name diamond-staging-consolidator --resource-group $RG --image $ACR/diamond-consolidator:$IMAGE_TAG

# Apply Terraform (for infrastructure changes)
cd infrastructure/terraform/environments/staging
terraform plan -var="image_tag=$IMAGE_TAG"
terraform apply -var="image_tag=$IMAGE_TAG"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Workers not processing | Check Service Bus queue depth in Azure Portal |
| Consolidation skipped | Check `run_metadata` table for `failed_workers > 0` |
| Wrong prices | Verify `pricing_rules` priority ordering |
| API returning 401 | Verify API key hash, check `api_keys.last_used_at` |
| Watermark not advancing | Check consolidator logs for errors |

## Package Documentation

Each package has its own README with detailed documentation:

- [packages/shared/README.md](packages/shared/README.md) - Types, utilities, constants
- [packages/database/README.md](packages/database/README.md) - Database client and queries
- [packages/nivoda/README.md](packages/nivoda/README.md) - Nivoda GraphQL integration
- [packages/pricing-engine/README.md](packages/pricing-engine/README.md) - Pricing logic
- [packages/api/README.md](packages/api/README.md) - REST API
- [apps/scheduler/README.md](apps/scheduler/README.md) - Job partitioning
- [apps/worker/README.md](apps/worker/README.md) - Data ingestion
- [apps/consolidator/README.md](apps/consolidator/README.md) - Transformation
- [apps/dashboard/README.md](apps/dashboard/README.md) - Admin dashboard

## License

Proprietary

---

## Package: @diamond/shared


Shared types, utilities, constants, and logging for the Diamond Opus platform.

## Overview

This package is the foundation of the monorepo, providing:

- **TypeScript types** for all domain entities
- **Constants** for configuration values
- **Utilities** for common operations
- **Logging** via Pino
- **Testing utilities** for other packages

## Installation

This package is automatically available to other workspace packages:

```json
{
  "dependencies": {
    "@diamond/shared": "*"
  }
}
```

## Usage

### Types

```typescript
import type {
  Diamond,
  PricingRule,
  PricingResult,
  WorkItemMessage,
  WorkDoneMessage,
  ConsolidateMessage,
  Watermark,
  RunType,
  AvailabilityStatus,
} from '@diamond/shared';
```

### Constants

```typescript
import {
  RECORDS_PER_WORKER,        // 5000 - Target records per worker
  WORKER_PAGE_SIZE,          // 30 - Pagination size for Nivoda
  CONSOLIDATOR_BATCH_SIZE,   // 2000 - Raw diamonds fetched per cycle
  CONSOLIDATOR_CONCURRENCY,  // 2 - Concurrent batch upserts (env-configurable)
  NIVODA_MAX_LIMIT,          // 50 - Nivoda API limit
  TOKEN_LIFETIME_MS,         // 6 hours
  TOKEN_EXPIRY_BUFFER_MS,    // 5 minutes
  DIAMOND_SHAPES,            // All supported shapes
  AVAILABILITY_STATUSES,     // available, on_hold, sold, unavailable
  SERVICE_BUS_QUEUES,        // Queue names
  BLOB_CONTAINERS,           // Container names
  HEATMAP_MAX_WORKERS,       // 30
  HEATMAP_MIN_RECORDS_PER_WORKER, // 1000
} from '@diamond/shared';
```

### Utilities

```typescript
import {
  requireEnv,      // Get required env var or throw
  generateTraceId, // Generate UUID for tracing
  withRetry,       // Retry async operations with backoff
} from '@diamond/shared';

// requireEnv - throws if not set
const apiKey = requireEnv('API_KEY');

// withRetry - exponential backoff
const result = await withRetry(
  () => fetchFromApi(),
  {
    maxAttempts: 3,
    onRetry: (error, attempt) => console.log(`Retry ${attempt}`, error),
  }
);
```

### Logging

```typescript
import { createLogger, type Logger } from '@diamond/shared';

const logger = createLogger({ service: 'my-service' });

logger.info('Starting operation', { traceId: '123' });
logger.error('Operation failed', error);
logger.debug('Debug info', { data });
```

### Testing Utilities

```typescript
import {
  createTestDiamond,
  createTestPricingRule,
  createMockNivodaAdapter,
  createMockDatabaseClient,
} from '@diamond/shared/testing';

// Create test data with overrides
const diamond = createTestDiamond({
  shape: 'ROUND',
  carats: 1.5,
});

const rule = createTestPricingRule({
  priority: 10,
  markupRatio: 1.25,
});
```

## Module Structure

```
src/
├── index.ts              # Main exports
├── types/
│   ├── diamond.ts        # Diamond entity type
│   ├── pricing.ts        # Pricing rule and result types
│   ├── messages.ts       # Service Bus message types
│   └── index.ts
├── constants.ts          # All configuration constants
├── utils/
│   ├── env.ts            # Environment variable helpers
│   ├── retry.ts          # Retry with backoff
│   ├── trace.ts          # Trace ID generation
│   └── index.ts
├── logger.ts             # Pino logger factory
└── testing/
    ├── factories.ts      # Test data builders
    ├── mocks.ts          # Mock implementations
    └── index.ts
```

## Type Definitions

### Diamond

```typescript
interface Diamond {
  id: string;
  supplier: string;
  supplierStoneId: string;
  offerId: string;
  shape: string;
  carats: number;
  color: string;
  clarity: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  labGrown: boolean;
  treated: boolean;
  supplierPriceCents: number;
  pricePerCaratCents: number;
  priceModelPriceCents?: number;
  markupRatio?: number;
  rating?: number;
  availability: AvailabilityStatus;
  imageUrl?: string;
  videoUrl?: string;
  certificateLab?: string;
  certificateNumber?: string;
  measurements?: DiamondMeasurements;
  attributes?: DiamondAttributes;
  // ... lifecycle fields
}
```

### PricingRule

```typescript
interface PricingRule {
  id: string;
  priority: number;
  caratMin?: number;
  caratMax?: number;
  shapes?: string[];
  labGrown?: boolean;
  supplier?: string;
  markupRatio: number;
  rating?: number;
  active: boolean;
}
```

### Messages

```typescript
interface WorkItemMessage {
  type: 'WORK_ITEM';
  runId: string;
  traceId: string;
  partitionId: string;
  minPrice: number;
  maxPrice: number;
  totalRecords: number;
  offsetStart: number;
  offsetEnd: number;
  updatedFrom?: string;
  updatedTo: string;
}

interface WorkDoneMessage {
  type: 'WORK_DONE';
  runId: string;
  traceId: string;
  workerId: string;
  partitionId: string;
  recordsProcessed: number;
  status: 'success' | 'failed';
  error?: string;
}

interface ConsolidateMessage {
  type: 'CONSOLIDATE';
  runId: string;
  traceId: string;
  force?: boolean;
}
```

## Assumptions

1. **All prices in cents**: To avoid floating-point precision issues, all monetary values are stored as integers representing cents
2. **UTC timestamps**: All dates/times are in UTC
3. **Pino logging**: Structured JSON logging in production, pretty-printed in development
4. **ES modules**: Package uses ES module format exclusively

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Tests
npm run test
```

---

## Package: @diamond/database


PostgreSQL database client and query functions for the Diamond Opus platform.

## Overview

This package provides:

- **Connection pooling** via `pg` library
- **Query functions** for all database operations
- **Transaction support** for atomic operations
- **Type-safe** database interactions

## Installation

```json
{
  "dependencies": {
    "@diamond/database": "*"
  }
}
```

## Configuration

Requires the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:pass@db.supabase.co:5432/postgres
```

## Usage

### Connection Management

```typescript
import { getPool, closePool } from '@diamond/database';

// Get connection pool (singleton)
const pool = getPool();

// Close pool (on shutdown)
await closePool();
```

### Diamond Operations

```typescript
import {
  getDiamondById,
  getDiamondByOfferId,
  searchDiamonds,
  upsertDiamond,
  updateDiamondAvailability,
} from '@diamond/database';

// Get single diamond
const diamond = await getDiamondById('uuid-here');

// Search with filters
const results = await searchDiamonds({
  shape: 'ROUND',
  caratMin: 1.0,
  caratMax: 2.0,
  colors: ['D', 'E', 'F'],
  clarities: ['VVS1', 'VVS2'],
  labGrown: false,
  priceMin: 500000, // $5,000 in cents
  priceMax: 1000000,
  page: 1,
  limit: 50,
  sortBy: 'supplier_price_cents',
  sortOrder: 'asc',
});

// Upsert diamond
await upsertDiamond(diamondData);

// Update availability
await updateDiamondAvailability(diamondId, 'on_hold', holdId);
```

### Raw Diamond Operations

```typescript
import {
  upsertRawDiamond,
  getUnconsolidatedRawDiamonds,
  markAsConsolidated,
} from '@diamond/database';

// Insert raw Nivoda data
await upsertRawDiamond(runId, supplierStoneId, offerId, payload);

// Get unprocessed diamonds for consolidation
const rawDiamonds = await getUnconsolidatedRawDiamonds(
  1000, // batch size
  0     // offset
);

// Mark as processed
await markAsConsolidated(['id1', 'id2', 'id3']);
```

### Run Metadata Operations

```typescript
import {
  createRunMetadata,
  getRunMetadata,
  incrementCompletedWorkers,
  incrementFailedWorkers,
  completeRun,
} from '@diamond/database';

// Create new run
const run = await createRunMetadata('full', 10, watermarkBefore);

// Update worker counters (atomic)
const { completedWorkers, expectedWorkers, failedWorkers } =
  await incrementCompletedWorkers(runId);

// Mark run complete
await completeRun(runId, completedAt);
```

### Worker Run Operations

```typescript
import {
  createWorkerRun,
  updateWorkerRun,
  getFailedWorkerRuns,
} from '@diamond/database';

// Create worker record
const workerRun = await createWorkerRun(
  runId,
  partitionId,
  workerId,
  workItemPayload
);

// Update on completion
await updateWorkerRun(workerRun.id, 'completed', recordsProcessed);

// Get failed runs for retry
const failed = await getFailedWorkerRuns(runId);
```

### Pricing Rules

```typescript
import { getActivePricingRules } from '@diamond/database';

// Get all active rules sorted by priority
const rules = await getActivePricingRules();
```

### API Keys

```typescript
import { validateApiKey, updateApiKeyLastUsed } from '@diamond/database';

// Validate hashed key
const apiKey = await validateApiKey(hashedKey);

// Update usage timestamp
await updateApiKeyLastUsed(apiKey.id);
```

### Hold & Purchase History

```typescript
import {
  createHoldHistory,
  createPurchaseHistory,
} from '@diamond/database';

await createHoldHistory({
  diamondId,
  supplier: 'nivoda',
  supplierHoldId: 'hold-123',
  offerId,
  status: 'active',
  holdUntil: new Date(),
});

await createPurchaseHistory({
  diamondId,
  supplier: 'nivoda',
  supplierOrderId: 'order-456',
  offerId,
  idempotencyKey: 'unique-key',
  status: 'pending',
});
```

## Module Structure

```
src/
├── index.ts              # Main exports
├── client.ts             # Connection pool singleton
└── queries/
    ├── diamonds.ts       # Diamond CRUD operations
    ├── raw-diamonds.ts   # Raw data operations
    ├── run-metadata.ts   # Run tracking
    ├── worker-runs.ts    # Worker tracking
    ├── pricing-rules.ts  # Pricing rule queries
    ├── api-keys.ts       # API key validation
    ├── hold-history.ts   # Hold tracking
    ├── purchase-history.ts # Purchase tracking
    └── index.ts
```

## Connection Pool Settings

All pool settings are configurable via environment variables:

```typescript
{
  max: PG_POOL_MAX || 2,                          // Default: 2 connections
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS || 30000,  // Default: 30 seconds
  connectionTimeoutMillis: PG_CONN_TIMEOUT_MS || 10000, // Default: 10 seconds
}
```

**Recommended per-service settings:**

| Service | PG_POOL_MAX | PG_IDLE_TIMEOUT_MS | Notes |
|---------|-------------|--------------------|----|
| Worker | 1 | 5000 | High replica count, minimal connections |
| Consolidator | 2 | 5000 | Set CONSOLIDATOR_CONCURRENCY=2 |
| API | 3 | 30000 | Longer idle for HTTP keep-alive |
| Scheduler | 2 | 5000 | Short-lived job |

## Database Schema

See `sql/bootstrap.sql` for the complete schema. Key tables:

| Table | Purpose |
|-------|---------|
| `diamonds` | Canonical diamond inventory |
| `raw_diamonds_nivoda` | Raw Nivoda API responses |
| `pricing_rules` | Pricing configuration |
| `run_metadata` | Batch run tracking |
| `worker_runs` | Individual worker tracking |
| `api_keys` | API authentication |
| `hold_history` | Hold audit trail |
| `purchase_history` | Purchase audit trail |

## Assumptions

1. **Supabase PostgreSQL**: Designed for Supabase, but works with any PostgreSQL
2. **Prices in cents**: All `*_cents` columns are BIGINT storing cents
3. **Soft deletes**: Diamonds use `status = 'deleted'` instead of hard delete
4. **Atomic counters**: Worker completion uses atomic increment to avoid races
5. **Connection pooling**: Single pool instance per process

## Error Handling

All query functions throw on database errors. Wrap in try/catch:

```typescript
try {
  const diamond = await getDiamondById(id);
} catch (error) {
  if (error.code === '23505') {
    // Unique constraint violation
  }
  throw error;
}
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Tests
npm run test
```

---

## Package: @diamond/nivoda


Nivoda GraphQL API adapter and data mapper for the Diamond Opus platform.

## Overview

This package provides:

- **GraphQL client** for Nivoda's diamond API
- **Token management** with automatic refresh
- **Data mapper** to transform Nivoda responses to canonical schema
- **Type definitions** for Nivoda API structures

## Installation

```json
{
  "dependencies": {
    "@diamond/nivoda": "*"
  }
}
```

## Configuration

Required environment variables:

```bash
NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
NIVODA_USERNAME=user@example.com
NIVODA_PASSWORD=secret
```

## Usage

### NivodaAdapter

```typescript
import { NivodaAdapter } from '@diamond/nivoda';

const adapter = new NivodaAdapter();

// Get diamond count (use this for accurate totals!)
const count = await adapter.getDiamondsCount({
  shapes: ['ROUND', 'OVAL'],
  sizes: { from: 0.5, to: 5.0 },
  dollar_value: { from: 1000, to: 10000 },
});

// Search diamonds with pagination
const response = await adapter.searchDiamonds(
  {
    shapes: ['ROUND'],
    sizes: { from: 1.0, to: 2.0 },
  },
  {
    offset: 0,
    limit: 50, // Max 50
    order: { type: 'price', direction: 'asc' },
  }
);

// Create hold on diamond
const hold = await adapter.createHold(offerId);

// Create purchase order
const order = await adapter.createOrder(
  offerId,
  destinationId,
  {
    reference: 'PO-12345',
    comments: 'Rush order',
    returnOption: 'standard',
  }
);

// Clear token cache (for testing)
adapter.clearTokenCache();
```

### Data Mapping

```typescript
import { mapNivodaItemToDiamond, mapRawPayloadToDiamond } from '@diamond/nivoda';

// Map single Nivoda item to Diamond
const diamond = mapNivodaItemToDiamond(nivodaItem);

// Map from stored raw payload (JSON)
const diamond = mapRawPayloadToDiamond(rawPayload);
```

### Query Types

```typescript
import type { NivodaQuery, NivodaDiamondsResponse } from '@diamond/nivoda';

const query: NivodaQuery = {
  shapes: ['ROUND', 'OVAL', 'EMERALD'],
  sizes: { from: 0.5, to: 10.0 },
  dollar_value: { from: 500, to: 50000 },
  // Additional filters available in Nivoda API
};
```

## Token Management

The adapter handles authentication automatically:

- **Token lifetime**: 6 hours
- **Refresh buffer**: Re-authenticates 5 minutes before expiry
- **Caching**: Token cached in memory per adapter instance

```typescript
// Token is obtained automatically on first request
const count = await adapter.getDiamondsCount(query);

// Subsequent requests reuse the cached token
const results = await adapter.searchDiamonds(query);

// Force re-authentication
adapter.clearTokenCache();
```

## Module Structure

```
src/
├── index.ts              # Main exports
├── adapter.ts            # NivodaAdapter class
├── mapper.ts             # Data transformation functions
├── queries.ts            # GraphQL query definitions
└── types.ts              # TypeScript type definitions
```

## Critical: Identity Mapping

Nivoda returns two different IDs:

```json
{
  "id": "abc123",          // OFFER_ID - use for ordering/holds
  "diamond": {
    "id": "xyz789"         // SUPPLIER_STONE_ID - use for deduplication
  }
}
```

The mapper correctly extracts both:

```typescript
const diamond = mapNivodaItemToDiamond(item);
// diamond.offerId = item.id
// diamond.supplierStoneId = item.diamond.id
```

## Critical: Counting

**Always use `getDiamondsCount()` for accurate totals!**

The `total_count` field in paginated search results is unreliable. The scheduler's heatmap algorithm depends on accurate counts from `diamonds_by_query_count`.

```typescript
// CORRECT - use for partitioning
const count = await adapter.getDiamondsCount(query);

// INCORRECT - don't use total_count for planning
const response = await adapter.searchDiamonds(query);
// Don't use: response.total_count
```

## API Constraints

| Constraint | Value |
|------------|-------|
| Max page size | 50 items |
| Token lifetime | 6 hours |
| Rate limits | Check Nivoda docs |

## Mapper Output

The mapper transforms Nivoda responses to the canonical Diamond schema:

```typescript
interface MappedDiamond {
  supplier: 'nivoda';
  supplierStoneId: string;    // diamond.id
  offerId: string;            // item.id
  shape: string;
  carats: number;
  color: string;
  clarity: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  labGrown: boolean;
  treated: boolean;
  supplierPriceCents: number; // price * 100
  pricePerCaratCents: number;
  availability: AvailabilityStatus;
  imageUrl?: string;
  videoUrl?: string;
  certificateLab?: string;
  certificateNumber?: string;
  certificatePdfUrl?: string;
  measurements?: {
    length?: number;
    width?: number;
    depth?: number;
    depthPercent?: number;
    tablePercent?: number;
    crownAngle?: number;
    crownHeight?: number;
    pavilionAngle?: number;
    pavilionDepth?: number;
    girdleMin?: string;
    girdleMax?: string;
    culet?: string;
  };
  attributes?: {
    eyeClean?: boolean;
    milky?: boolean;
    bgm?: string;
    shade?: string;
    mineOfOrigin?: string;
    comments?: string;
  };
  supplierName?: string;
  supplierLegalName?: string;
}
```

## Assumptions

1. **Nivoda staging vs production**: Set endpoint via environment variable
2. **GraphQL-only**: No REST API support
3. **All prices in USD**: Nivoda returns prices in dollars, mapper converts to cents
4. **Token per instance**: Each adapter instance has its own token cache

## Error Handling

```typescript
try {
  const results = await adapter.searchDiamonds(query);
} catch (error) {
  // GraphQL errors have specific structure
  if (error.response?.errors) {
    console.error('GraphQL errors:', error.response.errors);
  }
  throw error;
}
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Tests
npm run test
```

## Testing

Use the mock adapter from shared package:

```typescript
import { createMockNivodaAdapter } from '@diamond/shared/testing';

const mockAdapter = createMockNivodaAdapter({
  getDiamondsCount: async () => 1000,
  searchDiamonds: async () => ({ items: [], total_count: 0 }),
});
```

---

## Package: @diamond/pricing-engine


Rule-based pricing engine for the Diamond Opus platform.

## Overview

This package provides:

- **Rule matching** based on diamond attributes
- **Markup calculation** for retail pricing
- **Rating assignment** for quality scoring
- **Database-driven** configuration via `pricing_rules` table

## Installation

```json
{
  "dependencies": {
    "@diamond/pricing-engine": "*"
  }
}
```

## Usage

### Basic Usage

```typescript
import { PricingEngine } from '@diamond/pricing-engine';

const engine = new PricingEngine();

// Load rules from database
await engine.loadRules();

// Apply pricing to a diamond
const pricedDiamond = engine.applyPricing(baseDiamond);
// pricedDiamond now has: priceModelPriceCents, markupRatio, rating
```

### Singleton Pattern

```typescript
import { getDefaultPricingEngine, resetDefaultPricingEngine } from '@diamond/pricing-engine';

// Get cached engine instance
const engine = await getDefaultPricingEngine();

// Reset for testing
resetDefaultPricingEngine();
```

### Calculate Pricing Only

```typescript
const pricing = engine.calculatePricing({
  carats: 1.5,
  shape: 'ROUND',
  labGrown: false,
  supplier: 'nivoda',
  supplierPriceCents: 500000, // $5,000
});

// pricing = {
//   supplierPriceCents: 500000,
//   priceModelPriceCents: 575000,   // with 1.15x markup
//   pricePerCaratCents: 333333, // per carat
//   markupRatio: 1.15,
//   rating: 5,
//   matchedRuleId: 'uuid-of-rule',
// }
```

### Find Matching Rule

```typescript
const rule = engine.findMatchingRule({
  carats: 2.0,
  shape: 'OVAL',
  labGrown: true,
  supplier: 'nivoda',
});

if (rule) {
  console.log(`Matched rule: ${rule.id}, markup: ${rule.markupRatio}`);
}
```

### Set Rules Manually (Testing)

```typescript
engine.setRules([
  {
    id: 'rule-1',
    priority: 10,
    caratMin: 1.0,
    caratMax: 2.0,
    shapes: ['ROUND'],
    markupRatio: 1.20,
    rating: 8,
    active: true,
  },
  {
    id: 'default',
    priority: 1000,
    markupRatio: 1.15,
    rating: 5,
    active: true,
  },
]);
```

## Rule Matching Algorithm

Rules are matched in **priority order** (lower number = higher precedence):

1. Load all active rules sorted by priority
2. For each rule, check if diamond matches:
   - `caratMin <= diamond.carats` (if specified)
   - `diamond.carats <= caratMax` (if specified)
   - `diamond.shape in shapes` (if shapes array specified)
   - `diamond.labGrown === rule.labGrown` (if specified)
   - `diamond.supplier === rule.supplier` (if specified)
3. **First matching rule wins**
4. If no rule matches, use default markup (1.15x)

## Rule Structure

```typescript
interface PricingRule {
  id: string;
  priority: number;      // Lower = higher precedence

  // Match criteria (null = matches all)
  caratMin?: number;
  caratMax?: number;
  shapes?: string[];     // ['ROUND', 'OVAL', ...]
  labGrown?: boolean;
  supplier?: string;

  // Outputs
  markupRatio: number;   // e.g., 1.15 for 15% markup
  rating?: number;       // 1-10 quality score

  active: boolean;
}
```

## Pricing Calculation

```
priceModelPriceCents = round(supplierPriceCents * markupRatio)
pricePerCaratCents = round(supplierPriceCents / carats)
```

All calculations use integer arithmetic (cents) to avoid floating-point issues.

## Database Schema

```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,

  -- Match criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],
  lab_grown BOOLEAN,
  supplier TEXT,

  -- Outputs
  markup_ratio DECIMAL(5,4) NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default rule (always matches, lowest priority)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

## Example Rules

```sql
-- Premium for large natural rounds
INSERT INTO pricing_rules (priority, shapes, carat_min, lab_grown, markup_ratio, rating)
VALUES (10, ARRAY['ROUND'], 3.0, false, 1.30, 9);

-- Lower markup for lab-grown
INSERT INTO pricing_rules (priority, lab_grown, markup_ratio, rating)
VALUES (20, true, 1.10, 6);

-- Specific supplier pricing
INSERT INTO pricing_rules (priority, supplier, markup_ratio)
VALUES (30, 'preferred-supplier', 1.12);

-- Small stones get lower markup
INSERT INTO pricing_rules (priority, carat_max, markup_ratio, rating)
VALUES (50, 0.5, 1.08, 4);

-- Default (always keep a catch-all)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

## Module Structure

```
src/
├── index.ts              # Main exports
└── engine.ts             # PricingEngine class
```

## Assumptions

1. **First match wins**: Rules are not combined, first matching rule applies
2. **Default markup**: 1.15 (15%) if no rule matches
3. **Prices in cents**: All monetary values are integers
4. **Rules from database**: Production rules stored in `pricing_rules` table
5. **Priority ordering**: Lower number = higher priority

## Error Handling

```typescript
const engine = new PricingEngine();

// This will throw if rules not loaded
try {
  engine.findMatchingRule(diamond);
} catch (error) {
  // Error: Pricing rules not loaded. Call loadRules() first.
}

// Correct usage
await engine.loadRules();
const rule = engine.findMatchingRule(diamond);
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Tests
npm run test
```

## Testing

```typescript
import { PricingEngine } from '@diamond/pricing-engine';
import { createTestDiamond, createTestPricingRule } from '@diamond/shared/testing';

describe('PricingEngine', () => {
  it('applies correct markup', () => {
    const engine = new PricingEngine();
    engine.setRules([
      createTestPricingRule({ priority: 10, markupRatio: 1.25 }),
    ]);

    const diamond = createTestDiamond({ supplierPriceCents: 100000 });
    const result = engine.applyPricing(diamond);

    expect(result.priceModelPriceCents).toBe(125000);
    expect(result.markupRatio).toBe(1.25);
  });
});
```

---

## Package: @diamond/api


Express REST API for the Diamond Opus platform.

## Overview

This package provides:

- **REST API** for diamond search and operations
- **Dual authentication** (API Key + HMAC)
- **Swagger documentation** with OpenAPI spec
- **Request validation** with Zod schemas
- **Structured logging** and error handling

## Installation

```json
{
  "dependencies": {
    "@diamond/api": "*"
  }
}
```

## Configuration

Required environment variables:

```bash
PORT=3000
DATABASE_URL=postgresql://...
HMAC_SECRETS={"shopify":"secret1","internal":"secret2"}
```

## Running

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm run start
```

## API Endpoints

### Health Check

```
GET /health
```

No authentication required. Returns 200 OK.

### Diamond Search

```
GET /api/v2/diamonds
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `shape` | string | Single shape filter |
| `carat_min` | number | Minimum carats |
| `carat_max` | number | Maximum carats |
| `color[]` | string[] | Array of colors |
| `clarity[]` | string[] | Array of clarities |
| `cut[]` | string[] | Array of cuts |
| `lab_grown` | boolean | Lab-grown filter |
| `price_min` | number | Minimum price (cents) |
| `price_max` | number | Maximum price (cents) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 50, max: 100) |
| `sort_by` | string | Sort field |
| `sort_order` | string | 'asc' or 'desc' |

**Example:**

```bash
curl -H "X-API-Key: your-key" \
  "http://localhost:3000/api/v2/diamonds?shape=ROUND&carat_min=1&carat_max=2&limit=10"
```

### Get Diamond

```
GET /api/v2/diamonds/:id
```

### Create Hold

```
POST /api/v2/diamonds/:id/hold
```

Creates a hold on a diamond via Nivoda API.

### Create Purchase

```
POST /api/v2/diamonds/:id/purchase
```

**Request Body:**

```json
{
  "destinationId": "dest-123",
  "reference": "PO-12345",
  "comments": "Rush order",
  "idempotencyKey": "unique-key"
}
```

### Update Availability

```
POST /api/v2/diamonds/:id/availability
```

**Request Body:**

```json
{
  "availability": "on_hold",
  "holdId": "hold-123"
}
```

## Authentication

### API Key Authentication

Include the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/v2/diamonds
```

The key is SHA256 hashed and compared against `api_keys` table.

### HMAC Signature Authentication

Include these headers:

```
X-Client-Id: your-client-id
X-Timestamp: unix-timestamp-seconds
X-Signature: hmac-sha256-signature
```

**Signature Computation:**

```
canonical_string = METHOD + '\n' + PATH + '\n' + TIMESTAMP + '\n' + SHA256(BODY)
signature = HMAC-SHA256(client_secret, canonical_string)
```

**Example (Node.js):**

```javascript
const crypto = require('crypto');

const method = 'GET';
const path = '/api/v2/diamonds';
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = '';

const canonical = `${method}\n${path}\n${timestamp}\n${crypto.createHash('sha256').update(body).digest('hex')}`;
const signature = crypto.createHmac('sha256', clientSecret).update(canonical).digest('hex');

// Use headers:
// X-Client-Id: your-client-id
// X-Timestamp: <timestamp>
// X-Signature: <signature>
```

**Timestamp Tolerance:** 300 seconds (5 minutes)

## Swagger Documentation

Access Swagger UI at `http://localhost:3000/api-docs` when the API is running.

Generate OpenAPI spec:

```bash
npm run swagger
```

## Module Structure

```
src/
├── index.ts              # Main exports
├── main.ts               # Entry point (server startup)
├── server.ts             # Express app factory
├── routes/
│   ├── index.ts          # Route registration
│   ├── health.ts         # Health check route
│   ├── diamonds.ts       # Diamond CRUD routes
│   ├── analytics.ts      # Run analytics and dashboard data
│   ├── triggers.ts       # Pipeline trigger endpoints
│   ├── heatmap.ts        # Heatmap data endpoint
│   ├── nivoda.ts         # Nivoda proxy endpoints
│   └── pricing-rules.ts  # Pricing rules management
├── middleware/
│   ├── index.ts          # Middleware exports
│   ├── auth.ts           # Authentication middleware
│   ├── error-handler.ts  # Error handling
│   └── request-validator.ts # Request validation
├── validators/
│   ├── index.ts          # Validator exports
│   ├── diamonds.ts       # Diamond Zod schemas
│   └── analytics.ts      # Analytics Zod schemas
└── swagger/
    └── generator.ts      # OpenAPI spec generator
```

## Error Handling

All errors return structured JSON:

```json
{
  "error": {
    "code": "DIAMOND_NOT_FOUND",
    "message": "Diamond with ID xyz not found"
  }
}
```

**Error Codes:**

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `DIAMOND_NOT_FOUND` | 404 | Diamond doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Request Logging

All requests are logged with:

- Trace ID (auto-generated or from `X-Trace-Id` header)
- Method and path
- Query parameters
- Response status and timing

```json
{
  "level": "info",
  "traceId": "abc123",
  "method": "GET",
  "path": "/api/v2/diamonds",
  "query": { "shape": "ROUND" },
  "status": 200,
  "duration": 45
}
```

## Middleware Stack

1. **CORS** - Enabled for all origins
2. **JSON Parser** - With raw body capture for HMAC
3. **Request Logging** - Trace ID and timing
4. **Authentication** - API Key or HMAC
5. **Route Handlers** - Business logic
6. **Error Handler** - Centralized error formatting

## Assumptions

1. **Supabase database**: Connected via DATABASE_URL
2. **Nivoda integration**: Hold/purchase operations call Nivoda API
3. **Stateless**: No server-side sessions
4. **JSON only**: All requests/responses are JSON
5. **UTC timestamps**: All dates in responses are UTC

## Development

```bash
# Development with hot reload
npm run dev

# Build
npm run build

# Tests
npm run test

# Generate Swagger
npm run swagger
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './server';

describe('GET /api/v2/diamonds', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v2/diamonds');
    expect(response.status).toBe(401);
  });
});
```

---

## App: Scheduler


Job partitioning service that orchestrates the diamond ingestion pipeline.

## Overview

The scheduler is a **cron-triggered job** that:

1. Reads the current watermark from Azure Blob Storage
2. Performs a **heatmap scan** to analyze Nivoda inventory density
3. Partitions the workload into price-range segments
4. Creates run metadata in the database
5. Publishes work items to Azure Service Bus

## How It Works

### Heatmap Algorithm

The heatmap scanner analyzes diamond distribution by price to create balanced partitions:

```
Price Range Analysis:
┌────────────────────────────────────────────────────────────┐
│ $0-$20,000 (Dense Zone)                                    │
│ ████████████████████████████████ 80% of diamonds           │
│ Fixed $100 steps for fine granularity                      │
├────────────────────────────────────────────────────────────┤
│ $20,000-$250,000 (Sparse Zone)                             │
│ ████ 20% of diamonds                                       │
│ Adaptive stepping based on density                         │
└────────────────────────────────────────────────────────────┘
```

**Key Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `HEATMAP_DENSE_ZONE_THRESHOLD` | $20,000 | Price threshold for dense zone |
| `HEATMAP_DENSE_ZONE_STEP` | $100 | Fixed step size in dense zone |
| `HEATMAP_MAX_WORKERS` | 30 | Maximum parallel workers |
| `HEATMAP_MIN_RECORDS_PER_WORKER` | 1,000 | Minimum records to spawn worker |
| `RECORDS_PER_WORKER` | 5,000 | Target records per worker |

### Run Types

**Full Run:**
- Triggered when no watermark exists or on manual request
- Scans entire price range ($0-$250,000)
- Creates up to 30 worker partitions
- Clears raw_diamonds_nivoda table first

**Incremental Run:**
- Triggered when watermark exists
- Only fetches diamonds updated since last watermark
- Creates fewer partitions (up to 10 workers)
- Appends to existing raw data

### Partition Strategy

```
Example Full Run Output:
┌─────────────┬─────────────┬──────────┐
│ Partition   │ Price Range │ Est. Diamonds │
├─────────────┼─────────────┼──────────┤
│ partition-1 │ $0-$500     │ 5,200    │
│ partition-2 │ $500-$1,000 │ 4,800    │
│ partition-3 │ $1,000-$1,500│ 5,100   │
│ ...         │ ...         │ ...      │
│ partition-30│ $100k-$250k │ 3,200    │
└─────────────┴─────────────┴──────────┘
```

## Configuration

Required environment variables:

```bash
DATABASE_URL=postgresql://...
NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
NIVODA_USERNAME=your-username
NIVODA_PASSWORD=your-password
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
```

## Running

```bash
# Development (runs once and exits)
npm run dev:scheduler

# Production
npm run build
node dist/index.js
```

## Azure Deployment

Deployed as a **Container Apps Job** with cron schedule:

```hcl
schedule = "0 2 * * *"  # 2 AM UTC daily
```

The job:
- Starts at scheduled time
- Runs once to completion
- Exits when done

## Module Structure

```
src/
├── index.ts          # Entry point and orchestration
├── heatmap.ts        # Density scanning algorithm
├── service-bus.ts    # Service Bus message publishing
└── watermark.ts      # Azure Blob watermark operations
```

## Watermark Management

**Location:** Azure Blob Storage `watermarks/nivoda.json`

```json
{
  "lastUpdatedAt": "2024-01-15T02:00:00.000Z",
  "lastRunId": "abc-123-def",
  "lastRunCompletedAt": "2024-01-15T02:45:00.000Z"
}
```

**Watermark Flow:**
1. Scheduler **reads** watermark at start
2. If exists → incremental run (filter by `updated_at > lastUpdatedAt`)
3. If not exists → full run
4. Watermark is **only advanced** by consolidator on successful completion

## Work Item Message

Published to `work-items` queue:

```typescript
interface WorkItemMessage {
  runId: string;
  partitionId: string;
  priceMin: number;      // in dollars
  priceMax: number;      // in dollars
  expectedRecords: number;
  isIncremental: boolean;
  watermarkBefore?: string;
}
```

## Run Metadata

Created in database before publishing work items:

```sql
INSERT INTO run_metadata (
  run_id,
  run_type,           -- 'full' or 'incremental'
  expected_workers,   -- number of partitions
  watermark_before    -- for incremental runs
)
```

## Assumptions

1. **Nivoda API availability**: Scheduler assumes API is reachable for count queries
2. **Diamond distribution**: Most diamonds are in $0-$20,000 range (80%+)
3. **Count accuracy**: Uses `diamonds_by_query_count` (not paginated total_count)
4. **Single scheduler**: Only one scheduler instance runs at a time
5. **Idempotent runs**: If scheduler crashes mid-run, next run starts fresh

## Error Handling

| Error | Behavior |
|-------|----------|
| Nivoda API unreachable | Log error, exit with code 1 |
| Service Bus unavailable | Retry 3 times with backoff, then fail |
| Database unreachable | Log error, exit with code 1 |
| Empty inventory | Log warning, create 0 work items |

## Monitoring

Key metrics to watch:

- **Partition count**: Should be 1-30 for full runs
- **Estimated records**: Should match actual Nivoda inventory
- **Run duration**: Typically 1-5 minutes for scanning
- **Heatmap API calls**: ~50-200 count queries per run

## Debugging

```bash
# Check last run in database
SELECT * FROM run_metadata ORDER BY started_at DESC LIMIT 1;

# Check watermark blob
az storage blob download \
  --container-name watermarks \
  --name nivoda.json \
  --file /dev/stdout

# View scheduler logs
az containerapp logs show --name diamond-scheduler --resource-group rg-diamond
```

---

## App: Worker


Diamond ingestion service that fetches data from Nivoda and stores raw payloads.

## Overview

The worker is a **long-running queue consumer** that:

1. Receives `WorkItemMessage` from Azure Service Bus
2. Fetches diamonds from Nivoda GraphQL API for assigned price range
3. Writes raw JSON payloads to `raw_diamonds_nivoda` table
4. Reports completion status to database
5. Last worker triggers consolidation

## How It Works

### Message Processing Flow

```
┌─────────────────┐
│ Service Bus     │
│ work-items queue│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Worker Instance │────▶│ Nivoda GraphQL  │
│ (1 of N)        │     │ API             │
└────────┬────────┘     └─────────────────┘
         │
         │ paginated fetch (page size: 30)
         ▼
┌─────────────────┐
│ raw_diamonds_   │
│ nivoda table    │
└────────┬────────┘
         │
         │ report completion
         ▼
┌─────────────────┐     ┌─────────────────┐
│ run_metadata    │────▶│ If last worker: │
│ (atomic counter)│     │ trigger consol. │
└─────────────────┘     └─────────────────┘
```

### Pagination Strategy

Workers paginate through their assigned price range:

```typescript
// Fetch configuration
const PAGE_SIZE = 30;           // Items per request
const MAX_RETRIES = 3;          // Per-page retry attempts
const RETRY_DELAY_MS = 2000;    // Base delay (exponential backoff)
```

**Example:**
- Worker assigned: $1,000-$2,000 range, ~5,000 diamonds
- Pages needed: ~167 API calls (5000 / 30)
- Total time: ~5-10 minutes depending on API latency

### Atomic Counter

Workers use database atomic increment to coordinate:

```sql
-- When worker completes successfully
UPDATE run_metadata
SET completed_workers = completed_workers + 1
WHERE run_id = $1
RETURNING completed_workers, expected_workers;

-- If completed_workers == expected_workers → trigger consolidation
```

## Configuration

Required environment variables:

```bash
DATABASE_URL=postgresql://...
NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
NIVODA_USERNAME=your-username
NIVODA_PASSWORD=your-password
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
```

## Running

```bash
# Development (long-running)
npm run dev:worker

# Production
npm run build
node dist/index.js

# Manual retry of failed partitions
npm run worker:retry
```

## Azure Deployment

Deployed as a **Container App** with Service Bus scaling:

```hcl
# Scaling configuration
min_replicas = 1
max_replicas = 10

# Scale based on queue depth
scaling_rule {
  name             = "queue-scaling"
  queue_name       = "work-items"
  message_count    = 5
}
```

## Module Structure

```
src/
├── index.ts          # Entry point, message handler, and processing logic
├── service-bus.ts    # Service Bus message publishing (continuations)
└── retry.ts          # Manual retry functionality
```

## Work Item Message

Received from `work-items` queue:

```typescript
interface WorkItemMessage {
  runId: string;
  partitionId: string;
  priceMin: number;      // Filter: dollar_value.from
  priceMax: number;      // Filter: dollar_value.to
  expectedRecords: number;
  isIncremental: boolean;
  watermarkBefore?: string;  // For incremental: updated_at filter
}
```

## Raw Diamond Storage

Inserts to `raw_diamonds_nivoda` table:

```typescript
{
  run_id: message.runId,
  supplier_stone_id: item.diamond.id,  // For deduplication
  offer_id: item.id,                   // For ordering
  source_updated_at: item.updated_at,
  payload: item,                       // Full Nivoda response
  payload_hash: sha256(JSON.stringify(item)),
  consolidated: false
}
```

**Upsert Logic:**
- Key: `supplier_stone_id` (unique constraint)
- On conflict: Update payload, payload_hash, source_updated_at

## Worker Run Tracking

Each worker creates a record in `worker_runs`:

```sql
INSERT INTO worker_runs (
  run_id,
  partition_id,
  worker_id,
  status,              -- 'running' → 'completed' or 'failed'
  records_processed,
  work_item_payload,   -- Original message (for retry)
  error_message        -- If failed
)
```

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| Nivoda API error | Retry 3 times with exponential backoff |
| Database error | Retry 3 times, then mark partition failed |
| Message expires | Moves to dead-letter queue |
| Worker crash | Message returns to queue (lock timeout) |

**On Worker Failure:**
1. Worker marks partition as `failed` in `worker_runs`
2. Increments `failed_workers` counter in `run_metadata`
3. **Consolidation is skipped** if any workers failed

## Manual Retry

Retry failed partitions from a specific run:

```bash
# Retry all failed partitions
npm run worker:retry

# Or programmatically
import { retryFailedPartitions } from './retry';
await retryFailedPartitions(runId);
```

This:
1. Queries `worker_runs` for failed partitions
2. Re-publishes original `WorkItemMessage` to queue
3. Resets worker status to 'running'

## Assumptions

1. **Nivoda pagination**: Max 50 items per request, worker uses 30
2. **Offer ID stability**: Same diamond may have different offer IDs over time
3. **Supplier stone ID**: Unique identifier for deduplication
4. **Idempotent inserts**: Re-processing same diamond updates existing record
5. **Token caching**: Nivoda token valid for 6 hours, refreshed automatically

## Monitoring

Key metrics to watch:

- **Queue depth**: Should decrease as workers process
- **Records processed**: Compare to expected from work item
- **Error rate**: Failed pages / total pages
- **Processing time**: Time to complete partition

## Debugging

```bash
# Check worker status for a run
SELECT partition_id, status, records_processed, error_message
FROM worker_runs
WHERE run_id = 'your-run-id';

# Check queue depth
az servicebus queue show \
  --name work-items \
  --namespace-name sb-diamond \
  --query 'countDetails.activeMessageCount'

# View worker logs
az containerapp logs show --name diamond-worker --resource-group rg-diamond

# Check dead-letter queue
az servicebus queue show \
  --name work-items/$deadletterqueue \
  --namespace-name sb-diamond
```

## Performance

Typical metrics:

| Metric | Value |
|--------|-------|
| API calls per partition | 100-200 |
| Records per partition | 3,000-8,000 |
| Time per partition | 3-10 minutes |
| Concurrent workers | 1-30 |
| Total ingestion time | 10-45 minutes |

---

## App: Consolidator


Data transformation service that processes raw diamonds into the canonical schema with pricing.

## Overview

The consolidator is a **long-running queue consumer** that:

1. Receives `ConsolidateMessage` from Azure Service Bus
2. Validates all workers completed successfully
3. Fetches raw diamonds with `FOR UPDATE SKIP LOCKED` (multi-replica safe)
4. Maps Nivoda payload to canonical `Diamond` schema in batches
5. Applies pricing rules from `pricing_rules` table
6. **Batch upserts** to `diamonds` table (100 diamonds per INSERT)
7. Advances watermark **only on success**

## Performance Optimizations

The consolidator is optimized for processing 500k+ records efficiently:

### Batch Upserts

Instead of individual INSERTs, diamonds are upserted in batches using PostgreSQL `UNNEST`:

```typescript
// Configuration (packages/shared/src/constants.ts)
CONSOLIDATOR_BATCH_SIZE = 2000;        // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100;  // Diamonds per batch INSERT
CONSOLIDATOR_CONCURRENCY = 2;          // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
```

**Performance comparison (500k records):**

| Approach | DB Operations | Est. Time |
|----------|---------------|-----------|
| Individual upserts | 500,000 | ~40 min |
| Batch upserts (100/batch) | 5,000 | ~2-4 min |

### Multi-Replica Support

Uses `FOR UPDATE SKIP LOCKED` for safe parallel processing:

```sql
SELECT * FROM raw_diamonds_nivoda
WHERE consolidated = FALSE
ORDER BY created_at ASC
LIMIT 2000
FOR UPDATE SKIP LOCKED;  -- Other replicas skip these rows
```

**Benefits:**
- Multiple consolidator replicas process different rows
- No duplicate processing or race conditions
- Linear scaling with replica count

## How It Works

### Consolidation Flow

```
┌─────────────────┐
│ Service Bus     │
│ consolidate     │
│ queue           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Validation      │────▶│ Check all       │
│                 │     │ workers passed  │
└────────┬────────┘     └─────────────────┘
         │
         │ if all passed
         ▼
┌─────────────────┐
│ Load pricing    │
│ rules           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Batch Processing (concurrency: 2)       │
│ ┌─────────────┐  ┌─────────────┐        │
│ │ Batch 1     │  │ Batch 2     │  ...   │
│ │ 1000 items  │  │ 1000 items  │        │
│ └──────┬──────┘  └──────┬──────┘        │
│        │                │               │
│        ▼                ▼               │
│   Map + Price      Map + Price          │
│        │                │               │
│        ▼                ▼               │
│   Upsert to        Upsert to            │
│   diamonds         diamonds             │
└────────────────────┬────────────────────┘
                     │
                     ▼
              ┌─────────────────┐
              │ Mark raw as     │
              │ consolidated    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Advance         │
              │ watermark       │
              └─────────────────┘
```

### Batch Processing

```typescript
// Configuration (from packages/shared/src/constants.ts)
CONSOLIDATOR_BATCH_SIZE = 2000;        // Raw diamonds fetched per cycle
CONSOLIDATOR_UPSERT_BATCH_SIZE = 100;  // Diamonds per batch INSERT
CONSOLIDATOR_CONCURRENCY = 2;          // Concurrent batch upserts (env: CONSOLIDATOR_CONCURRENCY)
```

**Example run (500k diamonds, 3 replicas):**
- 500,000 raw diamonds ÷ 3 replicas = ~167k per replica
- 167k ÷ 2000 batch = 84 fetch cycles per replica
- 2000 ÷ 100 = 20 batch upserts per cycle
- 20 ÷ 2 concurrency = 10 sequential rounds per cycle
- **Total: ~1-2 minutes with 3 replicas**

## Configuration

Required environment variables:

```bash
DATABASE_URL=postgresql://...
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
RESEND_API_KEY=re_...              # For failure alerts
ALERT_EMAIL_TO=alerts@example.com
ALERT_EMAIL_FROM=noreply@yourdomain.com
```

## Running

```bash
# Development (long-running)
npm run dev:consolidator

# Production
npm run build
node dist/index.js

# Manual trigger (force consolidation)
npm run consolidator:trigger
```

## Azure Deployment

Deployed as a **Container App** with Service Bus auto-scaling:

```hcl
# Scaling configuration (supports multi-replica with FOR UPDATE SKIP LOCKED)
min_replicas = 1
max_replicas = 3  # Safe with row-level locking

# Resource allocation (increased for batch operations)
cpu    = 0.5
memory = "1Gi"

# Auto-scale based on consolidate queue depth
custom_scale_rule {
  name             = "servicebus-consolidate-scale"
  custom_rule_type = "azure-servicebus"
  metadata = {
    queueName              = "consolidate"
    messageCount           = "1"
    activationMessageCount = "0"
  }
}
```

**Scaling behavior:**
- Scales up when messages arrive in `consolidate` queue
- Multiple replicas process different rows (no conflicts)
- Scales down to `min_replicas` when queue is empty

## Module Structure

```
src/
├── index.ts          # Entry point, message handler, and batch processing
├── service-bus.ts    # Service Bus message handling
├── trigger.ts        # Manual consolidation trigger
├── watermark.ts      # Watermark advancement
└── alerts.ts         # Failure notification via Resend
```

## Consolidate Message

Received from `consolidate` queue:

```typescript
interface ConsolidateMessage {
  runId: string;
  force?: boolean;  // Skip worker validation
}
```

## Transformation Logic

### Nivoda → Diamond Mapping

```typescript
// Key field mappings
{
  // Identity (CRITICAL - see CLAUDE.md)
  supplier_stone_id: item.diamond.id,  // For tracking/dedup
  offer_id: item.id,                   // For ordering/holds

  // Core attributes
  shape: item.diamond.shape,
  carats: item.diamond.carats,
  color: item.diamond.color,
  clarity: item.diamond.clarity,

  // Pricing (in dollars)
  feedPrice: item.price,

  // Availability mapping
  availability: mapAvailability(item.availability),
  // "available" | "on_hold" | "sold" | "unavailable"
}
```

### Pricing Application

```typescript
// From pricing-engine package
const engine = new PricingEngine();
await engine.loadRules();

const result = engine.calculatePricing(diamond);
// Returns:
// - priceModelPriceCents: supplier_price * markup_ratio
// - pricePerCaratCents: supplier_price / carats
// - markupRatio: from matched rule
// - rating: from matched rule (1-10)
```

## Watermark Management

**Only advanced on successful consolidation:**

```typescript
// After all batches complete successfully
await saveWatermark({
  lastUpdatedAt: new Date().toISOString(),
  lastRunId: message.runId,
  lastRunCompletedAt: new Date().toISOString()
});
```

**Location:** Azure Blob Storage `watermarks/nivoda.json`

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| Worker failures detected | Skip consolidation, log warning |
| Database error during batch | Retry batch 3 times, then fail run |
| Pricing engine error | Use default pricing (1.15x, rating 5) |
| Watermark save fails | Log error, send alert |
| Any critical failure | Send email alert via Resend |

### Failure Alerts

Sent via Resend when consolidation fails:

```typescript
{
  to: process.env.ALERT_EMAIL_TO,
  from: process.env.ALERT_EMAIL_FROM,
  subject: `Diamond Consolidation Failed - Run ${runId}`,
  html: `
    <h2>Consolidation Failure</h2>
    <p>Run ID: ${runId}</p>
    <p>Error: ${errorMessage}</p>
    <p>Time: ${new Date().toISOString()}</p>
  `
}
```

## Force Consolidation

Skip worker validation for failed runs:

```bash
# Trigger manually with force flag
npm run consolidator:trigger -- --force

# Or send message directly
{
  "runId": "your-run-id",
  "force": true
}
```

**Use cases:**
- Some workers failed but data is usable
- Need to reprocess with updated pricing rules
- Recovery after partial failure

## Assumptions

1. **Pricing rules loaded**: Rules cached in memory for batch
2. **Raw data complete**: All workers finished before consolidation
3. **Idempotent upserts**: Re-running consolidation safe
4. **Watermark atomicity**: Only one consolidator advances watermark
5. **Soft deletes**: Diamonds not in raw data marked as deleted

## Monitoring

Key metrics to watch:

- **Batch processing time**: Should be 10-50ms per batch
- **Total consolidation time**: 5-15 minutes for full inventory
- **Pricing rule matches**: % of diamonds with non-default pricing
- **Error rate**: Failed batches / total batches

## Debugging

```bash
# Check run status
SELECT * FROM run_metadata WHERE run_id = 'your-run-id';

# Check worker completion
SELECT status, COUNT(*)
FROM worker_runs
WHERE run_id = 'your-run-id'
GROUP BY status;

# Check unconsolidated raw diamonds
SELECT COUNT(*)
FROM raw_diamonds_nivoda
WHERE NOT consolidated;

# Check recent consolidations
SELECT id, created_at, updated_at
FROM diamonds
ORDER BY updated_at DESC
LIMIT 10;

# View consolidator logs
az containerapp logs show --name diamond-consolidator --resource-group rg-diamond

# Check watermark
az storage blob download \
  --container-name watermarks \
  --name nivoda.json \
  --file /dev/stdout
```

## Performance

Typical metrics (with batch optimizations):

| Metric | Single Replica | 3 Replicas |
|--------|----------------|------------|
| Records per fetch | 2,000 | 2,000 |
| Diamonds per upsert | 100 | 100 |
| DB operations (500k records) | ~5,000 | ~5,000 |
| Total consolidation time | ~4-6 min | ~1-2 min |
| Memory usage | 300-600MB | 300-600MB |

**Connection pool usage:**
- 2 concurrent batch upserts × 1 connection each = 2 connections per replica
- Concurrency should not exceed PG_POOL_MAX (default 2)

---

## Infrastructure


This directory contains Infrastructure as Code (IaC) for deploying Diamond Opus to Azure.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Azure Resource Group                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Service    │    │   Storage    │    │  Container Registry  │  │
│  │     Bus      │    │   Account    │    │        (ACR)         │  │
│  │              │    │              │    │                      │  │
│  │ - work-items │    │ - watermarks │    │ - diamond-api        │  │
│  │ - work-done  │    │   container  │    │ - diamond-worker     │  │
│  │ - consolidate│    │              │    │ - diamond-scheduler  │  │
│  └──────────────┘    └──────────────┘    │ - diamond-consolidator│ │
│                                          └──────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 Container Apps Environment                     │  │
│  │                                                                │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────┐  ┌───────────┐   │  │
│  │  │   API   │  │ Worker  │  │ Consolidator│  │ Scheduler │   │  │
│  │  │  (HTTP) │  │ (Queue) │  │   (Queue)   │  │   (Cron)  │   │  │
│  │  └─────────┘  └─────────┘  └─────────────┘  └───────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │     Supabase     │
                         │   (PostgreSQL)   │
                         └──────────────────┘
```

## Prerequisites

1. **Azure CLI** - [Install Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. **Terraform** >= 1.0 - [Install Terraform](https://learn.hashicorp.com/tutorials/terraform/install-cli)
3. **Azure Subscription** with appropriate permissions

## Quick Start

### 1. First-Time Setup (One-Time)

Bootstrap the Terraform state storage:

```bash
# Login to Azure
az login

# Run bootstrap script
./infrastructure/scripts/bootstrap-tfstate.sh
```

### 2. Deploy Infrastructure

```bash
# Deploy staging environment
./infrastructure/scripts/deploy.sh staging plan    # Preview changes
./infrastructure/scripts/deploy.sh staging apply   # Apply changes

# Deploy production environment
./infrastructure/scripts/deploy.sh prod plan
./infrastructure/scripts/deploy.sh prod apply
```

### 3. Generate .env File

```bash
# Generate .env file with connection strings
./infrastructure/scripts/generate-env.sh staging

# Copy to project root
cp .env.staging .env

# Fill in the remaining values (DATABASE_URL, NIVODA_*, etc.)
```

## Directory Structure

```
infrastructure/
├── scripts/
│   ├── bootstrap-tfstate.sh  # One-time state storage setup
│   ├── deploy.sh             # Deploy infrastructure
│   └── generate-env.sh       # Generate .env from Terraform outputs
├── terraform/
│   ├── modules/
│   │   ├── service-bus/      # Azure Service Bus namespace + queues
│   │   ├── storage/          # Azure Storage Account + containers
│   │   ├── container-registry/ # Azure Container Registry
│   │   └── container-apps/   # Container Apps Environment + apps
│   └── environments/
│       ├── staging/          # Staging environment config
│       └── prod/             # Production environment config
└── README.md
```

## Environments

| Environment | Purpose | Scaling | Redundancy |
|-------------|---------|---------|------------|
| **staging** | Development & testing | Scale to 0 | LRS storage |
| **prod** | Production workloads | Always-on | GRS storage |

## Terraform Modules

### service-bus
Creates Service Bus namespace with three queues:
- `work-items` - Scheduler sends work partitions to workers
- `work-done` - Workers report completion
- `consolidate` - Triggers consolidation process

### storage
Creates Storage Account with:
- `watermarks` container - Stores incremental sync state

### container-registry
Creates Azure Container Registry for Docker images.

### container-apps
Creates Container Apps Environment with:
- **API** - HTTP ingress, scales 1-5 replicas
- **Worker** - Service Bus consumer, scales 1-10 replicas based on `work-items` queue
- **Consolidator** - Service Bus consumer, scales 1-3 replicas based on `consolidate` queue
  - Uses `FOR UPDATE SKIP LOCKED` for safe multi-replica processing
  - Increased resources (0.5 CPU, 1Gi memory) for batch operations
- **Scheduler** - Cron job (runs at 2 AM UTC daily)
- **Dashboard** - HTTP ingress, scales 1-2 replicas

## Configuration

### Environment Variables for Terraform

Sensitive values can be provided via environment variables:

```bash
export TF_VAR_database_url="postgresql://..."
export TF_VAR_nivoda_username="user@example.com"
export TF_VAR_nivoda_password="secret"
export TF_VAR_hmac_secrets='{"shopify":"key1","internal":"key2"}'
export TF_VAR_resend_api_key="re_..."
```

### terraform.tfvars

Non-sensitive configuration is in `terraform.tfvars`:

```hcl
subscription_id = "2dade7a0-6731-4d26-ba6d-02228cccbe2d"
environment     = "staging"
location        = "australiaeast"

enable_container_apps = true  # Set to true when ready to deploy containers
```

## GitHub Actions

### Infrastructure Workflow (`.github/workflows/infrastructure.yml`)

- **On PR**: Plans changes for both staging and prod
- **On push to main**: Auto-deploys staging (if terraform files changed)
- **Manual trigger**: Deploy any environment with plan/apply
- **Image tag preservation**: Automatically gets current image tag from running containers before Terraform apply (prevents image reset)

```bash
# Manual trigger via CLI
gh workflow run "Infrastructure" -f environment=staging -f action=apply
```

### Deploy Staging Workflow (`.github/workflows/deploy-staging.yml`)

- **Triggers**: After CI passes on main, or manual dispatch
- **Builds**: Docker images with short SHA tag (e.g., `abc1234`)
- **Deploys**: Updates Container Apps via `az containerapp update`

```bash
# Manual trigger via CLI
gh workflow run "Deploy Staging" --ref main
```

### CI Workflow (`.github/workflows/ci.yml`)

- **On PR/push**: Build, test, type-check

### Deployment Flow

```
Code changes → deploy-staging.yml → builds images, updates containers
Terraform changes → infrastructure.yml → applies infra, preserves image tags
```

**Important**: Infrastructure workflow preserves image tags by:
1. Querying current deployed image tag from Container Apps
2. Passing it to Terraform via `-var="image_tag=..."`
3. This prevents Terraform from resetting images to default tags

### Required Secrets

Configure these in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CREDENTIALS` | JSON credentials for `azure/login` action |
| `ACR_LOGIN_SERVER` | ACR login server URL |
| `ACR_USERNAME` | ACR admin username |
| `ACR_PASSWORD` | ACR admin password |

### Creating a Service Principal

```bash
# Create service principal with Contributor role
az ad sp create-for-rbac \
  --name "diamond-opus-github" \
  --role Contributor \
  --scopes /subscriptions/2dade7a0-6731-4d26-ba6d-02228cccbe2d \
  --sdk-auth

# Output JSON goes into AZURE_CREDENTIALS secret
# Also extract individual values for ARM_* secrets
```

## Phased Deployment

### Phase 1: Core Infrastructure (Recommended First)

Deploy just messaging and storage (no containers):

```hcl
# In terraform.tfvars
enable_container_apps = false
```

This creates:
- Service Bus namespace + queues
- Storage Account + watermarks container
- Container Registry

You can run the application locally with these Azure resources.

### Phase 2: Container Apps

When ready to deploy containers:

```hcl
# In terraform.tfvars
enable_container_apps = true
```

Ensure Docker images are pushed to ACR first:

```bash
# Build and push images
docker build -t diamondstagingacr.azurecr.io/diamond-api:latest -f docker/Dockerfile.api .
az acr login --name diamondstagingacr
docker push diamondstagingacr.azurecr.io/diamond-api:latest
# Repeat for other images...
```

## Common Operations

### Get Connection Strings

```bash
cd infrastructure/terraform/environments/staging

# Service Bus
terraform output -raw service_bus_connection_string

# Storage
terraform output -raw storage_connection_string

# Container Registry
terraform output -raw container_registry_login_server
terraform output -raw container_registry_admin_username
terraform output -raw container_registry_admin_password
```

### View Terraform State

```bash
cd infrastructure/terraform/environments/staging
terraform state list
terraform state show module.service_bus.azurerm_servicebus_namespace.main
```

### Destroy Environment

```bash
./infrastructure/scripts/deploy.sh staging destroy
```

## Troubleshooting

### "Backend configuration changed"

Run `terraform init -reconfigure` to update backend configuration.

### "Resource already exists"

If resources were created manually, import them:

```bash
terraform import module.service_bus.azurerm_servicebus_namespace.main \
  /subscriptions/.../resourceGroups/.../providers/Microsoft.ServiceBus/namespaces/...
```

### "Permission denied"

Ensure your Azure account has Contributor access to the subscription.

## Cost Estimation

| Resource | Staging (Monthly) | Production (Monthly) |
|----------|-------------------|----------------------|
| Service Bus Standard | ~$10 | ~$10 |
| Storage Account LRS/GRS | ~$1-5 | ~$5-15 |
| Container Registry Basic/Standard | ~$5 | ~$20 |
| Container Apps | ~$0-50 (scale to 0) | ~$50-200 |
| **Total** | **~$15-70** | **~$85-245** |

*Estimates vary based on usage. Container Apps can scale to zero in staging.*

---

## Terraform Configuration


This directory contains the Terraform infrastructure-as-code for the Diamond Platform, organized into environments and reusable modules.

## Directory Structure

```
terraform/
├── environments/
│   ├── prod/                 # Production environment
│   │   ├── main.tf           # Resource instantiation
│   │   ├── variables.tf      # Variable declarations
│   │   ├── outputs.tf        # Output definitions
│   │   └── terraform.tfvars  # Configuration template
│   └── staging/              # Staging environment
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── terraform.tfvars
└── modules/
    ├── container-apps/       # Container Apps (API, workers, scheduler, dashboard)
    ├── container-registry/   # Azure Container Registry
    ├── service-bus/          # Azure Service Bus
    └── storage/              # Azure Storage Account
```

## Setup

### Initial Configuration

1. **Copy the terraform.tfvars template** to a local file:
   ```bash
   cd environments/staging  # or prod
   cp terraform.tfvars terraform.tfvars.local
   ```

2. **Fill in sensitive values** in `terraform.tfvars.local`:
   ```hcl
   database_password = "your-actual-password"
   nivoda_username   = "your-nivoda-username"
   nivoda_password   = "your-nivoda-password"
   hmac_secrets      = "{\"client1\":\"secret1\"}"
   resend_api_key    = "re_xxxxxxxxxxxx"
   alert_email_to    = "alerts@yourdomain.com"
   alert_email_from  = "noreply@yourdomain.com"
   ```

3. **Or use environment variables**:
   ```bash
   export TF_VAR_database_password="your-actual-password"
   export TF_VAR_nivoda_username="your-nivoda-username"
   export TF_VAR_nivoda_password="your-nivoda-password"
   export TF_VAR_hmac_secrets='{"client1":"secret1"}'
   export TF_VAR_resend_api_key="re_xxxxxxxxxxxx"
   ```

### Terraform Commands

```bash
# Initialize Terraform (first time or after adding modules)
terraform init

# Format Terraform files
terraform fmt -recursive

# Validate configuration
terraform validate

# Plan changes
terraform plan

# Apply changes
terraform apply

# Destroy resources (use with caution!)
terraform destroy
```

## Sensitive Variables

**NEVER commit these values to git:**
- `database_password` - PostgreSQL password
- `database_username` - PostgreSQL username (contains project ID)
- `nivoda_username` - Nivoda API username
- `nivoda_password` - Nivoda API password
- `hmac_secrets` - JSON object of HMAC client secrets
- `resend_api_key` - Resend API key for email alerts

**Always use:**
- `terraform.tfvars.local` (gitignored) for local development
- Environment variables (`TF_VAR_*`) for CI/CD pipelines
- Azure Key Vault references (future enhancement)

## Variable Organization

Variables are organized into logical sections:

1. **Core Configuration** - Subscription, environment, location, image tags
2. **Infrastructure SKUs** - Service Bus, Storage, Container Registry tiers
3. **Database Configuration** - Supabase connection details
4. **External APIs** - Nivoda, Resend, HMAC secrets
5. **Scheduler Configuration** - Cron expression, parallelism
6. **Container Resources** - CPU/memory allocation per container type
7. **Scaling Configuration** - Min/max replicas for each service
8. **Observability** - Log Analytics retention

## Environment Differences

### Staging
- **Purpose**: Testing and development
- **SKUs**: Basic/Standard (cost-optimized)
- **Storage**: LRS (locally redundant)
- **Scaling**: Min replicas = 0 (scales to zero when idle)
- **Scheduler**: Disabled by default (Feb 31st cron), manual triggers only
- **Log retention**: 7 days

### Production
- **Purpose**: Live production workload
- **SKUs**: Standard (production-grade)
- **Storage**: GRS (geo-redundant) with versioning enabled
- **Scaling**: Min replicas >= 1 (always available)
- **Scheduler**: Runs daily at 2 AM UTC
- **Log retention**: 30 days

## Module Overview

### Container Apps (`modules/container-apps`)
Creates Azure Container Apps Environment and deploys:
- **API** - REST API (external ingress, manual scaling)
- **Worker** - Nivoda data ingestion (KEDA autoscaling on Service Bus queue)
- **Consolidator** - Data consolidation (KEDA autoscaling on Service Bus queue)
- **Scheduler** - Scheduled job (cron-based execution)
- **Dashboard** - React dashboard (external ingress, manual scaling)

### Service Bus (`modules/service-bus`)
Creates Azure Service Bus with queues:
- `work-items` - Worker job queue
- `work-done` - Worker completion notifications
- `consolidate` - Consolidation trigger queue

### Storage (`modules/storage`)
Creates Azure Storage Account with:
- `watermarks` container - Scheduler watermark tracking
- Blob versioning (optional, production only)
- TLS 1.2+ enforcement

### Container Registry (`modules/container-registry`)
Creates Azure Container Registry for Docker images:
- Admin credentials enabled
- Supports Basic, Standard, Premium SKUs

## Common Tasks

### Deploy a New Environment

```bash
# 1. Navigate to environment
cd environments/staging

# 2. Initialize Terraform
terraform init

# 3. Create terraform.tfvars.local with sensitive values
cp terraform.tfvars terraform.tfvars.local
# Edit terraform.tfvars.local with your secrets

# 4. Review the plan
terraform plan

# 5. Apply if plan looks good
terraform apply
```

### Update Container Image Tags

```bash
# Update image_tag in terraform.tfvars or terraform.tfvars.local
image_tag = "abc123def"  # New commit SHA

terraform apply
```

### Scale Resources

```bash
# Update scaling variables in terraform.tfvars.local
worker_max_replicas = 10

terraform apply
```

### Change Scheduler Schedule

```bash
# Update cron expression in terraform.tfvars.local
scheduler_cron_expression = "0 3 * * *"  # 3 AM daily

terraform apply
```

## Validation Rules

Terraform validates input values with these rules:

- **SKUs**: Must be valid Azure SKU names (Basic, Standard, Premium)
- **Replica counts**: Min >= 0, Max >= Min
- **Consolidator max replicas**: Recommended <= 3 (per CLAUDE.md)
- **Log retention**: 7-730 days (Azure limits)
- **Scheduler parallelism**: >= 1

## Troubleshooting

### Runtime Environment Variable Errors

If containers report missing environment variables (e.g., `AZURE_STORAGE_CONNECTION_STRING`):

1. **Force container restart** after terraform apply:
   ```bash
   az containerapp revision restart \
     --name diamond-staging-api \
     --resource-group diamond-staging-rg
   ```

2. **Recreate affected resources**:
   ```bash
   terraform taint 'module.container_apps[0].azurerm_container_app_job.scheduler[0]'
   terraform apply
   ```

3. **Verify secrets in Azure**:
   ```bash
   az containerapp show \
     --name diamond-staging-api \
     --resource-group diamond-staging-rg \
     --query "properties.template.containers[0].env"
   ```

**Note**: Environment variables are correctly configured in Terraform. Runtime errors typically indicate containers need restart or terraform state drift.

### State File Issues

```bash
# Refresh state from Azure
terraform refresh

# Import existing resource
terraform import azurerm_resource_group.main /subscriptions/.../resourceGroups/...
```

### Validation Errors

```bash
# Check which validation failed
terraform validate

# Fix the invalid value in terraform.tfvars.local
# Then run terraform plan again
```

## Security Best Practices

1. **Never commit** `terraform.tfvars.local` or files with secrets
2. **Use `.gitignore`** to prevent accidental commits (already configured)
3. **Rotate secrets** regularly (database passwords, API keys)
4. **Use environment variables** in CI/CD instead of committed files
5. **Enable MFA** on Azure accounts with Terraform access
6. **Review terraform plan** output before applying changes
7. **Use separate Azure subscriptions** for staging and production (optional)

## CI/CD Integration

GitHub Actions workflow pattern:

```yaml
- name: Terraform Plan
  env:
    TF_VAR_database_password: ${{ secrets.DB_PASSWORD }}
    TF_VAR_nivoda_username: ${{ secrets.NIVODA_USERNAME }}
    TF_VAR_nivoda_password: ${{ secrets.NIVODA_PASSWORD }}
    TF_VAR_hmac_secrets: ${{ secrets.HMAC_SECRETS }}
    TF_VAR_resend_api_key: ${{ secrets.RESEND_API_KEY }}
    TF_VAR_environment_tag: ${{ secrets.ENVIRONMENT_TAG }}
  run: terraform plan

- name: Terraform Apply
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve
```

## Additional Resources

- [Azure Container Apps Documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Terraform Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [CLAUDE.md](../../CLAUDE.md) - Project-specific architecture and conventions

---

## Docker


Multi-stage Dockerfiles for production deployment.

## Overview

This directory contains optimized Dockerfiles for all Diamond Opus services:

- `Dockerfile.api` - REST API service
- `Dockerfile.scheduler` - Batch job scheduler
- `Dockerfile.worker` - Queue consumer for data ingestion
- `Dockerfile.consolidator` - Queue consumer for transformation
- `Dockerfile.dashboard` - React admin dashboard (nginx-served)

## Build Strategy

All Dockerfiles use a **multi-stage build** for minimal production images:

```
┌─────────────────────────────────────────────┐
│ Stage 1: Builder (~800MB)                   │
├─────────────────────────────────────────────┤
│ - Node.js 20 Alpine                         │
│ - Install ALL dependencies (including dev) │
│ - Build TypeScript → JavaScript             │
│ - Compile all packages                      │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Stage 2: Runtime (~150-200MB)               │
├─────────────────────────────────────────────┤
│ - Node.js 20 Alpine                         │
│ - Copy only dist/ directories              │
│ - Install production dependencies only     │
│ - No dev tools, no TypeScript              │
└─────────────────────────────────────────────┘
```

## Building Images

### Build All

```bash
# From repository root
docker build -f docker/Dockerfile.api -t diamond-api .
docker build -f docker/Dockerfile.scheduler -t diamond-scheduler .
docker build -f docker/Dockerfile.worker -t diamond-worker .
docker build -f docker/Dockerfile.consolidator -t diamond-consolidator .
docker build -f docker/Dockerfile.dashboard -t diamond-dashboard .
```

### Build with Tags

```bash
# With version tag
docker build -f docker/Dockerfile.api -t diamond-api:1.0.0 .

# With registry prefix
docker build -f docker/Dockerfile.api -t crdiamondprod.azurecr.io/diamond-api:latest .
```

### Build Arguments

```bash
# Production build
docker build -f docker/Dockerfile.api \
  --build-arg NODE_ENV=production \
  -t diamond-api:prod .
```

## Dockerfile Details

### Dockerfile.api

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/database/package*.json ./packages/database/
COPY packages/nivoda/package*.json ./packages/nivoda/
COPY packages/api/package*.json ./packages/api/
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/packages/*/package.json ./packages/
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
```

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda
- @diamond/api

### Dockerfile.scheduler

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda

**Entry point:** `apps/scheduler/dist/index.js`

### Dockerfile.worker

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda

**Entry point:** `apps/worker/dist/index.js`

### Dockerfile.consolidator

**Includes packages:**
- @diamond/shared
- @diamond/database
- @diamond/nivoda
- @diamond/pricing-engine

**Entry point:** `apps/consolidator/dist/index.js`

### Dockerfile.dashboard

**Two-stage build:**
1. Node.js Alpine - builds Vite/React app
2. nginx Alpine - serves static files

**Entry point:** nginx serving `/usr/share/nginx/html`

**Port:** 80

Uses `nginx.dashboard.conf` for:
- SPA routing (all routes → index.html)
- API proxy to backend (`/api/` → `http://api:3000/api/`)
- Static asset caching

## Image Sizes

| Image | Size |
|-------|------|
| diamond-api | ~180MB |
| diamond-scheduler | ~150MB |
| diamond-worker | ~150MB |
| diamond-consolidator | ~160MB |
| diamond-dashboard | ~25MB |

## Running Locally

### With Docker Compose (Recommended)

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "3000:3000"
    env_file:
      - .env.local

  worker:
    build:
      context: .
      dockerfile: docker/Dockerfile.worker
    env_file:
      - .env.local

  consolidator:
    build:
      context: .
      dockerfile: docker/Dockerfile.consolidator
    env_file:
      - .env.local

  dashboard:
    build:
      context: .
      dockerfile: docker/Dockerfile.dashboard
    ports:
      - "8080:80"
    depends_on:
      - api
```

```bash
docker-compose up --build
```

### Standalone

```bash
# API
docker run -p 3000:3000 \
  -e DATABASE_URL="..." \
  -e HMAC_SECRETS='{}' \
  diamond-api

# Worker
docker run \
  -e DATABASE_URL="..." \
  -e AZURE_SERVICE_BUS_CONNECTION_STRING="..." \
  -e NIVODA_ENDPOINT="..." \
  -e NIVODA_USERNAME="..." \
  -e NIVODA_PASSWORD="..." \
  diamond-worker
```

## Pushing to Registry

### Azure Container Registry

```bash
# Login
az acr login --name crdiamondprod

# Tag
docker tag diamond-api crdiamondprod.azurecr.io/diamond-api:latest
docker tag diamond-api crdiamondprod.azurecr.io/diamond-api:$(git rev-parse --short HEAD)

# Push
docker push crdiamondprod.azurecr.io/diamond-api:latest
docker push crdiamondprod.azurecr.io/diamond-api:$(git rev-parse --short HEAD)
```

### GitHub Container Registry

```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag and push
docker tag diamond-api ghcr.io/org/diamond-api:latest
docker push ghcr.io/org/diamond-api:latest
```

## Optimization Tips

### Layer Caching

Dockerfiles are structured for optimal layer caching:

1. Copy package.json files first (changes rarely)
2. Run `npm ci` (cached if package.json unchanged)
3. Copy source files last (changes frequently)

### .dockerignore

Ensure `.dockerignore` excludes:

```
node_modules
dist
*.log
.git
.env*
coverage
```

### BuildKit

Enable BuildKit for faster builds:

```bash
DOCKER_BUILDKIT=1 docker build ...
```

## Health Checks

### API Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

### Worker/Consolidator

No HTTP endpoint - rely on Container Apps liveness probes.

## Security

1. **Non-root user**: Consider adding `USER node` in runtime stage
2. **Minimal base**: Alpine Linux reduces attack surface
3. **No secrets in image**: All secrets via environment variables
4. **Layer scanning**: Use `docker scan` or Azure Defender

## Debugging

### Shell into container

```bash
docker run -it --entrypoint /bin/sh diamond-api
```

### View logs

```bash
docker logs <container-id>
docker logs -f <container-id>  # Follow
```

### Inspect image

```bash
docker inspect diamond-api
docker history diamond-api
```

---

## SQL Schema


Database schema and migrations for Supabase PostgreSQL.

## Overview

This directory contains:

- `bootstrap.sql` - Complete database schema for fresh installations
- `migrations/` - Incremental schema changes

## Schema Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Database Schema                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ api_keys        │     │ pricing_rules   │               │
│  │ (authentication)│     │ (markup config) │               │
│  └─────────────────┘     └─────────────────┘               │
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ run_metadata    │────▶│ worker_runs     │               │
│  │ (batch tracking)│     │ (per-partition) │               │
│  └─────────────────┘     └─────────────────┘               │
│                                                             │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ raw_diamonds_   │────▶│ diamonds        │               │
│  │ nivoda          │     │ (canonical)     │               │
│  │ (staging)       │     │                 │               │
│  └─────────────────┘     └────────┬────────┘               │
│                                   │                         │
│                    ┌──────────────┴──────────────┐         │
│                    │                             │         │
│              ┌─────▼─────┐               ┌──────▼──────┐   │
│              │hold_history│               │purchase_    │   │
│              │            │               │history      │   │
│              └────────────┘               └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Tables

### api_keys

Stores hashed API keys for REST API authentication.

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,      -- SHA256 hash of API key
  client_name TEXT NOT NULL,          -- Human-readable identifier
  permissions TEXT[] DEFAULT '{}',    -- Future: fine-grained permissions
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
```

**Usage:**
- API key is SHA256 hashed before comparison
- `last_used_at` updated on each successful auth
- Inactive keys (`active = false`) are rejected

### raw_diamonds_nivoda

Staging table for raw Nivoda API responses.

```sql
CREATE TABLE raw_diamonds_nivoda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,               -- Links to run_metadata
  supplier_stone_id TEXT NOT NULL,    -- diamond.id from Nivoda
  offer_id TEXT NOT NULL,             -- item.id from Nivoda
  source_updated_at TIMESTAMPTZ,      -- Nivoda updated_at
  payload JSONB NOT NULL,             -- Full API response
  payload_hash TEXT NOT NULL,         -- SHA256 for change detection
  consolidated BOOLEAN DEFAULT FALSE, -- Processed by consolidator
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_stone_id)
);
```

**Key points:**
- `supplier_stone_id` is the unique identifier (not offer_id)
- `payload` contains complete Nivoda response for audit trail
- `consolidated` flag prevents re-processing

### diamonds

Canonical diamond inventory table.

```sql
CREATE TABLE diamonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  feed TEXT NOT NULL DEFAULT 'nivoda',
  supplier_stone_id TEXT NOT NULL,    -- Unique per feed (Nivoda diamond.id)
  offer_id TEXT NOT NULL,             -- For ordering operations

  -- Core Attributes
  shape TEXT NOT NULL,
  carats DECIMAL(6,2) NOT NULL,
  color TEXT NOT NULL,
  clarity TEXT NOT NULL,
  cut TEXT,
  polish TEXT,
  symmetry TEXT,
  fluorescence TEXT,

  -- Type Flags
  lab_grown BOOLEAN DEFAULT FALSE,
  treated BOOLEAN DEFAULT FALSE,

  -- Pricing (dollars as decimals)
  feed_price DECIMAL(12,2) NOT NULL,
  price_per_carat DECIMAL(12,2) NOT NULL,
  price_model_price DECIMAL(12,2),          -- feed_price * markup
  markup_ratio DECIMAL(5,4),           -- e.g., 1.1500
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Availability
  availability TEXT NOT NULL,          -- available|on_hold|sold|unavailable
  raw_availability TEXT,               -- Original Nivoda value
  hold_id TEXT,

  -- Media
  image_url TEXT,
  video_url TEXT,

  -- Certificate
  certificate_lab TEXT,
  certificate_number TEXT,
  certificate_pdf_url TEXT,

  -- Measurements & Attributes (flexible JSONB)
  measurements JSONB,    -- length, width, depth, angles
  attributes JSONB,      -- eyeClean, tint, comments

  -- Supplier Details
  supplier_name TEXT,
  supplier_legal_name TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'active',        -- active|deleted
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(feed, supplier_stone_id)
);
```

**Key points:**
- All prices in **dollars** as DECIMAL(12,2)
- Soft deletes via `status = 'deleted'` and `deleted_at`
- Composite unique on `(feed, supplier_stone_id)`

### pricing_rules

Database-driven pricing configuration.

```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,  -- Lower = higher priority

  -- Match Criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],                          -- Array of shapes
  lab_grown BOOLEAN,
  feed TEXT,

  -- Outputs
  markup_ratio DECIMAL(5,4) NOT NULL,     -- e.g., 1.1500 = 15%
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Lifecycle
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default rule (always matches)
INSERT INTO pricing_rules (priority, markup_ratio, rating)
VALUES (1000, 1.15, 5);
```

**Matching logic:**
1. Rules sorted by priority ascending
2. First matching rule wins
3. All non-NULL criteria must match
4. Default rule (priority 1000) catches everything

### run_metadata

Tracks batch pipeline executions.

```sql
CREATE TABLE run_metadata (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,              -- 'full' or 'incremental'
  expected_workers INTEGER NOT NULL,
  completed_workers INTEGER DEFAULT 0, -- Atomic counter
  failed_workers INTEGER DEFAULT 0,    -- Atomic counter
  watermark_before TIMESTAMPTZ,        -- For incremental
  watermark_after TIMESTAMPTZ,         -- Set on completion
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**Atomic counter pattern:**
```sql
UPDATE run_metadata
SET completed_workers = completed_workers + 1
WHERE run_id = $1
RETURNING completed_workers, expected_workers;
```

### worker_runs

Individual worker execution records.

```sql
CREATE TABLE worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  worker_id UUID NOT NULL,
  status TEXT NOT NULL,                -- running|completed|failed
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  work_item_payload JSONB,             -- For retry capability
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(run_id, partition_id)
);
```

### hold_history / purchase_history

Track diamond operations.

```sql
CREATE TABLE hold_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  feed TEXT NOT NULL,
  feed_hold_id TEXT,
  offer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  denied BOOLEAN DEFAULT FALSE,
  hold_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  feed TEXT NOT NULL,
  feed_order_id TEXT,
  offer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,  -- Prevents duplicate orders
  status TEXT NOT NULL,
  reference TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Indexes

### Search Optimization

```sql
-- Composite search (shape, carats, color, clarity)
CREATE INDEX idx_diamonds_search ON diamonds(shape, carats, color, clarity)
  WHERE status = 'active';

-- Price filtering
CREATE INDEX idx_diamonds_price ON diamonds(feed_price)
  WHERE status = 'active';

-- Common filters
CREATE INDEX idx_diamonds_lab_grown ON diamonds(lab_grown) WHERE status = 'active';
CREATE INDEX idx_diamonds_cut ON diamonds(cut) WHERE status = 'active';
CREATE INDEX idx_diamonds_carats ON diamonds(carats) WHERE status = 'active';
```

### Pipeline Optimization

```sql
-- Consolidator: find unconsolidated records
CREATE INDEX idx_raw_nivoda_unconsolidated_created
  ON raw_diamonds_nivoda(created_at ASC) WHERE NOT consolidated;

-- Worker tracking
CREATE INDEX idx_worker_runs_status ON worker_runs(run_id, status);
```

## Installation

### Fresh Database

1. Open Supabase SQL Editor
2. Copy contents of `bootstrap.sql`
3. Execute

### Migrations

Run migrations in order:

```sql
-- Check current state
SELECT * FROM schema_migrations;

-- Apply migration
\i migrations/001_add_indexes.sql
```

## Common Queries

### Search diamonds

```sql
SELECT * FROM diamonds
WHERE status = 'active'
  AND shape = 'ROUND'
  AND carats BETWEEN 1.0 AND 2.0
  AND feed_price BETWEEN 1000 AND 5000
ORDER BY feed_price ASC
LIMIT 50;
```

### Check run status

```sql
SELECT
  rm.run_id,
  rm.run_type,
  rm.expected_workers,
  rm.completed_workers,
  rm.failed_workers,
  rm.completed_at
FROM run_metadata rm
ORDER BY started_at DESC
LIMIT 5;
```

### Pricing rule audit

```sql
SELECT
  d.shape,
  d.carats,
  d.lab_grown,
  d.feed_price,
  d.price_model_price,
  d.markup_ratio,
  d.rating
FROM diamonds d
WHERE d.status = 'active'
ORDER BY d.created_at DESC
LIMIT 10;
```

## Assumptions

1. **Supabase PostgreSQL**: No local Postgres setup
2. **UTC timestamps**: All `TIMESTAMPTZ` in UTC
3. **Dollars for money**: DECIMAL(12,2) provides sufficient precision
4. **Soft deletes**: Never hard delete diamonds
5. **UUID primary keys**: No sequential IDs exposed

## Migrations

### Creating a new migration

```sql
-- migrations/002_description.sql
-- Description of changes

BEGIN;

-- Make changes
ALTER TABLE diamonds ADD COLUMN new_column TEXT;

-- Record migration
INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Add new_column to diamonds');

COMMIT;
```

### Rollback

```sql
-- migrations/002_description_rollback.sql
BEGIN;

ALTER TABLE diamonds DROP COLUMN new_column;

DELETE FROM schema_migrations WHERE version = '002';

COMMIT;
```

---

## GitHub Secrets Checklist


This document lists all GitHub secrets required for the CI/CD pipeline to function correctly.

## How Secrets Flow Through the System

```
GitHub Secrets
     │
     ▼
GitHub Actions Workflow (TF_VAR_* env vars)
     │
     ▼
Terraform Variables
     │
     ▼
Azure Container Apps (container environment variables)
     │
     ▼
Application Code (requireEnv / optionalEnv)
```

**Important:** Some environment variables are auto-generated by Terraform from Azure resources:
- `AZURE_STORAGE_CONNECTION_STRING` - from Storage Account resource
- `AZURE_SERVICE_BUS_CONNECTION_STRING` - from Service Bus resource

These do NOT need GitHub Secrets - Terraform creates them automatically.

## Required Secrets

Configure these in: **GitHub Repository Settings > Secrets and variables > Actions**

For environment-specific secrets, configure in the `staging` environment.

### Azure Authentication (4 secrets)

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `AZURE_CLIENT_ID` | Azure Service Principal Client ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `AZURE_CLIENT_SECRET` | Azure Service Principal Client Secret | (secure string) |
| `AZURE_TENANT_ID` | Azure Active Directory Tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `AZURE_SUBSCRIPTION_ID` | Azure Subscription ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### Azure Container Registry (3 secrets)

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `ACR_LOGIN_SERVER` | Container Registry login server | `diamondstagingacr.azurecr.io` |
| `ACR_USERNAME` | Container Registry admin username | `diamondstagingacr` |
| `ACR_PASSWORD` | Container Registry admin password | (secure string) |

### Application Configuration (3 secrets)

| Secret Name | Description | TF Variable | Used By |
|-------------|-------------|-------------|---------|
| `ENVIRONMENT_TAG` | Stable environment tag for scheduler | `environment_tag` | Scheduler job |
| `NIVODA_USERNAME` | Nivoda API username (email) | `nivoda_username` | Worker, Scheduler |
| `NIVODA_PASSWORD` | Nivoda API password | `nivoda_password` | Worker, Scheduler |

### Email Alerts (3 secrets)

| Secret Name | Description | TF Variable | Used By |
|-------------|-------------|-------------|---------|
| `RESEND_API_KEY` | Resend API key for email alerts | `resend_api_key` | Consolidator |
| `ALERT_EMAIL_TO` | Email address for receiving alerts | `alert_email_to` | Consolidator |
| `ALERT_EMAIL_FROM` | Email address for sending alerts | `alert_email_from` | Consolidator |

### Database Configuration (3 secrets)

| Secret Name | Description | TF Variable | Used By |
|-------------|-------------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host (Supabase pooler) | `database_host` | All apps |
| `DATABASE_USERNAME` | PostgreSQL username | `database_username` | All apps |
| `DATABASE_PASSWORD` | PostgreSQL password | `database_password` | All apps |

### API Authentication (1 secret)

| Secret Name | Description | TF Variable | Used By |
|-------------|-------------|-------------|---------|
| `HMAC_SECRETS` | JSON object of HMAC client secrets | `hmac_secrets` | API |

## Total: 17 Secrets

## Environment Variables by Container

### API Container
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `AZURE_STORAGE_CONNECTION_STRING` (auto from Terraform)
- `AZURE_SERVICE_BUS_CONNECTION_STRING` (auto from Terraform)
- `HMAC_SECRETS`
- `NIVODA_ENDPOINT`, `NIVODA_USERNAME`, `NIVODA_PASSWORD`
- `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_SCHEDULER_JOB_NAME`

### Worker Container
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `AZURE_STORAGE_CONNECTION_STRING` (auto from Terraform)
- `AZURE_SERVICE_BUS_CONNECTION_STRING` (auto from Terraform)
- `NIVODA_ENDPOINT`, `NIVODA_USERNAME`, `NIVODA_PASSWORD`

### Consolidator Container
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `AZURE_STORAGE_CONNECTION_STRING` (auto from Terraform)
- `AZURE_SERVICE_BUS_CONNECTION_STRING` (auto from Terraform)
- `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`

### Scheduler Job
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `AZURE_STORAGE_CONNECTION_STRING` (auto from Terraform)
- `AZURE_SERVICE_BUS_CONNECTION_STRING` (auto from Terraform)
- `NIVODA_ENDPOINT`, `NIVODA_USERNAME`, `NIVODA_PASSWORD`

## Environment-Specific Configuration

For production deployment, you'll need to create a separate GitHub Environment called `prod` with its own set of secrets (or override the staging environment secrets if using a single environment).

### Staging vs Production Differences

| Secret | Staging Value | Production Value |
|--------|---------------|------------------|
| `ENVIRONMENT_TAG` | `staging` | `prod` |
| `ACR_LOGIN_SERVER` | `diamondstagingacr.azurecr.io` | `diamondprodacr.azurecr.io` |
| `NIVODA_USERNAME` | staging Nivoda account | production Nivoda account |
| `DATABASE_HOST` | staging Supabase pooler | production Supabase pooler |
| `DATABASE_USERNAME` | staging database user | production database user |
| `DATABASE_PASSWORD` | staging database password | production database password |

## Validation

After configuring secrets, the workflow includes a debug step that validates the presence of critical secrets:

```yaml
- name: Debug staging secrets present
  run: |
    [ -n "${{ secrets.ACR_LOGIN_SERVER }}" ] && echo "ACR_LOGIN_SERVER ok" || (echo "ACR_LOGIN_SERVER missing" && exit 1)
    ...
```

## Security Notes

1. **Never commit secrets to the repository** - Always use GitHub Secrets
2. **Rotate secrets regularly** - Especially after team member departures
3. **Use least-privilege principle** - Service principals should have minimal required permissions
4. **Monitor secret access** - GitHub provides audit logs for secret access
5. **HMAC_SECRETS format** - Must be valid JSON: `{"clientId":"secretValue"}`

## Obtaining Values

### Azure Credentials
```bash
# Create Service Principal with Contributor role
az ad sp create-for-rbac --name "diamond-github-actions" \
  --role Contributor \
  --scopes /subscriptions/<subscription-id>
```

### ACR Credentials
```bash
# Get ACR admin credentials
az acr credential show --name <acr-name>
```

### Resend API Key
1. Sign up at https://resend.com
2. Create an API key in the dashboard
3. Verify your sending domain

### Supabase Database
1. Go to Supabase Dashboard > Project Settings > Database
2. Find the connection string under "Connection Pooling"
3. Extract host, username, and password

---

## TODO / Future Enhancements


This document tracks areas for improvement and future enhancements.

## High Priority

### API Security

- [ ] **Add rate limiting** - Implement IP-based or API-key-based rate limiting to prevent abuse
  - Rate limit constants already exist in `packages/shared/src/constants.ts`
  - Need to wire up middleware in `packages/api/src/middleware/`
  - Consider using `express-rate-limit` package
  - Different limits for search vs. mutation operations

- [ ] **Strengthen request validation** - More comprehensive input validation
  - Zod schemas exist but could be more comprehensive
  - Validate diamond IDs are valid UUIDs
  - Location: `packages/api/src/validators/`

### Pipeline Reliability

- [ ] **Automatic worker retry** - Implement automatic retry for transient failures
  - Currently requires manual `npm run worker:retry`
  - Add exponential backoff with max attempts
  - Consider dead-letter queue processing automation
  - Location: `apps/worker/src/`

- [ ] **Consolidator timeout handling** - Add timeout for long-running consolidations
  - Large batches could exceed container timeouts
  - Implement checkpointing for recovery
  - Location: `apps/consolidator/src/`

### Monitoring & Observability

- [ ] **Add metrics collection** - Implement Prometheus metrics
  - Pipeline throughput (diamonds/second)
  - Worker success/failure rates
  - API latency percentiles
  - Queue depths

- [ ] **Add distributed tracing** - Implement OpenTelemetry
  - Trace requests across scheduler → worker → consolidator
  - Integrate with Azure Application Insights
  - Location: `packages/shared/src/`

- [ ] **Expand alerting beyond email** - Additional notification channels
  - Slack/Teams integration for failures
  - PagerDuty for critical issues

## Medium Priority

### Performance Optimizations

- [ ] **Heatmap caching** - Cache density scans for incremental runs
  - Store heatmap results in blob storage
  - Reduce API calls on incremental runs
  - Location: `apps/scheduler/src/heatmap.ts`

- [ ] **Auto-tune consolidator concurrency** - Dynamic based on system load
  - Currently configurable via `CONSOLIDATOR_CONCURRENCY` env var (default 2)
  - Monitor CPU/memory and adjust dynamically

### Code Quality

- [ ] **Increase test coverage** - Add integration tests
  - End-to-end pipeline tests with mocked Nivoda
  - API integration tests with test database
  - Load testing for heatmap scanner

- [ ] **Add load testing** - Performance baseline
  - Measure heatmap scanning time
  - Worker throughput under load
  - API response times at scale

- [ ] **Improve error messages** - More actionable error responses
  - Include troubleshooting hints
  - Link to documentation
  - Location: `packages/api/src/middleware/error-handler.ts`

### Feature Additions

- [ ] **Price history tracking** - Track price changes over time
  - Store historical prices in separate table
  - API endpoint for price trends
  - Useful for analytics

- [ ] **Webhook notifications** - Notify clients of inventory changes
  - Register webhook URLs per API client
  - Push notifications on diamond availability changes

- [ ] **GraphQL API** - Alternative to REST
  - More flexible queries for clients
  - Reduce over-fetching
  - Could coexist with REST

## Low Priority

### Developer Experience

- [ ] **Local development setup** - Docker Compose for full stack
  - Local Service Bus emulator (Azurite)
  - Local PostgreSQL option
  - One-command startup

- [ ] **API SDK generation** - Auto-generate client libraries
  - TypeScript SDK from OpenAPI spec
  - Python client

### Infrastructure

- [ ] **Multi-region deployment** - Geo-redundancy
  - Active-passive failover
  - Database replication

- [ ] **Secrets management** - Azure Key Vault integration
  - Remove secrets from environment variables
  - Managed identity authentication
  - Secret rotation

### Maintenance

- [ ] **Database cleanup job** - Remove old data
  - Archive old raw_diamonds_nivoda records
  - Purge soft-deleted diamonds after retention period
  - Scheduled Azure Function or Container Job

- [ ] **Log retention policy** - Manage log storage
  - Configure Log Analytics retention
  - Archive old logs to cold storage

## Technical Debt

- [ ] **Centralize error handling** - Consistent error types
  - Create custom error classes
  - Standardize error codes across packages
  - Location: `packages/shared/src/`

- [ ] **Type safety improvements** - Stricter TypeScript
  - Enable `noUncheckedIndexedAccess`
  - Remove `any` types where possible
  - Add runtime type validation with Zod

- [ ] **Remove deprecated counter columns** - After validation period
  - `run_metadata.completed_workers` and `failed_workers` columns no longer maintained
  - Counts now computed from `partition_progress` table
  - Apply `sql/migrations/005_remove_counter_columns.sql` when confident
  - See `IMPLEMENTATION_SUMMARY.md` for context

- [ ] **Clean up historical documentation** - Archive resolved design docs
  - `WORKER_CONTINUATION_PATTERN.md` - Pattern is implemented, doc is reference only
  - `IMPLEMENTATION_SUMMARY.md` - Dashboard sync fix is deployed
  - `SYNC_ISSUE_ANALYSIS.md` - Analysis is resolved
  - `instructions.md` - Original creation prompt, not needed in repo

## Completed

- [x] Add comprehensive README.md
- [x] Update CLAUDE.md with build commands
- [x] Document all packages with READMEs
- [x] Document all apps with READMEs
- [x] Split CI/CD workflows (now consolidated into ci-affected-staging.yaml)
- [x] Azure cost optimization
- [x] Worker retry consolidation
- [x] Worker continuation pattern (one page per message)
- [x] Bulk upsert for raw diamonds (UNNEST-based batch inserts)
- [x] Consolidator claim pattern with FOR UPDATE SKIP LOCKED
- [x] Dashboard sync fix (partition_progress as single source of truth)
- [x] Rate limit constants defined
- [x] Per-service database pool configuration (PG_POOL_MAX env var)
- [x] Dashboard admin UI with run management, analytics, triggers

---

## Priority Guidelines

- **High**: Security issues, data integrity, production reliability
- **Medium**: Performance, developer experience, maintainability
- **Low**: Nice-to-have features, future considerations

---
