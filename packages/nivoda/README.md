# @diamond/nivoda

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

Optional environment variables:

```bash
# Exclude fields that cause GraphQL enum validation errors on Nivoda staging API
# Disables: clarity, floInt, floCol, labgrown_type
NIVODA_DISABLE_STAGING_FIELDS=true
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
