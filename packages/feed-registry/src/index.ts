export type {
  FeedAdapter,
  FeedQuery,
  FeedSearchOptions,
  FeedSearchResult,
  FeedBulkRawDiamond,
  MappedDiamond,
  HeatmapConfigOverrides,
} from './types.js';
export { ALLOWED_RAW_TABLES } from './types.js';
export { FeedRegistry } from './registry.js';
export {
  scanHeatmap,
  calculateWorkerCount,
  createPartitions,
  type HeatmapConfig,
  type HeatmapResult,
  type DensityChunk,
  type WorkerPartition,
  type ScanStats,
} from './heatmap.js';
