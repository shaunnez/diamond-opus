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
  starLength?: number;
  lowerGirdle?: number;
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
  countryOfOrigin?: string;
  colorShade?: string;
  mixTinge?: string;
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
  status: DiamondStatus;
  sourceUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface DiamondSearchParams {
  shapes?: string[];
  caratMin?: number;
  caratMax?: number;
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  labGrown?: boolean;
  priceMin?: number;
  priceMax?: number;
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
