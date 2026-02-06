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
  girdleCondition?: string;
  culetCondition?: string;
}

export interface DiamondAttributes {
  eyeClean?: boolean;
  brown?: string;
  green?: string;
  blue?: string;
  gray?: string;
  milky?: string;
  bowtie?: string;
  mineOfOrigin?: string;
  cutStyle?: string;
  keyToSymbols?: string;
  comments?: string;
}

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
  labGrown: boolean;
  treated: boolean;
  priceModelPrice: number;
  pricePerCarat: number;
  retailPrice?: number;
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
  status: DiamondStatus;
  sourceUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface DiamondSearchParams {
  shape?: string;
  caratMin?: number;
  caratMax?: number;
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  labGrown?: boolean;
  priceMin?: number;
  priceMax?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
