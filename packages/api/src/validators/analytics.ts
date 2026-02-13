import { z } from 'zod';

export const runsQuerySchema = z.object({
  run_type: z.enum(['full', 'incremental']).optional(),
  status: z.enum(['running', 'completed', 'failed', 'partial', 'stalled']).optional(),
  feed: z.string().optional(),
  started_after: z.coerce.date().optional(),
  started_before: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type RunsQuery = z.infer<typeof runsQuerySchema>;

export const runIdSchema = z.object({
  runId: z.string().uuid(),
});

export type RunIdParams = z.infer<typeof runIdSchema>;

export const queryProxySchema = z.object({
  select: z.string().optional(),
  filters: z.record(z.record(z.unknown())).optional(),
  order: z.object({
    column: z.string(),
    ascending: z.boolean(),
  }).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryProxyBody = z.infer<typeof queryProxySchema>;

export const tableParamSchema = z.object({
  table: z.enum(['diamonds', 'run_metadata', 'worker_runs']),
});

export type TableParams = z.infer<typeof tableParamSchema>;

export const consolidationQuerySchema = z.object({
  feed: z.enum(['nivoda', 'demo']).default('nivoda'),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export type ConsolidationQuery = z.infer<typeof consolidationQuerySchema>;

export const triggerSchedulerSchema = z.object({
  run_type: z.enum(['full', 'incremental']).default('incremental'),
  feed: z.string().optional(),
});

export type TriggerSchedulerBody = z.infer<typeof triggerSchedulerSchema>;

export const triggerConsolidateSchema = z.object({
  run_id: z.string().uuid(),
  force: z.boolean().default(false),
});

export type TriggerConsolidateBody = z.infer<typeof triggerConsolidateSchema>;

export const retryWorkersSchema = z.object({
  run_id: z.string().uuid(),
  partition_id: z.string().optional(),
});

export type RetryWorkersBody = z.infer<typeof retryWorkersSchema>;

export const resumeConsolidateSchema = z.object({
  run_id: z.string().uuid(),
});

export type ResumeConsolidateBody = z.infer<typeof resumeConsolidateSchema>;

export const demoSeedSchema = z.object({
  mode: z.enum(['full', 'incremental']).default('full'),
  count: z.coerce.number().int().positive().max(500000).optional(),
});

export type DemoSeedBody = z.infer<typeof demoSeedSchema>;

export const cancelRunSchema = z.object({
  run_id: z.string().uuid(),
  reason: z.string().optional(),
});

export type CancelRunBody = z.infer<typeof cancelRunSchema>;

export const deleteRunSchema = z.object({
  run_id: z.string().uuid(),
});

export type DeleteRunBody = z.infer<typeof deleteRunSchema>;
