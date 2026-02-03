/**
 * Test data factories for creating consistent mock data across tests.
 * All factories return valid objects with sensible defaults that can be overridden.
 */

import type {
  Diamond,
  DiamondSearchParams,
  PricingRule,
  RunMetadata,
  WorkerRun,
  WorkItemMessage,
  WorkDoneMessage,
  ConsolidateMessage,
} from '../types/index.js';

let idCounter = 0;

/**
 * Generate a unique ID for test data
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

/**
 * Reset the ID counter (useful between test suites)
 */
export function resetTestIdCounter(): void {
  idCounter = 0;
}

/**
 * Create a mock Diamond with default values
 */
export function createMockDiamond(overrides: Partial<Diamond> = {}): Diamond {
  const id = overrides.id ?? generateTestId('diamond');
  return {
    id,
    feed: 'nivoda',
    supplierStoneId: `stone-${id}`,
    offerId: `offer-${id}`,
    shape: 'ROUND',
    carats: 1.0,
    color: 'G',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    labGrown: false,
    treated: false,
    priceModelPrice: 5000, // $5,000
    pricePerCarat: 5000,
    retailPrice: 5750, // 15% markup
    markupRatio: 1.15,
    rating: 5,
    availability: 'available',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a batch of mock diamonds
 */
export function createMockDiamonds(
  count: number,
  overrides: Partial<Diamond> = {}
): Diamond[] {
  return Array.from({ length: count }, (_, i) =>
    createMockDiamond({
      carats: 0.5 + i * 0.1,
      priceModelPrice: 1000 + i * 500,
      ...overrides,
    })
  );
}

/**
 * Create a mock PricingRule with default values
 */
export function createMockPricingRule(
  overrides: Partial<PricingRule> = {}
): PricingRule {
  return {
    id: overrides.id ?? generateTestId('rule'),
    priority: 100,
    markupRatio: 1.15,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock RunMetadata with default values
 */
export function createMockRunMetadata(
  overrides: Partial<RunMetadata> = {}
): RunMetadata {
  return {
    runId: overrides.runId ?? generateTestId('run'),
    runType: 'full',
    expectedWorkers: 5,
    completedWorkers: 0,
    failedWorkers: 0,
    startedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock WorkerRun with default values
 */
export function createMockWorkerRun(
  overrides: Partial<WorkerRun> = {}
): WorkerRun {
  return {
    id: overrides.id ?? generateTestId('worker-run'),
    runId: overrides.runId ?? generateTestId('run'),
    partitionId: 'partition-0',
    workerId: generateTestId('worker'),
    status: 'running',
    recordsProcessed: 0,
    startedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock WorkItemMessage
 */
export function createMockWorkItemMessage(
  overrides: Partial<WorkItemMessage> = {}
): WorkItemMessage {
  return {
    type: 'WORK_ITEM',
    runId: overrides.runId ?? generateTestId('run'),
    traceId: overrides.traceId ?? generateTestId('trace'),
    partitionId: 'partition-0',
    minPrice: 0,
    maxPrice: 5000,
    totalRecords: 1000,
    offsetStart: 0,
    offsetEnd: 1000,
    offset: 0,
    limit: 30,
    ...overrides,
  };
}

/**
 * Create a mock WorkDoneMessage
 */
export function createMockWorkDoneMessage(
  overrides: Partial<WorkDoneMessage> = {}
): WorkDoneMessage {
  return {
    type: 'WORK_DONE',
    runId: overrides.runId ?? generateTestId('run'),
    traceId: overrides.traceId ?? generateTestId('trace'),
    workerId: generateTestId('worker'),
    partitionId: 'partition-0',
    recordsProcessed: 1000,
    status: 'success',
    ...overrides,
  };
}

/**
 * Create a mock ConsolidateMessage
 */
export function createMockConsolidateMessage(
  overrides: Partial<ConsolidateMessage> = {}
): ConsolidateMessage {
  return {
    type: 'CONSOLIDATE',
    runId: overrides.runId ?? generateTestId('run'),
    traceId: overrides.traceId ?? generateTestId('trace'),
    ...overrides,
  };
}

/**
 * Create mock DiamondSearchParams
 */
export function createMockSearchParams(
  overrides: Partial<DiamondSearchParams> = {}
): DiamondSearchParams {
  return {
    page: 1,
    limit: 50,
    ...overrides,
  };
}

/**
 * Create a mock raw Nivoda item payload (as stored in raw_diamonds_nivoda)
 */
export function createMockNivodaPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = generateTestId('nivoda');
  return {
    id: `offer-${id}`,
    price: 5000.0,
    diamond: {
      id: `stone-${id}`,
      certificate: {
        lab: 'GIA',
        certNumber: `GIA-${id}`,
        pdfUrl: `https://example.com/cert-${id}.pdf`,
      },
      video: `https://example.com/video-${id}.mp4`,
      image: `https://example.com/image-${id}.jpg`,
      carat: 1.0,
      color: 'G',
      clarity: 'VS1',
      cut: 'EX',
      polish: 'EX',
      symmetry: 'EX',
      fluorescence: 'NON',
      measurements: {
        length: 6.5,
        width: 6.5,
        depth: 4.0,
      },
      shape: 'Round',
      labgrown: false,
      treatment: 'NONE',
    },
    supplier: {
      name: 'Test Supplier',
      legalName: 'Test Supplier Inc.',
    },
    availability: 'AVAILABLE',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock raw diamond record (as stored in database)
 */
export function createMockRawDiamond(overrides: Record<string, unknown> = {}): {
  id: string;
  runId: string;
  supplierStoneId: string;
  offerId: string;
  payload: Record<string, unknown>;
  consolidated: boolean;
  createdAt: Date;
} {
  const payload = createMockNivodaPayload(overrides.payload as Record<string, unknown>);
  return {
    id: generateTestId('raw'),
    runId: generateTestId('run'),
    supplierStoneId: (payload.diamond as Record<string, unknown>).id as string,
    offerId: payload.id as string,
    payload,
    consolidated: false,
    createdAt: new Date(),
    ...overrides,
  };
}
