export interface PricingRule {
  id: string;
  priority: number;
  caratMin?: number;
  caratMax?: number;
  shapes?: string[];
  labGrown?: boolean;
  supplier?: string;
  markupRatio: number;
  rating?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingResult {
  supplierPriceCents: number;
  retailPriceCents: number;
  pricePerCaratCents: number;
  markupRatio: number;
  rating?: number;
  matchedRuleId?: string;
}
