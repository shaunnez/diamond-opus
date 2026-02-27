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
  // Tier 1: Grading filters
  polishes?: string[];
  symmetries?: string[];
  fluorescences?: string[];
  certificateLabs?: string[];
  labGrown?: boolean;
  caratMin?: number;
  caratMax?: number;
  // Tier 2: Measurement filters
  tableMin?: number;
  tableMax?: number;
  depthMin?: number;
  depthMax?: number;
  crownAngleMin?: number;
  crownAngleMax?: number;
  crownHeightMin?: number;
  crownHeightMax?: number;
  pavilionAngleMin?: number;
  pavilionAngleMax?: number;
  pavilionDepthMin?: number;
  pavilionDepthMax?: number;
  girdles?: string[];
  culetSizes?: string[];
  ratioMin?: number;
  ratioMax?: number;
}
