import { api } from './client';
import type { Diamond, DiamondSearchParams, PaginatedResponse } from '@diamond/shared';

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
  const response = await api.get<{ data: DiamondSummary[] }>(`/trading/diamonds/search?${params}`);
  return response.data.data;
}

export async function getDiamondById(id: string): Promise<DiamondSummary> {
  const response = await api.get<{ data: DiamondSummary }>(`/trading/diamonds/${id}`);
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

export async function cancelOrder(orderId: string): Promise<CancelResponse> {
  const response = await api.post<{ data: CancelResponse }>(
    '/trading/cancel-order',
    { order_id: orderId }
  );
  return response.data.data;
}

// ============================================================================
// Storefront - Browse diamonds
// ============================================================================

export interface StorefrontFilters extends Partial<DiamondSearchParams> {
  feed?: string;
}

export async function getDiamondsForStorefront(
  filters: StorefrontFilters = {},
  page = 1,
  limit = 24
): Promise<PaginatedResponse<Diamond>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  // Add filters (using snake_case to match backend)
  if (filters.shapes?.length) {
    filters.shapes.forEach(shape => params.append('shape', shape));
  }
  if (filters.caratMin !== undefined) {
    params.set('carat_min', String(filters.caratMin));
  }
  if (filters.caratMax !== undefined) {
    params.set('carat_max', String(filters.caratMax));
  }
  if (filters.colors?.length) {
    filters.colors.forEach(color => params.append('color', color));
  }
  if (filters.clarities?.length) {
    filters.clarities.forEach(clarity => params.append('clarity', clarity));
  }
  if (filters.cuts?.length) {
    filters.cuts.forEach(cut => params.append('cut', cut));
  }
  if (filters.labGrown !== undefined) {
    params.set('lab_grown', String(filters.labGrown));
  }
  if (filters.priceMin !== undefined) {
    params.set('price_min', String(filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    params.set('price_max', String(filters.priceMax));
  }

  const response = await api.get<PaginatedResponse<Diamond>>(`/diamonds?${params}`);

  // Filter by feed on client side if specified (backend doesn't support feed filtering yet)
  let data = response.data;
  if (filters.feed && filters.feed !== 'all') {
    data = {
      ...data,
      data: data.data.filter(d => d.feed === filters.feed),
      pagination: {
        ...data.pagination,
        total: data.data.filter(d => d.feed === filters.feed).length,
      },
    };
  }

  return data;
}

export async function getDiamondDetails(id: string): Promise<Diamond> {
  const response = await api.get<{ data: Diamond }>(`/diamonds/${id}`);
  return response.data.data;
}
