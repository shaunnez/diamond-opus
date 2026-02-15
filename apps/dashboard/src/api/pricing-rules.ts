import { api } from './client';

export type StoneType = 'natural' | 'lab' | 'fancy';

export interface PricingRule {
  id: string;
  priority: number;
  stone_type?: StoneType;
  price_min?: number;
  price_max?: number;
  feed?: string;
  margin_modifier: number;
  rating?: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingRulesResponse {
  rules: PricingRule[];
  total: number;
}

export interface CreatePricingRuleInput {
  priority: number;
  stone_type?: StoneType;
  price_min?: number;
  price_max?: number;
  feed?: string;
  margin_modifier: number;
  rating?: number;
}

export interface UpdatePricingRuleInput {
  priority?: number;
  stone_type?: StoneType | null;
  price_min?: number | null;
  price_max?: number | null;
  feed?: string | null;
  margin_modifier?: number;
  rating?: number | null;
  active?: boolean;
}

export async function getPricingRules(): Promise<PricingRulesResponse> {
  const response = await api.get<{ data: PricingRulesResponse }>('/pricing-rules');
  return response.data.data;
}

export async function createPricingRule(rule: CreatePricingRuleInput): Promise<PricingRule> {
  const response = await api.post<{ data: PricingRule }>('/pricing-rules', rule);
  return response.data.data;
}

export async function updatePricingRule(id: string, updates: UpdatePricingRuleInput): Promise<void> {
  await api.put(`/pricing-rules/${id}`, updates);
}

export async function deletePricingRule(id: string): Promise<void> {
  await api.delete(`/pricing-rules/${id}`);
}

// --- Reapply pricing ---

export interface ReapplyJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'reverted';
  total_diamonds: number;
  processed_diamonds: number;
  failed_diamonds: number;
  feeds_affected: string[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  reverted_at: string | null;
  created_at: string;
}

export async function triggerReapplyPricing(): Promise<{ id: string; total_diamonds: number }> {
  const response = await api.post<{ data: { id: string; total_diamonds: number } }>('/pricing-rules/reapply');
  return response.data.data;
}

export async function getReapplyJobs(): Promise<ReapplyJob[]> {
  const response = await api.get<{ data: { jobs: ReapplyJob[] } }>('/pricing-rules/reapply/jobs');
  return response.data.data.jobs;
}

export async function getReapplyJob(id: string): Promise<ReapplyJob> {
  const response = await api.get<{ data: ReapplyJob }>(`/pricing-rules/reapply/jobs/${id}`);
  return response.data.data;
}

export async function revertReapplyJob(id: string): Promise<void> {
  await api.post(`/pricing-rules/reapply/jobs/${id}/revert`);
}
