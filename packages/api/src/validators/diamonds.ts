import { z } from 'zod';

/**
 * Zod schema for boolean query parameters.
 * z.coerce.boolean() uses Boolean() which treats any non-empty string as true,
 * so "false" would incorrectly become true. This handles string values correctly.
 */
const booleanQueryParam = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean().optional(),
);

export const diamondSearchSchema = z.object({
  feed: z.string().optional(),
  shape: z.union([z.string(), z.array(z.string())]).optional(),
  carat_min: z.coerce.number().positive().optional(),
  carat_max: z.coerce.number().positive().optional(),
  color: z.union([z.string(), z.array(z.string())]).optional(),
  clarity: z.union([z.string(), z.array(z.string())]).optional(),
  cut: z.union([z.string(), z.array(z.string())]).optional(),
  lab_grown: booleanQueryParam,
  price_min: z.coerce.number().positive().optional(),
  price_max: z.coerce.number().positive().optional(),
  fancy_color: booleanQueryParam,
  fancy_intensity: z.union([z.string(), z.array(z.string())]).optional(),
  fluorescence_intensity: z.union([z.string(), z.array(z.string())]).optional(),
  polish: z.union([z.string(), z.array(z.string())]).optional(),
  symmetry: z.union([z.string(), z.array(z.string())]).optional(),
  ratio_min: z.coerce.number().positive().optional(),
  ratio_max: z.coerce.number().positive().optional(),
  table_min: z.coerce.number().positive().optional(),
  table_max: z.coerce.number().positive().optional(),
  depth_pct_min: z.coerce.number().positive().optional(),
  depth_pct_max: z.coerce.number().positive().optional(),
  crown_angle_min: z.coerce.number().positive().optional(),
  crown_angle_max: z.coerce.number().positive().optional(),
  pav_angle_min: z.coerce.number().positive().optional(),
  pav_angle_max: z.coerce.number().positive().optional(),
  lab: z.union([z.string(), z.array(z.string())]).optional(),
  eye_clean: booleanQueryParam,
  no_bgm: booleanQueryParam,
  length_min: z.coerce.number().positive().optional(),
  length_max: z.coerce.number().positive().optional(),
  width_min: z.coerce.number().positive().optional(),
  width_max: z.coerce.number().positive().optional(),
  depth_mm_min: z.coerce.number().positive().optional(),
  depth_mm_max: z.coerce.number().positive().optional(),
  rating_min: z.coerce.number().int().min(1).max(10).optional(),
  rating_max: z.coerce.number().int().min(1).max(10).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  sort_by: z.enum(['created_at', 'feed_price', 'carats', 'color', 'clarity', 'ratio', 'fancy_color', 'fluorescence_intensity', 'certificate_lab']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type DiamondSearchQuery = z.infer<typeof diamondSearchSchema>;

export const diamondIdSchema = z.object({
  id: z.string().uuid(),
});

export type DiamondIdParams = z.infer<typeof diamondIdSchema>;

export const holdRequestSchema = z.object({});

export const purchaseRequestSchema = z.object({
  destination_id: z.string().min(1),
  reference: z.string().optional(),
  comments: z.string().optional(),
  return_option: z.boolean().optional(),
});

export type PurchaseRequestBody = z.infer<typeof purchaseRequestSchema>;
