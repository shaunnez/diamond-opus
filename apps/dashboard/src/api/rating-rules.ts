import { api } from './client';

export interface RatingRule {
  id: string;
  priority: number;
  price_min?: number;
  price_max?: number;
  shapes?: string[];
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  feed?: string;
  rating: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Tier 1
  polishes?: string[];
  symmetries?: string[];
  fluorescences?: string[];
  certificate_labs?: string[];
  lab_grown?: boolean;
  carat_min?: number;
  carat_max?: number;
  // Tier 2
  table_min?: number;
  table_max?: number;
  depth_min?: number;
  depth_max?: number;
  crown_angle_min?: number;
  crown_angle_max?: number;
  crown_height_min?: number;
  crown_height_max?: number;
  pavilion_angle_min?: number;
  pavilion_angle_max?: number;
  pavilion_depth_min?: number;
  pavilion_depth_max?: number;
  girdles?: string[];
  culet_sizes?: string[];
  ratio_min?: number;
  ratio_max?: number;
}

export interface RatingRulesResponse {
  rules: RatingRule[];
  total: number;
}

export interface CreateRatingRuleInput {
  priority: number;
  price_min?: number;
  price_max?: number;
  shapes?: string[];
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  feed?: string;
  rating: number;
  recalculate_rating?: boolean;
  // Tier 1
  polishes?: string[];
  symmetries?: string[];
  fluorescences?: string[];
  certificate_labs?: string[];
  lab_grown?: boolean;
  carat_min?: number;
  carat_max?: number;
  // Tier 2
  table_min?: number;
  table_max?: number;
  depth_min?: number;
  depth_max?: number;
  crown_angle_min?: number;
  crown_angle_max?: number;
  crown_height_min?: number;
  crown_height_max?: number;
  pavilion_angle_min?: number;
  pavilion_angle_max?: number;
  pavilion_depth_min?: number;
  pavilion_depth_max?: number;
  girdles?: string[];
  culet_sizes?: string[];
  ratio_min?: number;
  ratio_max?: number;
}

export interface UpdateRatingRuleInput {
  priority?: number;
  price_min?: number | null;
  price_max?: number | null;
  shapes?: string[] | null;
  colors?: string[] | null;
  clarities?: string[] | null;
  cuts?: string[] | null;
  feed?: string | null;
  rating?: number;
  active?: boolean;
  recalculate_rating?: boolean;
  // Tier 1
  polishes?: string[] | null;
  symmetries?: string[] | null;
  fluorescences?: string[] | null;
  certificate_labs?: string[] | null;
  lab_grown?: boolean | null;
  carat_min?: number | null;
  carat_max?: number | null;
  // Tier 2
  table_min?: number | null;
  table_max?: number | null;
  depth_min?: number | null;
  depth_max?: number | null;
  crown_angle_min?: number | null;
  crown_angle_max?: number | null;
  crown_height_min?: number | null;
  crown_height_max?: number | null;
  pavilion_angle_min?: number | null;
  pavilion_angle_max?: number | null;
  pavilion_depth_min?: number | null;
  pavilion_depth_max?: number | null;
  girdles?: string[] | null;
  culet_sizes?: string[] | null;
  ratio_min?: number | null;
  ratio_max?: number | null;
}

export async function getRatingRules(): Promise<RatingRulesResponse> {
  const response = await api.get<{ data: RatingRulesResponse }>('/rating-rules');
  return response.data.data;
}

export async function createRatingRule(rule: CreateRatingRuleInput): Promise<{ rule: RatingRule; reapply_job_id?: string }> {
  const response = await api.post<{ data: RatingRule & { reapply_job_id?: string } }>('/rating-rules', rule);
  const { reapply_job_id, ...ruleData } = response.data.data;
  return { rule: ruleData, reapply_job_id };
}

export async function updateRatingRule(id: string, updates: UpdateRatingRuleInput): Promise<{ reapply_job_id?: string }> {
  const response = await api.put<{ data: { message: string; id: string; reapply_job_id?: string } }>(`/rating-rules/${id}`, updates);
  return { reapply_job_id: response.data.data.reapply_job_id };
}

export async function deleteRatingRule(id: string): Promise<void> {
  await api.delete(`/rating-rules/${id}`);
}

// --- Reapply rating ---

export interface RatingReapplyJob {
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
  trigger_rule_snapshot: Record<string, unknown> | null;
}

export async function getRatingReapplyJobs(): Promise<RatingReapplyJob[]> {
  const response = await api.get<{ data: { jobs: RatingReapplyJob[] } }>('/rating-rules/reapply/jobs');
  return response.data.data.jobs;
}

export async function getRatingReapplyJob(id: string): Promise<RatingReapplyJob> {
  const response = await api.get<{ data: RatingReapplyJob }>(`/rating-rules/reapply/jobs/${id}`);
  return response.data.data;
}

export async function revertRatingReapplyJob(id: string): Promise<void> {
  await api.post(`/rating-rules/reapply/jobs/${id}/revert`);
}

export async function resumeRatingReapplyJob(id: string): Promise<void> {
  await api.post(`/rating-rules/reapply/jobs/${id}/resume`);
}
