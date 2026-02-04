export interface NivodaDeliveryTime {
  express_timeline_applicable: boolean;
  min_business_days: number;
  max_business_days: number;
}

export interface NivodaCertificate {
  id: string;
  lab: string;
  certNumber: string;
  pdfUrl?: string;
  shape: string;
  fullShape?: string;
  carats: number;
  clarity: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  color: string;
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
  floInt?: string;
  floCol?: string;
  verified?: boolean;
  labgrown?: boolean;
  labgrown_type?: string;
  treated?: boolean;
  girdle?: string;
  culetSize?: string;
  girdleCondition?: string;
  culet_condition?: string;
  cut_style?: string;
  keyToSymbols?: string;
  comments?: string;
}

export interface NivodaSupplier {
  id: string;
  name: string;
  legal_name?: string;
}

export interface NivodaDiamond {
  id: string;
  availability: string;
  HoldId?: string;
  NivodaStockId: string;
  supplierStockId?: string;
  image?: string;
  video?: string;
  eyeClean?: boolean;
  brown?: string;
  green?: string;
  blue?: string;
  gray?: string;
  milky?: string;
  bowtie?: string;
  mine_of_origin?: string;
  supplier_video_link?: string;
  approval_type?: string;
  final_price?: number;
  show_measurements?: boolean;
  show_certificate_number?: boolean;
  return_window?: string;
  CertificateType?: string;
  delivery_time?: NivodaDeliveryTime;
  certificate: NivodaCertificate;
  supplier?: NivodaSupplier;
}

export interface NivodaItem {
  id: string;
  price: number;
  discount?: number;
  diamond_price?: number;
  markup_price?: number;
  markup_discount?: number;
  diamond: NivodaDiamond;
}

export interface NivodaDiamondsResponse {
  total_count: number;
  items: NivodaItem[];
}

export interface NivodaQuery {
  dollar_value?: { from?: number; to?: number };
  sizes?: { from?: number; to?: number };
  shapes?: string[];
  labgrown?: boolean;
  has_image?: boolean;
  has_video?: boolean;
}

export interface NivodaHoldResponse {
  id: string;
  denied: boolean;
  until?: string;
}


export interface NivodaOrderItemInput {
  offerId: string;
  customer_comment?: string;
  customer_order_number?: string;
  return_option?: boolean;
  destinationId?: string;
}