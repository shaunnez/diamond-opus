import { api } from './client';

export interface PricingRule {
  id: string;
  priority: number;
  carat_min?: number;
  carat_max?: number;
  shapes?: string[];
  lab_grown?: boolean;
  feed?: string;
  markup_ratio: number;
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
  carat_min?: number;
  carat_max?: number;
  shapes?: string[];
  lab_grown?: boolean;
  feed?: string;
  markup_ratio: number;
  rating?: number;
}

export interface UpdatePricingRuleInput {
  priority?: number;
  carat_min?: number | null;
  carat_max?: number | null;
  shapes?: string[] | null;
  lab_grown?: boolean | null;
  feed?: string | null;
  markup_ratio?: number;
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
