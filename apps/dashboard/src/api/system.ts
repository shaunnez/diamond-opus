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
