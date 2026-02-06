# @diamond/api

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
