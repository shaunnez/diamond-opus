export interface DiamondMeasurements {
  length?: number;
  width?: number;
  depth?: number;
  depthPercentage?: number;
  table?: number;
  crownAngle?: number;
  crownHeight?: number;
  pavAngle?: number;
  pavHeight?: number;
  pavDepth?: number;
  girdle?: string;
  culetSize?: string;
  starLength?: number;
  lowerGirdle?: number;
}

export interface DiamondAttributes {
  eyeClean?: boolean;
  brown?: boolean;
  green?: boolean;
  blue?: boolean;
  gray?: boolean;
  milky?: boolean;
  bowtie?: string;
  mineOfOrigin?: string;
  cutStyle?: string;
  comments?: string;
  countryOfOrigin?: string;
  colorShade?: string;
}

export type DiamondAvailability = 'available' | 'on_hold' | 'sold' | 'unavailable';

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
  priceNzd?: number;
  markupRatio?: number;
  rating?: number;
  availability: DiamondAvailability;
  rawAvailability?: string;
  holdId?: string;
  imageUrl?: string;
  videoUrl?: string;
  certificateLab?: string;
  certificateNumber?: string;
  certificatePdfUrl?: string;
  measurements?: DiamondMeasurements;
  attributes?: DiamondAttributes;
  supplierName?: string;
  supplierLegalName?: string;
  status: 'active' | 'deleted';
  sourceUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DiamondSearchResponse {
  data: Diamond[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DiamondSearchParams {
  shape?: string[];
  carat_min?: number;
  carat_max?: number;
  color?: string[];
  clarity?: string[];
  cut?: string[];
  lab_grown?: boolean;
  price_min?: number;
  price_max?: number;
  fancy_color?: string[];
  fancy_intensity?: string[];
  fluorescence_intensity?: string[];
  polish?: string[];
  symmetry?: string[];
  ratio_min?: number;
  ratio_max?: number;
  table_min?: number;
  table_max?: number;
  depth_pct_min?: number;
  depth_pct_max?: number;
  lab?: string[];
  eye_clean?: boolean;
  no_bgm?: boolean;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export type StoneType = 'all' | 'natural' | 'lab' | 'fancy';

export interface HoldResponse {
  id: string;
  denied: boolean;
  until?: string;
}

export interface AvailabilityResponse {
  id: string;
  availability: DiamondAvailability;
  hold_id?: string;
}
