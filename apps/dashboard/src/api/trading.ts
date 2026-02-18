import { api } from './client';

// ============================================================================
// Types
// ============================================================================

export interface DiamondSummary {
  id: string;
  feed: string;
  supplierStoneId: string;
  offerId: string;
  shape: string;
  carats?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  labGrown: boolean;
  feedPrice: number;
  availability: string;
  certificateLab?: string;
  certificateNumber?: string;
  supplierName?: string;
  imageUrl?: string;
  videoUrl?: string;
  diamondPrice?: number;
}

export interface HoldResponse {
  hold_id: string;
  denied: boolean;
  until?: string;
  message: string;
}

export interface OrderResponse {
  order_id: string;
  purchase_id: string;
  message: string;
}

export interface CancelResponse {
  hold_id?: string;
  order_id?: string;
  status: string;
  message: string;
}

export interface CreateOrderOptions {
  diamond_id: string;
  destination_id?: string;
  reference?: string;
  comments?: string;
}

// ============================================================================
// Diamond lookup
// ============================================================================

export async function searchDiamonds(q: string, limit = 10, feed?: string): Promise<DiamondSummary[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (feed) params.set('feed', feed);
  const response = await api.get<{ data: DiamondSummary[] }>(`/trading/search?${params}`);
  return response.data.data;
}

export async function getDiamondById(id: string): Promise<DiamondSummary> {
  const response = await api.get<{ data: DiamondSummary }>(`/trading/${id}`);
  return response.data.data;
}

// ============================================================================
// Holds
// ============================================================================

export async function placeHold(diamondId: string): Promise<HoldResponse> {
  const response = await api.post<{ data: HoldResponse } | { error: { code: string; message: string }; data: { hold_id: string; denied: boolean } }>(
    '/trading/hold',
    { diamond_id: diamondId }
  );
  if ('error' in response.data) {
    throw new Error(response.data.error.message);
  }
  return response.data.data;
}

export async function cancelHold(holdId: string): Promise<CancelResponse> {
  const response = await api.post<{ data: CancelResponse }>(
    '/trading/cancel-hold',
    { hold_id: holdId }
  );
  return response.data.data;
}

// ============================================================================
// Orders
// ============================================================================

export async function createOrder(options: CreateOrderOptions): Promise<OrderResponse> {
  const response = await api.post<{ data: OrderResponse }>('/trading/order', options);
  return response.data.data;
}

