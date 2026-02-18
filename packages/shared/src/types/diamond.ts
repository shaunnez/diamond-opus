export type DiamondStatus = 'active' | 'deleted';

export type DiamondAvailability = 'available' | 'on_hold' | 'sold' | 'unavailable';

export type DiamondShape =
  | 'ROUND'
  | 'OVAL'
  | 'EMERALD'
  | 'CUSHION'
  | 'CUSHION B'
  | 'CUSHION MODIFIED'
  | 'CUSHION BRILLIANT'
  | 'ASSCHER'
  | 'RADIANT'
  | 'MARQUISE'
  | 'PEAR'
  | 'PRINCESS'
  | 'ROSE'
  | 'OLD MINER'
  | 'TRILLIANT'
  | 'HEXAGONAL'
  | 'HEART';

// Removed DiamondMeasurements and DiamondAttributes interfaces
// These fields are now direct columns on the Diamond table

export interface Diamond {
  id: string;
  feed: string;
  supplierStoneId: string;
  offerId: string;
  shape: string;
  carats?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  fluorescenceIntensity?: string;
  fancyColor?: string;
  fancyIntensity?: string;
  fancyOvertone?: string;
  ratio?: number;
  labGrown: boolean;
  treated: boolean;
  feedPrice: number;
  diamondPrice?: number;
  pricePerCarat: number;
  priceModelPrice?: number;
  /** NZD equivalent of priceModelPrice (model/selling price). Hero price shown to customers. */
  priceModelNzd?: number;
  /** NZD equivalent of feedPrice (pre-markup cost price). Shown as strikethrough for reference. */
  priceNzd?: number;
  markupRatio?: number;
  pricingRating?: number;
  rating?: number;
  availability: DiamondAvailability;
  rawAvailability?: string;
  holdId?: string;
  imageUrl?: string;
  videoUrl?: string;
  certificateLab?: string;
  certificateNumber?: string;
  certificatePdfUrl?: string;
  // Denormalized measurement fields
  tablePct?: number;
  depthPct?: number;
  lengthMm?: number;
  widthMm?: number;
  depthMm?: number;
  crownAngle?: number;
  crownHeight?: number;
  pavilionAngle?: number;
  pavilionDepth?: number;
  girdle?: string;
  culetSize?: string;
  // Denormalized attribute fields
  eyeClean?: boolean | null;
  brown?: string;
  green?: string;
  milky?: string;
  supplierName?: string;
  supplierLegalName?: string;
  status: DiamondStatus;
  sourceUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Slim diamond shape for list/card views. Contains only the fields needed
 * to render a diamond card. Raw USD prices are excluded; NZD prices are pre-computed.
 */
export interface DiamondSlim {
  id: string;
  feed: string;
  shape: string;
  carats?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  fancyColor?: string;
  fancyIntensity?: string;
  labGrown: boolean;
  /** NZD selling price (from priceModelPrice). Hero price. */
  priceModelNzd?: number;
  /** NZD cost price (from feedPrice). Shown as strikethrough. */
  priceNzd?: number;
  markupRatio?: number;
  rating?: number;
  availability: DiamondAvailability;
  certificateLab?: string;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: Date;
}

export interface DiamondSearchParams {
  feed?: string;
  shapes?: string[];
  caratMin?: number;
  caratMax?: number;
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  labGrown?: boolean;
  priceMin?: number;
  priceMax?: number;
  fancyColor?: boolean;
  fancyColors?: string[];
  fancyIntensities?: string[];
  fluorescenceIntensities?: string[];
  polishes?: string[];
  symmetries?: string[];
  ratioMin?: number;
  ratioMax?: number;
  tableMin?: number;
  tableMax?: number;
  depthPercentageMin?: number;
  depthPercentageMax?: number;
  crownAngleMin?: number;
  crownAngleMax?: number;
  pavAngleMin?: number;
  pavAngleMax?: number;
  labs?: string[];
  eyeClean?: boolean;
  noBgm?: boolean;
  lengthMin?: number;
  lengthMax?: number;
  widthMin?: number;
  widthMax?: number;
  depthMeasurementMin?: number;
  depthMeasurementMax?: number;
  ratingMin?: number;
  ratingMax?: number;
  availability?: string[];
  priceModelPriceMin?: number;
  priceModelPriceMax?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  fields?: 'full' | 'slim';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
