# Diamond Opus

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
│   └── consolidator/           # Data transformation (queue consumer)
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
npm run build                    # Build all packages

# Development
npm run dev:api                  # API on port 3000
npm run dev:scheduler            # Run scheduler once
npm run dev:worker               # Long-running worker
npm run dev:consolidator         # Long-running consolidator

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

- **ci.yml**: Build, test, type-check on PR/push
- **deploy-staging.yml**: Auto-deploy to staging on push to main
- **deploy-production.yml**: Manual production deployment

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

## License

Proprietary
