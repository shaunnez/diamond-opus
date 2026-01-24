import { z } from 'zod';

export const diamondSearchSchema = z.object({
  shape: z.string().optional(),
  carat_min: z.coerce.number().positive().optional(),
  carat_max: z.coerce.number().positive().optional(),
  color: z.union([z.string(), z.array(z.string())]).optional(),
  clarity: z.union([z.string(), z.array(z.string())]).optional(),
  cut: z.union([z.string(), z.array(z.string())]).optional(),
  lab_grown: z.coerce.boolean().optional(),
  price_min: z.coerce.number().int().positive().optional(),
  price_max: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  sort_by: z.enum(['created_at', 'supplier_price_cents', 'carats', 'color', 'clarity']).default('created_at'),
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
  return_option: z.string().optional(),
});

export type PurchaseRequestBody = z.infer<typeof purchaseRequestSchema>;
