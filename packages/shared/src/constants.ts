export const RECORDS_PER_WORKER = 5000;
export const WORKER_PAGE_SIZE = 30;
export const CONSOLIDATOR_BATCH_SIZE = 1000;
export const NIVODA_MAX_LIMIT = 50;

export const TOKEN_LIFETIME_MS = 6 * 60 * 60 * 1000; // 6 hours
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export const HMAC_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

export const DIAMOND_SHAPES = [
  'ROUND',
  'OVAL',
  'EMERALD',
  'CUSHION',
  'CUSHION B',
  'CUSHION MODIFIED',
  'CUSHION BRILLIANT',
  'ASSCHER',
  'RADIANT',
  'MARQUISE',
  'PEAR',
  'PRINCESS',
  'ROSE',
  'OLD MINER',
  'TRILLIANT',
  'HEXAGONAL',
  'HEART',
] as const;

export const AVAILABILITY_STATUSES = [
  'available',
  'on_hold',
  'sold',
  'unavailable',
] as const;

export const SERVICE_BUS_QUEUES = {
  WORK_ITEMS: 'work-items',
  WORK_DONE: 'work-done',
  CONSOLIDATE: 'consolidate',
} as const;

export const BLOB_CONTAINERS = {
  WATERMARKS: 'watermarks',
} as const;

export const WATERMARK_BLOB_NAME = 'nivoda.json';
