export interface ApiKey {
  id: string;
  keyHash: string;
  clientName: string;
  permissions: string[];
  active: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

export interface HoldHistory {
  id: string;
  diamondId: string;
  feed: string;
  feedHoldId?: string;
  offerId: string;
  status: 'active' | 'expired' | 'released';
  denied: boolean;
  holdUntil?: Date;
  createdAt: Date;
}

export interface PurchaseHistory {
  id: string;
  orderNumber?: string;
  diamondId: string;
  feed: string;
  feedOrderId?: string;
  offerId: string;
  idempotencyKey: string;
  status: 'pending' | 'pending_payment' | 'paid' | 'confirmed' | 'failed' | 'expired' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  feedOrderStatus: 'not_attempted' | 'pending' | 'success' | 'failed';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  amountCents?: number;
  currency?: string;
  feedOrderError?: string;
  reference?: string;
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HoldRequest {
  offerId: string;
}

export interface HoldResponse {
  id: string;
  denied: boolean;
  until?: string;
}

export interface PurchaseRequest {
  destinationId: string;
  reference?: string;
  comments?: string;
  returnOption?: string;
}

export interface PurchaseResponse {
  id: string;
  status: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface NivodaConfig {
  endpoint: string;
  proxyEnabled: boolean;
  proxyUrl?: string;
}

export interface SystemConfig {
  nivoda: NivodaConfig;
}
