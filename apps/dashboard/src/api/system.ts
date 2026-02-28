import { api } from './client';

export interface NivodaConfig {
  endpoint: string;
  proxyEnabled: boolean;
  proxyUrl?: string;
}

export interface SystemConfig {
  nivoda: NivodaConfig;
}

/**
 * Fetch system configuration including Nivoda API endpoint and proxy settings
 */
export async function getSystemConfig(): Promise<SystemConfig> {
  const response = await api.get<SystemConfig>('/system/config');
  return response.data;
}

export interface CacheStats {
  searchEntries: number;
  searchMaxEntries: number;
  countEntries: number;
  countMaxEntries: number;
  analyticsEntries: number;
  analyticsMaxEntries: number;
  version: string;
  ttlMs: number;
  searchHits: number;
  searchMisses: number;
  searchHitRate: number;
  countHits: number;
  countMisses: number;
  countHitRate: number;
  analyticsHits: number;
  analyticsMisses: number;
  analyticsHitRate: number;
}

/**
 * Fetch cache statistics including hit rates and entry counts
 */
export async function getCacheStats(): Promise<CacheStats> {
  const response = await api.get<CacheStats>('/system/cache-stats');
  return response.data;
}
