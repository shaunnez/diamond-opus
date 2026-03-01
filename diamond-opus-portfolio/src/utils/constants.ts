export const colors = {
  cream: '#FAF9F7',
  charcoal: '#1A1A1A',
  midnight: '#0D0D0D',
  obsidian: '#111111',
  pearl: '#F5F3F0',
  gold: '#B8860B',
  goldLight: '#D4A94C',
  goldHover: '#9A7209',
  warmGray400: '#9A9590',
  warmGray500: '#6B6B6B',
  warmGray600: '#4A4A4A',
  border: '#E8E5E0',
  azure: '#0078D4',
  emerald: '#2D6A4F',
  amber: '#D4A017',
  ruby: '#9B2335',
} as const;

export const easing = {
  luxury: [0.16, 1, 0.3, 1] as [number, number, number, number],
  smooth: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

export const pipelineStats = {
  diamonds: 500_000,
  microservices: 8,
  workers: 200,
  latencyMs: 50,
} as const;

export const heatmapConstants = {
  HEATMAP_MAX_WORKERS: 10,
  HEATMAP_MAX_PRICE: 50_000,
  HEATMAP_DENSE_ZONE_THRESHOLD: 5_000,
  HEATMAP_DENSE_ZONE_STEP: 50,
  HEATMAP_INITIAL_STEP: 250,
} as const;

export const systemConstants = {
  WORKER_PAGE_SIZE: 40,
  CONSOLIDATOR_BATCH_SIZE: 2_000,
  CONSOLIDATOR_UPSERT_BATCH_SIZE: 100,
  CONSOLIDATOR_CONCURRENCY: 2,
  NATURAL_BASE_MARGIN: 40,
  LAB_BASE_MARGIN: 79,
  NIVODA_PROXY_RATE_LIMIT: 25,
  CACHE_MAX_ENTRIES: 500,
  CACHE_TTL_MS: 300_000,
  CACHE_VERSION_POLL_INTERVAL_MS: 30_000,
} as const;
