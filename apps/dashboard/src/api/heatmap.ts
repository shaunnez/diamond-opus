import { api } from './client';

export interface HeatmapStats {
  api_calls: number;
  scan_duration_ms: number;
  ranges_scanned: number;
  non_empty_ranges: number;
  used_two_pass: boolean;
}

export interface DensityChunk {
  min_price: number;
  max_price: number;
  count: number;
}

export interface Partition {
  partition_id: string;
  min_price: number;
  max_price: number;
  total_records: number;
}

export interface HeatmapResult {
  total_records: number;
  worker_count: number;
  stats: HeatmapStats;
  density_map: DensityChunk[];
  partitions: Partition[];
}

export interface RunHeatmapOptions {
  mode?: 'single-pass' | 'two-pass';
  min_price?: number;
  max_price?: number;
  max_workers?: number;
  dense_zone_threshold?: number;
  dense_zone_step?: number;
  max_total_records?: number;
  lab_grown?: boolean;
  feed?: string;
}

export interface HeatmapHistoryEntry {
  scanned_at: string;
  scan_type: 'run' | 'preview';
  feed: string;
  config: Record<string, unknown>;
  result: HeatmapResult;
}

export interface HeatmapHistoryResponse {
  run: HeatmapHistoryEntry | null;
  preview: HeatmapHistoryEntry | null;
}

export async function runHeatmap(options: RunHeatmapOptions = {}): Promise<HeatmapResult> {
  const response = await api.post<{ data: HeatmapResult }>('/heatmap/run', options);
  return response.data.data;
}

export async function previewHeatmap(options: Partial<RunHeatmapOptions> = {}): Promise<HeatmapResult> {
  const response = await api.post<{ data: HeatmapResult }>('/heatmap/preview', options);
  return response.data.data;
}

export async function getHeatmapHistory(feed: string): Promise<HeatmapHistoryResponse> {
  const response = await api.get<{ data: HeatmapHistoryResponse }>(`/heatmap/history/${feed}`);
  return response.data.data;
}
