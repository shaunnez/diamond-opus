export interface RatingRule {
  id: string;
  priority: number;
  priceMin?: number;
  priceMax?: number;
  shapes?: string[];
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  feed?: string;
  rating: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
