import { api } from './client';
import type { SystemConfig } from '@diamond/shared';

/**
 * Fetch system configuration including Nivoda API endpoint and proxy settings
 */
export async function getSystemConfig(): Promise<SystemConfig> {
  const response = await api.get<SystemConfig>('/system/config');
  return response.data;
}
