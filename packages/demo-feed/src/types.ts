/**
 * Raw item shape returned by the demo feed API.
 * Deliberately different field names from Nivoda to prove the mapper abstraction.
 */
export interface DemoFeedItem {
  id: string;
  stone_id: string;
  weight_ct: number;
  stone_shape: string;
  stone_color: string;
  stone_clarity: string;
  cut_grade: string | null;
  polish_grade: string | null;
  symmetry_grade: string | null;
  fluorescence_level: string | null;
  asking_price_usd: number;
  price_per_ct_usd: number;
  is_lab_created: boolean;
  is_treated: boolean;
  availability_status: string;
  cert_lab: string | null;
  cert_number: string | null;
  image_link: string | null;
  video_link: string | null;
  vendor_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemoFeedSearchResponse {
  items: DemoFeedItem[];
  count: number;
  offset: number;
  limit: number;
}

export interface DemoFeedCountResponse {
  total_count: number;
}
