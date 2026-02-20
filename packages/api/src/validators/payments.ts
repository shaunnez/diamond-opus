import { z } from 'zod';

export const createCheckoutSchema = z.object({
  diamond_id: z.string().uuid(),
  reference: z.string().optional(),
  comments: z.string().optional(),
});

export type CreateCheckoutBody = z.infer<typeof createCheckoutSchema>;
