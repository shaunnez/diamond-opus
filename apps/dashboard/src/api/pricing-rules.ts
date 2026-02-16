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
  recalculate_pricing?: boolean;
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
  recalculate_pricing?: boolean;
}

export async function getPricingRules(): Promise<PricingRulesResponse> {
  const response = await api.get<{ data: PricingRulesResponse }>('/pricing-rules');
  return response.data.data;
}

export async function createPricingRule(rule: CreatePricingRuleInput): Promise<{ rule: PricingRule; reapply_job_id?: string }> {
  const response = await api.post<{ data: PricingRule & { reapply_job_id?: string } }>('/pricing-rules', rule);
  const { reapply_job_id, ...ruleData } = response.data.data;
  return { rule: ruleData, reapply_job_id };
}

export async function updatePricingRule(id: string, updates: UpdatePricingRuleInput): Promise<{ reapply_job_id?: string }> {
  const response = await api.put<{ data: { message: string; id: string; reapply_job_id?: string } }>(`/pricing-rules/${id}`, updates);
  return { reapply_job_id: response.data.data.reapply_job_id };
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
  updated_diamonds: number;
  failed_diamonds: number;
  feeds_affected: string[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  reverted_at: string | null;
  created_at: string;
  retry_count: number;
  last_progress_at: string | null;
  next_retry_at: string | null;
  trigger_type: 'manual' | 'rule_create' | 'rule_update' | null;
  triggered_by_rule_id: string | null;
  trigger_rule_snapshot: {
    priority?: number;
    stone_type?: StoneType;
    price_min?: number;
    price_max?: number;
    feed?: string;
    margin_modifier?: number;
    rating?: number;
  } | null;
}

// Removed triggerReapplyPricing - repricing is now only triggered via rule create/update checkbox

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

export async function resumeReapplyJob(id: string): Promise<void> {
  await api.post(`/pricing-rules/reapply/jobs/${id}/resume`);
}
