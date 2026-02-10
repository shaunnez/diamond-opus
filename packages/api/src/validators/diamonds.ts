import { z } from 'zod';

export const diamondSearchSchema = z.object({
  shape: z.string().optional(),
  carat_min: z.coerce.number().positive().optional(),
  carat_max: z.coerce.number().positive().optional(),
  color: z.union([z.string(), z.array(z.string())]).optional(),
  clarity: z.union([z.string(), z.array(z.string())]).optional(),
  cut: z.union([z.string(), z.array(z.string())]).optional(),
  lab_grown: z.coerce.boolean().optional(),
  price_min: z.coerce.number().positive().optional(),
  price_max: z.coerce.number().positive().optional(),
  fancy_color: z.union([z.string(), z.array(z.string())]).optional(),
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
  eye_clean: z.coerce.boolean().optional(),
  no_bgm: z.coerce.boolean().optional(),
  length_min: z.coerce.number().positive().optional(),
  length_max: z.coerce.number().positive().optional(),
  width_min: z.coerce.number().positive().optional(),
  width_max: z.coerce.number().positive().optional(),
  depth_mm_min: z.coerce.number().positive().optional(),
  depth_mm_max: z.coerce.number().positive().optional(),
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
