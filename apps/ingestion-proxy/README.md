# Ingestion Proxy

Internal HTTP proxy for routing Nivoda API calls through a centralized rate limiter.

## Overview

The ingestion-proxy sits between the scheduler/worker services and the Nivoda GraphQL API, providing:

- **Centralized rate limiting**: Token bucket rate limiter with FIFO queue
- **Request timeout handling**: Configurable upstream timeout (default 60s)
- **Authentication**: Internal service token validation (constant-time comparison)
- **Observability**: Structured logging with trace IDs

## Architecture

```
┌──────────┐     ┌──────────────────┐     ┌──────────┐
│ Scheduler│────▶│ Ingestion Proxy  │────▶│  Nivoda  │
└──────────┘     │                  │     │   API    │
                 │ Rate Limiter     │     └──────────┘
┌──────────┐     │ (Token Bucket)   │
│  Worker  │────▶│                  │
└──────────┘     └──────────────────┘
```

## Rate Limiting

- **Algorithm**: Token bucket with FIFO queue
- **Default**: 25 requests/sec per replica
- **Queue behavior**: Requests wait up to 60s (configurable)
- **429 response**: Returned when queue wait exceeds max wait time
- **Per-replica**: Each replica rate-limits independently

**Effective global rate** = `per_replica_limit × num_replicas`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `NIVODA_ENDPOINT` | Yes | — | Nivoda GraphQL endpoint |
| `NIVODA_USERNAME` | Yes | — | Nivoda account email |
| `NIVODA_PASSWORD` | Yes | — | Nivoda account password |
| `INTERNAL_SERVICE_TOKEN` | Yes | — | Shared secret for internal auth |
| `NIVODA_PROXY_RATE_LIMIT` | No | `25` | Requests/sec per replica |
| `NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS` | No | `60000` | Max queue wait (ms) |
| `NIVODA_PROXY_TIMEOUT_MS` | No | `60000` | Upstream timeout (ms) |

## API

### `POST /graphql`

Proxies GraphQL requests to Nivoda API with rate limiting.

**Headers:**
- `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>` (required)

**Body:** Standard GraphQL request
```json
{
  "query": "...",
  "variables": {}
}
```

**Response:**
- `200 OK`: GraphQL response from Nivoda
- `401 Unauthorized`: Missing or invalid token
- `429 Too Many Requests`: Rate limit exceeded, queue wait timeout
- `502 Bad Gateway`: Upstream timeout or error

**Headers (response):**
- `X-Trace-Id`: Request trace ID for debugging

### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```
OK
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm run test

# Type check
npm run typecheck
```

## Usage in Workers

Workers use the `proxyTransport` when `NIVODA_PROXY_BASE_URL` is set:

```typescript
import { createNivodaClient } from '@diamond/nivoda';

const client = createNivodaClient({
  endpoint: process.env.NIVODA_ENDPOINT!,
  username: process.env.NIVODA_USERNAME!,
  password: process.env.NIVODA_PASSWORD!,
  proxyBaseUrl: process.env.NIVODA_PROXY_BASE_URL, // e.g., http://ingestion-proxy:3000
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN!,
});
```

The client automatically routes requests through the proxy and handles 429 retries with exponential backoff.

## Deployment

The ingestion-proxy is deployed as an Azure Container App:

```bash
# Build Docker image
docker build -f docker/Dockerfile.ingestion-proxy -t diamond-ingestion-proxy .

# Run locally
docker run -p 3000:3000 \
  -e NIVODA_ENDPOINT="..." \
  -e NIVODA_USERNAME="..." \
  -e NIVODA_PASSWORD="..." \
  -e INTERNAL_SERVICE_TOKEN="..." \
  diamond-ingestion-proxy
```

## Monitoring

Key log events:

- `server_started`: Proxy started
- `nivoda_proxy_request`: Request received
- `nivoda_proxy_rate_limited`: Request rate limited
- `nivoda_proxy_response`: Response sent (with status code)
- `nivoda_proxy_error`: Error occurred

All events include a `traceId` for correlation.

## Performance Impact

- **Latency overhead**: ~50-100ms per request (internal routing)
- **Throughput**: Limited by rate limiter configuration
- **Reliability**: Single point of failure (mitigated by multiple replicas)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 429 responses | Increase `NIVODA_PROXY_RATE_LIMIT` or deploy more replicas |
| 502 responses | Check Nivoda API status, increase `NIVODA_PROXY_TIMEOUT_MS` |
| High latency | Check network between services, verify replica count |
| Token errors | Verify `INTERNAL_SERVICE_TOKEN` matches across services |

## Related

- [packages/nivoda/README.md](../../packages/nivoda/README.md) - Nivoda client with proxy support
- [CLAUDE.md](../../CLAUDE.md#rate-limiting) - Rate limiting architecture
