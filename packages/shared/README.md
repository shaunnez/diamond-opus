# @diamond/shared

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
  CONSOLIDATOR_BATCH_SIZE,   // 1000 - Diamonds per batch
  CONSOLIDATOR_CONCURRENCY,  // 10 - Parallel processing
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
  retailPriceCents?: number;
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
