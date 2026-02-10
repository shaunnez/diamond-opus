export type StoneType = 'natural' | 'lab' | 'fancy';

export interface PricingRule {
  id: string;
  priority: number;
  stoneType?: StoneType;
  priceMin?: number;
  priceMax?: number;
  feed?: string;
  marginModifier: number;
  rating?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingResult {
  feedPrice: number;
  priceModelPrice: number;
  pricePerCarat: number;
  markupRatio: number;
  rating?: number;
  matchedRuleId?: string;
  stoneType: StoneType;
  baseMargin: number;
  marginModifier: number;
  effectiveMargin: number;
}
