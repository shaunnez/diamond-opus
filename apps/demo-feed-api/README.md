# @diamond/demo-feed-api

Express REST API that serves diamond inventory data from the `demo_feed_inventory` table. Acts as the data source for the demo feed pipeline, analogous to how Nivoda's GraphQL API serves real diamond data.

## Endpoints

### GET /api/health

Health check endpoint.

```json
{ "status": "ok", "service": "demo-feed-api" }
```

### GET /api/diamonds/count

Returns the count of diamonds matching optional filters.

| Query Param | Type | Description |
|-------------|------|-------------|
| `price_min` | number | Minimum price (USD) |
| `price_max` | number | Maximum price (USD) |
| `updated_from` | string | ISO 8601 start date |
| `updated_to` | string | ISO 8601 end date |

```json
{ "total_count": 100000 }
```

### GET /api/diamonds

Paginated search with optional filters and sorting. Max 1000 items per request.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `price_min` | number | — | Minimum price (USD) |
| `price_max` | number | — | Maximum price (USD) |
| `updated_from` | string | — | ISO 8601 start date |
| `updated_to` | string | — | ISO 8601 end date |
| `offset` | number | 0 | Pagination offset |
| `limit` | number | 100 | Page size (max 1000) |
| `order_by` | string | `created_at` | Sort field: `created_at`, `updated_at`, `asking_price_usd`, `weight_ct`, `stone_id` |
| `order_dir` | string | `ASC` | Sort direction: `ASC` or `DESC` |

```json
{
  "items": [{ "id": "...", "stone_id": "DEMO-0000001", ... }],
  "count": 100,
  "offset": 0,
  "limit": 100
}
```

### POST /api/seed

Generates deterministic test data using a seeded PRNG (mulberry32, seed=42). Can also be triggered from the dashboard via Triggers > Seed Demo Feed.

| Body Param | Type | Default | Description |
|------------|------|---------|-------------|
| `mode` | string | `full` | `full` truncates and re-inserts; `incremental` appends |
| `count` | number | 100000 / 5000 | Number of diamonds to generate (max 500,000) |

```bash
# Full seed (100k diamonds)
curl -X POST http://localhost:4000/api/seed -H 'Content-Type: application/json' \
  -d '{"mode": "full"}'

# Incremental (5k more)
curl -X POST http://localhost:4000/api/seed -H 'Content-Type: application/json' \
  -d '{"mode": "incremental"}'

# Custom count
curl -X POST http://localhost:4000/api/seed -H 'Content-Type: application/json' \
  -d '{"mode": "full", "count": 50000}'
```

The standalone CLI seed script is also available:

```bash
npm run seed -w @diamond/demo-feed-seed          # full (100k)
npm run seed -w @diamond/demo-feed-seed -- incremental  # incremental (5k)
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_FEED_API_PORT` | 4000 | Server port |
| `DATABASE_HOST` | — | PostgreSQL host |
| `DATABASE_PORT` | — | PostgreSQL port |
| `DATABASE_NAME` | — | Database name |
| `DATABASE_USERNAME` | — | Database username |
| `DATABASE_PASSWORD` | — | Database password |
| `PG_POOL_MAX` | 2 | Max database connections |

## Development

```bash
# Start dev server (with auto-reload)
npm run dev -w @diamond/demo-feed-api

# Build for production
npm run build -w @diamond/demo-feed-api

# Start production server
npm run start -w @diamond/demo-feed-api
```

## Infrastructure

In Azure, this runs as a Container App with **internal ingress** (not externally accessible). The scheduler and worker access it via its internal FQDN, configured through the `DEMO_FEED_API_URL` environment variable set by Terraform.
