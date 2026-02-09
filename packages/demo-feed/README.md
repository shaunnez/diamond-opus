# @diamond/demo-feed

FeedAdapter implementation for the demo diamond feed. Connects to the [demo-feed-api](../../apps/demo-feed-api/) REST service and maps its schema to the canonical Diamond type.

## Overview

This package provides `DemoFeedAdapter`, which implements the `FeedAdapter` interface from `@diamond/feed-registry`. It demonstrates how to integrate a completely different data source (REST API with flat JSON) alongside the existing Nivoda integration (GraphQL with nested responses).

## Exports

```typescript
import { DemoFeedAdapter } from '@diamond/demo-feed';
import { mapDemoItemToDiamond, mapRawPayloadToDiamond } from '@diamond/demo-feed';
import type { DemoFeedItem, DemoFeedSearchResponse, DemoFeedCountResponse } from '@diamond/demo-feed';
```

## DemoFeedAdapter

| Property | Value |
|----------|-------|
| `feedId` | `demo` |
| `rawTableName` | `raw_diamonds_demo` |
| `watermarkBlobName` | `demo.json` |
| `maxPageSize` | 1000 |
| `workerPageSize` | 500 |

### Heatmap Overrides

The demo feed uses smaller heatmap parameters since it has fewer diamonds than Nivoda:

| Parameter | Value |
|-----------|-------|
| `denseZoneThreshold` | 5,000 |
| `denseZoneStep` | $50 |
| `initialStep` | $200 |
| `maxWorkers` | 100 |
| `minRecordsPerWorker` | 500 |

### Base URL Resolution

The adapter resolves the demo-feed-api URL in this order:

1. Constructor `baseUrl` parameter (if provided)
2. `DEMO_FEED_API_URL` environment variable
3. Fallback: `http://localhost:4000`

```typescript
// Uses env var or default
const adapter = new DemoFeedAdapter();

// Explicit URL
const adapter = new DemoFeedAdapter('https://my-demo-api.example.com');
```

### Field Mapping

| Demo Feed API | Canonical Diamond |
|--------------|-------------------|
| `stone_id` | `supplierStoneId` |
| `id` | `offerId` |
| `weight_ct` | `carats` |
| `stone_shape` | `shape` |
| `stone_color` | `color` |
| `stone_clarity` | `clarity` |
| `cut_grade` | `cut` |
| `polish_grade` | `polish` |
| `symmetry_grade` | `symmetry` |
| `fluorescence_level` | `fluorescence` |
| `asking_price_usd` | `feedPrice` |
| `price_per_ct_usd` | `pricePerCarat` |
| `is_lab_created` | `labGrown` |
| `cert_lab` | `certificateLab` |
| `cert_number` | `certificateNumber` |
| `vendor_name` | `supplierName` |
| `availability_status` | `availability` |

## Development

```bash
# Build
npm run build -w @diamond/demo-feed

# Run tests
npm run test -w @diamond/demo-feed

# Watch mode
npm run dev -w @diamond/demo-feed
```
