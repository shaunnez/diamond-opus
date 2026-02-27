import { api } from './client';
import type {
  Diamond,
  DiamondSearchParams,
  DiamondSearchResponse,
  HoldResponse,
  AvailabilityResponse,
} from '../types/diamond';
import { SHAPE_GROUPS } from '../utils/shapes';

export async function searchDiamonds(params: DiamondSearchParams): Promise<DiamondSearchResponse> {
  const query: Record<string, string> = {};

  if (params.feed) query.feed = params.feed;
  if (params.shape?.length) {
    const expandedShapes = params.shape.flatMap(s => SHAPE_GROUPS[s] ?? [s]);
    query.shape = expandedShapes.join(',');
  }
  if (params.carat_min !== undefined) query.carat_min = String(params.carat_min);
  if (params.carat_max !== undefined) query.carat_max = String(params.carat_max);
  if (params.color?.length) query.color = params.color.join(',');
  if (params.clarity?.length) query.clarity = params.clarity.join(',');
  if (params.cut?.length) query.cut = params.cut.join(',');
  if (params.lab_grown !== undefined) query.lab_grown = String(params.lab_grown);
  if (params.fancy_color !== undefined) query.fancy_color = String(params.fancy_color);
  
  if (params.price_min !== undefined) query.price_min = String(params.price_min);
  if (params.price_max !== undefined) query.price_max = String(params.price_max);
  // if (params.fancy_color?.length) query.fancy_color = params.fancy_color.join(',');
  if (params.fancy_intensity?.length) query.fancy_intensity = params.fancy_intensity.join(',');
  if (params.fancy_colors?.length) query.fancy_colors = params.fancy_colors.join(',');
  if (params.fluorescence_intensity?.length) query.fluorescence_intensity = params.fluorescence_intensity.join(',');
  if (params.polish?.length) query.polish = params.polish.join(',');
  if (params.symmetry?.length) query.symmetry = params.symmetry.join(',');
  if (params.ratio_min !== undefined) query.ratio_min = String(params.ratio_min);
  if (params.ratio_max !== undefined) query.ratio_max = String(params.ratio_max);
  if (params.table_min !== undefined) query.table_min = String(params.table_min);
  if (params.table_max !== undefined) query.table_max = String(params.table_max);
  if (params.depth_pct_min !== undefined) query.depth_pct_min = String(params.depth_pct_min);
  if (params.depth_pct_max !== undefined) query.depth_pct_max = String(params.depth_pct_max);
  if (params.lab?.length) query.lab = params.lab.join(',');
  if (params.eye_clean !== undefined) query.eye_clean = String(params.eye_clean);
  if (params.no_bgm !== undefined) query.no_bgm = String(params.no_bgm);
  if (params.availability?.length) query.availability = params.availability.join(',');
  if (params.price_model_price_min !== undefined) query.price_model_price_min = String(params.price_model_price_min);
  if (params.price_model_price_max !== undefined) query.price_model_price_max = String(params.price_model_price_max);
  if (params.page) query.page = String(params.page);
  if (params.limit) query.limit = String(params.limit);
  if (params.sort_by) query.sort_by = params.sort_by;
  if (params.sort_order) query.sort_order = params.sort_order;
  if (params.fields) query.fields = params.fields;

  const response = await api.get<DiamondSearchResponse>('/diamonds', { params: query });
  return response.data;
}

export async function getDiamond(id: string): Promise<Diamond> {
  const response = await api.get<{ data: Diamond }>(`/diamonds/${id}`);
  return response.data.data;
}

export async function checkAvailability(id: string): Promise<AvailabilityResponse> {
  const response = await api.post<{ data: AvailabilityResponse }>(`/diamonds/${id}/availability`);
  return response.data.data;
}

export async function placeDiamondHold(id: string): Promise<HoldResponse> {
  const response = await api.post<{ data: HoldResponse }>(`/diamonds/${id}/hold`);
  return response.data.data;
}

export async function purchaseDiamond(
  idempotencyKey: string,
  options?: { destination_id?: string; reference?: string; comments?: string }
): Promise<{ id: string; status: string }> {
  const response = await api.post<{ data: { id: string; status: string } }>(
    `/diamonds/purchase`,
    {
      destination_id: options?.destination_id || 'default',
      reference: options?.reference,
      comments: options?.comments,
    },
    {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    }
  );
  return response.data.data;
}

export async function cancelDiamondHold(diamondId: string): Promise<{ hold_id: string; status: string; message: string }> {
  const response = await api.post<{ data: { hold_id: string; status: string; message: string } }>(
    `/diamonds/${diamondId}/cancel-hold`
  );
  return response.data.data;
}

export async function createCheckout(
  diamondId: string,
  options?: { reference?: string; comments?: string }
): Promise<{ checkoutUrl: string; orderNumber: string }> {
  const response = await api.post<{ data: { checkoutUrl: string; orderNumber: string } }>(
    '/checkout/create',
    { diamond_id: diamondId, reference: options?.reference, comments: options?.comments }
  );
  return response.data.data;
}

export interface RecommendedDiamonds {
  highest_rated: Diamond | null;
  most_expensive: Diamond | null;
  mid_rated: Diamond | null;
}

export async function getRecommendedDiamonds(
  id: string,
  options?: { carat_tolerance?: number }
): Promise<RecommendedDiamonds> {
  const query: Record<string, string> = {};
  if (options?.carat_tolerance !== undefined) query.carat_tolerance = String(options.carat_tolerance);
  const response = await api.get<{ data: RecommendedDiamonds }>(`/diamonds/${id}/related`, { params: query });
  return response.data.data;
}
