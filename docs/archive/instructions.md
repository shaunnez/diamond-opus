# Diamond Platform - Project Creation Prompt

You are a senior backend engineer and systems architect. Create a production-ready TypeScript Node.js monorepo from scratch for ingesting, consolidating, and serving diamond inventory from suppliers.

**This is a greenfield build. Do not assume any existing code or infrastructure.**

---

## Core Technical Constraints (Hard Rules)

### Runtime and Language

- Node.js 20+ with TypeScript (strict mode enabled)
- ES modules (`"type": "module"` in package.json)
- No experimental or unstable tooling

### Environment Configuration

- Use `.env.local` for development
- All scripts must load env vars using `cross-env` or `dotenv`
- No reliance on shell-specific env behavior

Example script:

```json
"dev": "cross-env NODE_ENV=development tsx watch src/index.ts"
```

### Database (Supabase Only)

- **No local Postgres instance**
- **No Postgres in docker-compose**
- All database access via Supabase connection string (`DATABASE_URL`)
- Schema is externally managed

### SQL Bootstrap

- Include a `sql/` directory with a single SQL script creating all tables
- Script is for manual execution in Supabase SQL Editor
- **No ORM migrations, no migration framework**

---

## System Architecture

### Overview

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

---

## Monorepo Structure

Use **npm workspaces**:

```
diamond-platform/
├── packages/
│   ├── shared/                 # Types, utilities, constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── database/               # Database client, queries
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── queries/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── nivoda/                 # Nivoda adapter, mapper, queries
│   │   ├── src/
│   │   │   ├── adapter.ts
│   │   │   ├── mapper.ts
│   │   │   ├── queries.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── pricing-engine/         # Pricing rules logic
│   │   ├── src/
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   └── api/                    # Express REST API
│       ├── src/
│       │   ├── routes/
│       │   │   ├── diamonds.ts
│       │   │   ├── health.ts
│       │   │   └── index.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   ├── error-handler.ts
│       │   │   └── request-validator.ts
│       │   ├── validators/
│       │   ├── swagger/
│       │   │   └── generator.ts
│       │   └── server.ts
│       ├── __tests__/
│       └── package.json
│
├── apps/
│   ├── scheduler/              # Scheduler job
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── worker/                 # Worker job
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── consolidator/           # Consolidator job
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── sql/
│   └── bootstrap.sql           # All table definitions
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.scheduler
│   ├── Dockerfile.worker
│   └── Dockerfile.consolidator
│
├── infrastructure/
│   └── bitbucket-pipelines.yml
│
├── package.json                # Root workspace config
├── tsconfig.json               # Base TypeScript config
├── .env.example                # Environment template
└── README.md
```

---

## Database Schema

### Table: `api_keys`

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,        -- SHA256 hash of the API key
  client_name TEXT NOT NULL,            -- e.g., 'shopify', 'internal'
  permissions TEXT[] DEFAULT '{}',      -- Future: granular permissions
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ                -- NULL = never expires
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE active = TRUE;
```

### Table: `raw_diamonds_nivoda`

```sql
CREATE TABLE raw_diamonds_nivoda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  supplier_stone_id TEXT NOT NULL,      -- diamond.id
  offer_id TEXT NOT NULL,               -- items[].id (for ordering)
  source_updated_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,           -- SHA256 of payload
  consolidated BOOLEAN DEFAULT FALSE,
  consolidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(supplier_stone_id)
);

CREATE INDEX idx_raw_nivoda_consolidated ON raw_diamonds_nivoda(consolidated) WHERE NOT consolidated;
CREATE INDEX idx_raw_nivoda_run_id ON raw_diamonds_nivoda(run_id);
```

### Table: `diamonds` (Canonical)

```sql
CREATE TABLE diamonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  supplier TEXT NOT NULL DEFAULT 'nivoda',
  supplier_stone_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,

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

  -- Pricing (cents to avoid float issues)
  supplier_price_cents BIGINT NOT NULL,
  price_per_carat_cents BIGINT NOT NULL,
  retail_price_cents BIGINT,
  markup_ratio DECIMAL(5,4),
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Availability
  availability TEXT NOT NULL,           -- 'available', 'on_hold', 'sold', 'unavailable'
  raw_availability TEXT,
  hold_id TEXT,

  -- Media
  image_url TEXT,
  video_url TEXT,

  -- Certificate
  certificate_lab TEXT,
  certificate_number TEXT,
  certificate_pdf_url TEXT,

  -- Measurements & Attributes (JSONB for flexibility)
  measurements JSONB,
  attributes JSONB,

  -- Supplier Details
  supplier_name TEXT,
  supplier_legal_name TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'active',
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(supplier, supplier_stone_id)
);

CREATE INDEX idx_diamonds_search ON diamonds(shape, carats, color, clarity) WHERE status = 'active';
CREATE INDEX idx_diamonds_price ON diamonds(supplier_price_cents) WHERE status = 'active';
CREATE INDEX idx_diamonds_availability ON diamonds(availability) WHERE status = 'active';
CREATE INDEX idx_diamonds_offer ON diamonds(offer_id);
```

### Table: `pricing_rules`

```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,

  -- Matching Criteria (NULL = matches all)
  carat_min DECIMAL(6,2),
  carat_max DECIMAL(6,2),
  shapes TEXT[],
  lab_grown BOOLEAN,
  supplier TEXT,

  -- Outputs
  markup_ratio DECIMAL(5,4) NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),

  -- Lifecycle
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_active ON pricing_rules(priority) WHERE active = TRUE;
```

### Table: `run_metadata`

```sql
CREATE TABLE run_metadata (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,               -- 'full', 'incremental'
  expected_workers INTEGER NOT NULL,
  completed_workers INTEGER DEFAULT 0,
  failed_workers INTEGER DEFAULT 0,
  watermark_before TIMESTAMPTZ,
  watermark_after TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Table: `worker_runs`

```sql
CREATE TABLE worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  partition_id TEXT NOT NULL,
  worker_id UUID NOT NULL,
  status TEXT NOT NULL,                 -- 'running', 'completed', 'failed'
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(run_id, partition_id)
);

CREATE INDEX idx_worker_runs_status ON worker_runs(run_id, status);
```

### Table: `hold_history`

```sql
CREATE TABLE hold_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  supplier TEXT NOT NULL,
  supplier_hold_id TEXT,
  offer_id TEXT NOT NULL,
  status TEXT NOT NULL,                 -- 'active', 'expired', 'released'
  denied BOOLEAN DEFAULT FALSE,
  hold_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `purchase_history`

```sql
CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diamond_id UUID REFERENCES diamonds(id),
  supplier TEXT NOT NULL,
  supplier_order_id TEXT,
  offer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,                 -- 'pending', 'confirmed', 'failed'
  reference TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Nivoda GraphQL Integration

### Endpoint

- Staging: `https://intg-customer-staging.nivodaapi.net/api/diamonds`
- Credentials via environment variables

### Query: Authenticate

```graphql
query Authenticate($username: String!, $password: String!) {
  authenticate {
    username_and_password(username: $username, password: $password) {
      token
    }
  }
}
```

### Query: Diamonds By Query Count (CRITICAL for Scheduler)

**The scheduler MUST use this query for partitioning. Do NOT use `total_count` from paginated results.**

```graphql
query GetDiamondsCount($token: String!, $query: DiamondQuery!) {
  as(token: $token) {
    diamonds_by_query_count(query: $query)
  }
}
```

Example with filters:

```graphql
query GetCount($token: String!, $min: Int!, $max: Int!) {
  as(token: $token) {
    diamonds_by_query_count(
      query: {
        dollar_value: { from: $min, to: $max }
        sizes: { from: 0.5, to: 10 }
        shapes: [
          "ROUND"
          "OVAL"
          "EMERALD"
          "CUSHION"
          "CUSHION B"
          "CUSHION MODIFIED"
          "CUSHION BRILLIANT"
          "ASSCHER"
          "RADIANT"
          "MARQUISE"
          "PEAR"
          "PRINCESS"
          "ROSE"
          "OLD MINER"
          "TRILLIANT"
          "HEXAGONAL"
          "HEART"
        ]
      }
    )
  }
}
```

### Query: Diamonds By Query (for Workers)

```graphql
query DiamondsByQuery(
  $token: String!
  $query: DiamondQuery!
  $offset: Int
  $limit: Int
  $order: DiamondOrder
) {
  as(token: $token) {
    diamonds_by_query(
      query: $query
      offset: $offset
      limit: $limit
      order: $order
    ) {
      total_count
      items {
        id
        price
        discount
        diamond_price
        markup_price
        markup_discount
        diamond {
          id
          availability
          HoldId
          NivodaStockId
          supplierStockId
          image
          video
          eyeClean
          brown
          green
          blue
          gray
          milky
          bowtie
          mine_of_origin
          supplier_video_link
          approval_type
          final_price
          show_measurements
          show_certificate_number
          return_window
          CertificateType
          delivery_time {
            express_timeline_applicable
            min_business_days
            max_business_days
          }
          certificate {
            id
            lab
            certNumber
            pdfUrl
            shape
            fullShape
            carats
            clarity
            cut
            polish
            symmetry
            color
            length
            width
            depth
            depthPercentage
            table
            crownAngle
            crownHeight
            pavAngle
            pavHeight
            pavDepth
            floInt
            floCol
            verified
            labgrown
            labgrown_type
            treated
            girdle
            culetSize
            girdleCondition
            culet_condition
            cut_style
            keyToSymbols
            comments
          }
          supplier {
            id
            name
            legal_name
          }
        }
      }
    }
  }
}
```

### Mutation: Create Hold

```graphql
mutation CreateHold($token: String!, $productId: ID!, $productType: String!) {
  as(token: $token) {
    create_hold(product_id: $productId, product_type: $productType) {
      id
      denied
      until
    }
  }
}
```

### Mutation: Create Order

```graphql
mutation CreateOrder(
  $token: String!
  $offerId: ID!
  $destinationId: ID!
  $reference: String
  $comments: String
  $returnOption: String
) {
  as(token: $token) {
    create_order(
      offer_id: $offerId
      destination_id: $destinationId
      reference: $reference
      comments: $comments
      return_option: $returnOption
    )
  }
}
```

### NivodaAdapter Requirements

- Use `graphql-request` GraphQLClient
- Token caching: 6 hour lifetime with 5 minute expiry buffer
- Re-authenticate automatically on expiry
- `searchDiamonds`: enforce max limit of 50
- `getDiamondsCount`: dedicated method for partitioning
- All queries wrapped with `as(token: $token)` after authentication

---

## Scheduler Service

### Purpose

Partitions diamond search workloads and dispatches jobs deterministically.

### Critical Rule (DO NOT VIOLATE)

**Partitioning MUST use `diamonds_by_query_count`, NOT `total_count` from paginated queries.**

### Flow

1. Read watermark from Azure Blob Storage (`watermarks/nivoda.json`)
2. Determine run mode (full vs incremental)
3. Authenticate with Nivoda
4. Call `getDiamondsCount()` with appropriate filters
5. Compute partition ranges (target: 5000 records per worker)
6. Create `run_metadata` record in database
7. Enqueue `WORK_ITEM` messages to Azure Service Bus
8. Exit

### Partitioning Strategy

```typescript
const RECORDS_PER_WORKER = 5000;

const totalRecords = await nivodaAdapter.getDiamondsCount(query);
const numWorkers = Math.ceil(totalRecords / RECORDS_PER_WORKER);

for (let i = 0; i < numWorkers; i++) {
  const offsetStart = i * RECORDS_PER_WORKER;
  const offsetEnd = Math.min((i + 1) * RECORDS_PER_WORKER, totalRecords);
  // Enqueue work item...
}
```

---

## Worker Service

### Purpose

Processes assigned partition, fetches diamonds from Nivoda, writes to raw table.

### Flow

1. Receive `WORK_ITEM` from Service Bus
2. Create `worker_runs` record
3. Authenticate with Nivoda
4. Paginate through assigned range (limit=30 per page)
5. Upsert each item to `raw_diamonds_nivoda`
6. Checkpoint progress after each page
7. On completion, atomically increment `completed_workers` in `run_metadata`
8. If last worker and no failures, enqueue `CONSOLIDATE` message
9. Emit `WORK_DONE` message

### Retry Logic

- Exponential backoff: 2s, 4s, 8s, 16s, 32s
- Max retries: 5
- On permanent failure: mark worker as failed, do NOT enqueue consolidate

---

## Consolidator Service

### Purpose

Maps raw data to canonical format, applies pricing, advances watermark.

### Flow

1. Receive `CONSOLIDATE` message
2. Fetch unconsolidated rows from `raw_diamonds_nivoda` in batches (1000)
3. For each row:
   - Parse payload
   - Map to canonical via `NivodaMapper`
   - Apply pricing rules via `PricingEngine`
   - Upsert to `diamonds` table
   - Mark raw row as consolidated
4. Advance watermark in Blob Storage
5. Update `run_metadata` with completion time
6. On failure: send alert email via Resend, do NOT advance watermark

---

## REST API Service

### Framework

- Express with explicit route files
- No NestJS, no magic routing
- Request validation with Zod
- Response typing

### Authentication (Dual Method)

**API Key Auth (checked first)**

- Header: `X-API-Key`
- Validated against `api_keys` table (hash comparison)
- If valid, request proceeds immediately

**HMAC Auth (fallback if no API key)**

- Headers required:
  - `X-Client-Id`: Client identifier
  - `X-Timestamp`: Unix timestamp (seconds)
  - `X-Signature`: HMAC-SHA256 signature
- Signature computation:
  ```
  canonical_string = METHOD + '\n' + PATH + '\n' + TIMESTAMP + '\n' + SHA256(BODY)
  signature = HMAC-SHA256(CLIENT_SECRET, canonical_string)
  ```
- Timestamp must be within ±5 minutes
- No nonce validation required

**Auth Precedence**

1. Check for `X-API-Key` → validate → accept if valid
2. Check for HMAC headers → validate signature → accept if valid
3. Reject with 401

### Endpoints

#### `GET /api/v2/diamonds`

Search diamonds with filters.

Query parameters:

- `shape` (string)
- `carat_min`, `carat_max` (number)
- `color[]`, `clarity[]`, `cut[]` (arrays)
- `lab_grown` (boolean)
- `price_min`, `price_max` (number, cents)
- `page`, `limit` (pagination)
- `sort_by`, `sort_order`

Response:

```json
{
  "data": [...],
  "pagination": {
    "total": 1000,
    "page": 1,
    "limit": 50,
    "total_pages": 20
  }
}
```

#### `GET /api/v2/diamonds/:id`

Returns single diamond with all details.

#### `POST /api/v2/diamonds/:id/availability`

Check availability (returns stored value from database).

#### `POST /api/v2/diamonds/:id/hold`

Create hold on diamond.

- Calls `NivodaAdapter.createHold(offer_id)`
- Stores result in `hold_history`
- Updates `diamonds.availability`

#### `POST /api/v2/diamonds/:id/purchase`

Purchase diamond.

- Requires `X-Idempotency-Key` header
- Body: `{ destination_id, reference?, comments?, return_option? }`
- Calls `NivodaAdapter.createOrder()`
- Stores in `purchase_history`

#### `GET /health`

Health check endpoint (unauthenticated).

---

## OpenAPI / Swagger

### Requirements

- OpenAPI spec generated from route definitions (not handwritten)
- npm script: `npm run swagger` generates `swagger.json` at repo root
- Swagger UI served at `/api-docs`
- Swagger UI must be functional against running dev server

### Auth in Swagger

- API Key auth configured as OpenAPI security scheme
- "Authorize" button works for API key
- HMAC auth documented with:
  - Required headers listed
  - Signature computation explained

---

## Azure Service Bus Message Contracts

### WORK_ITEM

```json
{
  "type": "WORK_ITEM",
  "run_id": "uuid",
  "partition_id": "partition-0",
  "offset_start": 0,
  "offset_end": 5000,
  "updated_from": "2025-01-23T11:00:00Z",
  "updated_to": "2025-01-23T16:00:00Z"
}
```

### WORK_DONE

```json
{
  "type": "WORK_DONE",
  "run_id": "uuid",
  "worker_id": "uuid",
  "partition_id": "partition-0",
  "records_processed": 150,
  "status": "success",
  "error": null
}
```

### CONSOLIDATE

```json
{
  "type": "CONSOLIDATE",
  "run_id": "uuid"
}
```

---

## Environment Variables

### `.env.example`

```bash
# Database
DATABASE_URL=postgresql://user:pass@db.supabase.co:5432/postgres

# Nivoda API
NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
NIVODA_USERNAME=testaccount@sample.com
NIVODA_PASSWORD=staging-nivoda-22

# Azure Services
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...

# API Configuration
PORT=3000
HMAC_SECRETS={"shopify":"secret1","internal":"secret2"}

# Alerts (Resend)
RESEND_API_KEY=re_...
ALERT_EMAIL_TO=alerts@example.com
ALERT_EMAIL_FROM=noreply@yourdomain.com

# Pricing
PRICING_MODE=CONSOLIDATION
```

---

## Development Experience

### Auto-reload

Each service must support hot reload via `tsx watch`.

### Package Scripts

Each package must support:

- `dev` - Development with hot reload
- `build` - TypeScript compilation
- `start` - Run compiled code
- `test` - Run tests

Root scripts orchestrate all services.

---

## Testing Requirements

### Unit Tests (Vitest or Jest)

**NivodaAdapter:**

- Token caching behavior
- Re-authentication on expiry
- Limit enforcement (max 50)
- Error handling

**NivodaMapper:**

- Correct identity mapping (offer_id vs supplier_stone_id)
- Field extraction and normalization
- Edge cases (missing certificate, null fields)

**PricingEngine:**

- Rule matching logic (priority, facets)
- Default rule fallback
- Markup calculation accuracy

**Auth Middleware:**

- Valid API key passes
- Invalid API key fails
- Valid HMAC signature passes
- Expired timestamp fails
- Tampered body fails

### Integration Tests

- NivodaAdapter against real staging (if env vars present, else skip)
- Database queries against Supabase test instance

---

## Alerts (Resend)

The consolidator must send alert emails on failure:

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendAlert(subject: string, body: string): Promise<void> {
  await resend.emails.send({
    from: process.env.ALERT_EMAIL_FROM!,
    to: process.env.ALERT_EMAIL_TO!,
    subject: `[Diamond Platform] ${subject}`,
    text: body,
  });
}
```

---

## Deliverables

Generate:

- [ ] Full monorepo structure with npm workspaces
- [ ] All `package.json` files with correct scripts and dependencies
- [ ] TypeScript configurations (base + per-package)
- [ ] SQL bootstrap script (`sql/bootstrap.sql`)
- [ ] Complete NivodaAdapter with all queries
- [ ] NivodaMapper for canonical transformation
- [ ] PricingEngine with rule matching
- [ ] Database client with typed queries
- [ ] Express API with all routes and middleware
- [ ] Swagger generation and UI setup
- [ ] Scheduler with correct partitioning (using count query)
- [ ] Worker with retry logic and checkpointing
- [ ] Consolidator with pricing and alerts
- [ ] Dockerfiles for each service
- [ ] Bitbucket Pipelines configuration
- [ ] `.env.example` template
- [ ] Comprehensive README.md
- [ ] Unit tests for core components

**Do not include placeholder text like "TODO: implement later". Produce working, realistic code.**

---

## Final Notes

- **Identity mapping**: `offer_id` (wrapper `items[].id`) for ordering, `supplier_stone_id` (`Id`) for tracking
- **Soft deletes**: Use `status = 'deleted'` and `deleted_at` timestamp
- **Idempotency**: Client-provided `X-Idempotency-Key` header for purchases
- **Partial failures**: If any worker fails, skip consolidation, do not advance watermark
- **Last worker triggers consolidation**: Atomic counter in `run_metadata`
