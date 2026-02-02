export interface PricingRule {
  id: string;
  priority: number;
  caratMin?: number;
  caratMax?: number;
  shapes?: string[];
  labGrown?: boolean;
  feed?: string;
  markupRatio: number;
  rating?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingResult {
  feedPriceCents: number;
  retailPriceCents: number;
  pricePerCaratCents: number;
  markupRatio: number;
  rating?: number;
  matchedRuleId?: string;
}
