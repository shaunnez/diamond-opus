# Diamond Platform

A production-ready TypeScript Node.js monorepo for ingesting, consolidating, and serving diamond inventory from suppliers.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────▶│ Service Bus │────▶│   Workers   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  REST API   │◀────│   Supabase  │◀────│ Consolidator│
└─────────────┘     └─────────────┘     └─────────────┘
```

### Two-Stage Pipeline

**Stage 1: Raw Ingestion**
- Scheduler partitions workload using `diamonds_by_query_count`
- Workers fetch diamonds and write to `raw_diamonds_nivoda`

**Stage 2: Consolidation**
- Consolidator maps raw data to canonical `diamonds` table
- Applies pricing rules
- Advances watermark on success

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase account (for database)
- Azure account (for Service Bus and Blob Storage)

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env.local` and configure environment variables
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build all packages:
   ```bash
   npm run build
   ```
5. Run the SQL bootstrap script in Supabase SQL Editor (`sql/bootstrap.sql`)

## Development

### Running Services

```bash
# API Server
npm run dev:api

# Scheduler (run once)
npm run dev:scheduler

# Worker (long-running)
npm run dev:worker

# Consolidator (long-running)
npm run dev:consolidator
```

### Testing

```bash
# Run all tests
npm run test

# Run tests for specific package
npm run test -w @diamond/nivoda
```

### Generating Swagger

```bash
npm run swagger
```

Swagger UI is available at `http://localhost:3000/api-docs` when the API is running.

## Project Structure

```
diamond-platform/
├── packages/
│   ├── shared/           # Types, utilities, constants
│   ├── database/         # Database client, queries
│   ├── nivoda/           # Nivoda adapter, mapper
│   ├── pricing-engine/   # Pricing rules logic
│   └── api/              # Express REST API
├── apps/
│   ├── scheduler/        # Job partitioning
│   ├── worker/           # Data ingestion
│   └── consolidator/     # Data transformation
├── sql/                  # Database schema
├── docker/               # Dockerfiles
└── infrastructure/       # CI/CD configuration
```

## API Authentication

The API supports two authentication methods:

### API Key

Include the `X-API-Key` header with your API key.

### HMAC Signature

Include the following headers:
- `X-Client-Id`: Your client identifier
- `X-Timestamp`: Unix timestamp (seconds)
- `X-Signature`: HMAC-SHA256 signature

Signature computation:
```
canonical_string = METHOD + '\n' + PATH + '\n' + TIMESTAMP + '\n' + SHA256(BODY)
signature = HMAC-SHA256(CLIENT_SECRET, canonical_string)
```

## Environment Variables

See `.env.example` for all required environment variables.

## Docker

Build images:
```bash
docker build -f docker/Dockerfile.api -t diamond-api .
docker build -f docker/Dockerfile.scheduler -t diamond-scheduler .
docker build -f docker/Dockerfile.worker -t diamond-worker .
docker build -f docker/Dockerfile.consolidator -t diamond-consolidator .
```

## License

Proprietary
# diamond-opus
