import { api } from './client';

export interface NivodaCertificate {
  lab: string;
  number: string;
  shape: string;
  carats: number;
  color: string;
  clarity: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  lab_grown?: boolean;
}

export interface NivodaSupplier {
  id: string;
  name: string;
}

export interface NivodaDiamond {
  id: string;
  availability: string;
  hold_id?: string;
  stock_id: string;
  supplier_stock_id?: string;
  image?: string;
  video?: string;
  certificate: NivodaCertificate;
  supplier?: NivodaSupplier;
}

export interface NivodaSearchItem {
  offer_id: string;
  price: number;
  discount?: number;
  diamond: NivodaDiamond;
}

export interface NivodaSearchResponse {
  total_count: number;
  items: NivodaSearchItem[];
}

export interface NivodaSearchOptions {
  price_min?: number;
  price_max?: number;
  carat_min?: number;
  carat_max?: number;
  has_image?: boolean;
  has_v360?: boolean;
  offset?: number;
  limit?: number;
}

export interface HoldResponse {
  hold_id: string;
  denied: boolean;
  until?: string;
  message: string;
}

export interface OrderResponse {
  order_id: string;
  status: string;
  message: string;
}

export interface CreateOrderOptions {
  offer_id: string;
  destination_id?: string;
  reference?: string;
  comments?: string;
  return_option?: string;
}

export interface CountResponse {
  count: number;
}

// Search diamonds from Nivoda
export async function searchNivodaDiamonds(options: NivodaSearchOptions = {}): Promise<NivodaSearchResponse> {
  const response = await api.post<{ data: NivodaSearchResponse }>('/nivoda/search', options);
  return response.data.data;
}

// Get count of diamonds matching query
export async function getNivodaCount(options: Partial<NivodaSearchOptions> = {}): Promise<number> {
  const response = await api.post<{ data: CountResponse }>('/nivoda/count', options);
  return response.data.data.count;
}

// Place a hold on a diamond
export async function placeHold(offerId: string): Promise<HoldResponse> {
  const response = await api.post<{ data: HoldResponse } | { error: { code: string; message: string }; data: { hold_id: string; denied: boolean } }>(
    '/nivoda/hold',
    { offer_id: offerId }
  );
  if ('error' in response.data) {
    throw new Error(response.data.error.message);
  }
  return response.data.data;
}

// Create an order
export async function createOrder(options: CreateOrderOptions): Promise<OrderResponse> {
  const response = await api.post<{ data: OrderResponse }>('/nivoda/order', options);
  return response.data.data;
}

// Cancel a hold
export async function cancelHold(holdId: string): Promise<{ hold_id: string; status: string; message: string }> {
  const response = await api.post<{ data: { hold_id: string; status: string; message: string } }>(
    '/nivoda/cancel-hold',
    { hold_id: holdId }
  );
  return response.data.data;
}

// Get diamond by offer ID from local database
export async function getDiamondByOfferId(offerId: string): Promise<unknown> {
  const response = await api.get<{ data: unknown }>(`/nivoda/diamond/${offerId}`);
  return response.data.data;
}
