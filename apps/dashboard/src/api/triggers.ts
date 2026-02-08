import { api } from './client';

export interface TriggerSchedulerResponse {
  message: string;
  run_type: 'full' | 'incremental';
  feed?: string;
  status: string;
  note?: string;
}

export interface TriggerConsolidateResponse {
  message: string;
  run_id: string;
  trace_id: string;
  force: boolean;
  run_metadata: {
    run_type: 'full' | 'incremental';
    expected_workers: number;
    completed_workers: number;
    failed_workers: number;
  };
}

export interface RetryWorkersResponse {
  message: string;
  run_id: string;
  retried_partitions: string[];
  skipped?: { partitionId: string; reason: string }[];
  remaining_failed: number;
}

export interface FailedWorker {
  partition_id: string;
  worker_id: string;
  error_message?: string;
  records_processed: number;
  has_payload: boolean;
  started_at: string;
  completed_at?: string;
}

export interface FailedWorkersResponse {
  run_id: string;
  total_failed: number;
  workers: FailedWorker[];
}

export interface SchedulerErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
  };
  manual_command: string;
  help?: string;
}

export class SchedulerTriggerError extends Error {
  code: string;
  details?: string;
  manualCommand: string;
  help?: string;

  constructor(response: SchedulerErrorResponse) {
    super(response.error.message);
    this.name = 'SchedulerTriggerError';
    this.code = response.error.code;
    this.details = response.error.details;
    this.manualCommand = response.manual_command;
    this.help = response.help;
  }
}

// Trigger a new scheduler run
export async function triggerScheduler(runType: 'full' | 'incremental', feed?: string): Promise<TriggerSchedulerResponse> {
  const response = await api.post<{ data: TriggerSchedulerResponse } | SchedulerErrorResponse>(
    '/triggers/scheduler',
    { run_type: runType, ...(feed ? { feed } : {}) }
  );
  if ('error' in response.data) {
    throw new SchedulerTriggerError(response.data as SchedulerErrorResponse);
  }
  return response.data.data;
}

// Trigger consolidation for a run
export async function triggerConsolidate(
  runId: string,
  force: boolean = false
): Promise<TriggerConsolidateResponse> {
  const response = await api.post<{ data: TriggerConsolidateResponse } | { error: unknown; manual_command: string }>(
    '/triggers/consolidate',
    { run_id: runId, force }
  );
  if ('error' in response.data) {
    throw new Error((response.data.error as { message: string }).message);
  }
  return response.data.data;
}

// Retry failed workers
export async function retryWorkers(
  runId: string,
  partitionId?: string
): Promise<RetryWorkersResponse> {
  const response = await api.post<{ data: RetryWorkersResponse } | { error: unknown; manual_command: string }>(
    '/triggers/retry-workers',
    { run_id: runId, partition_id: partitionId }
  );
  if ('error' in response.data) {
    throw new Error((response.data.error as { message: string }).message);
  }
  return response.data.data;
}

// Get failed workers for a run
export async function getFailedWorkers(runId: string): Promise<FailedWorkersResponse> {
  const response = await api.get<{ data: FailedWorkersResponse }>(`/triggers/failed-workers/${runId}`);
  return response.data.data;
}

// Resume consolidation types
export interface ResumeConsolidateResponse {
  message: string;
  run_id: string;
  trace_id: string;
  diamonds_reset: number;
  run_metadata: {
    run_type: 'full' | 'incremental';
    expected_workers: number;
    completed_workers: number;
    failed_workers: number;
  };
}

// Resume consolidation for a partially completed run
export async function resumeConsolidation(runId: string): Promise<ResumeConsolidateResponse> {
  const response = await api.post<{ data: ResumeConsolidateResponse } | { error: unknown; manual_command: string }>(
    '/triggers/resume-consolidation',
    { run_id: runId }
  );
  if ('error' in response.data) {
    throw new Error((response.data.error as { message: string }).message);
  }
  return response.data.data;
}

// Cancel run types
export interface CancelRunResponse {
  message: string;
  run_id: string;
  reason: string;
  cancelled_partitions: number;
  cancelled_workers: number;
  run_metadata: {
    run_type: 'full' | 'incremental';
    expected_workers: number;
    completed_workers: number;
    failed_workers: number;
  };
}

// Cancel a stalled or running run
export async function cancelRun(
  runId: string,
  reason?: string
): Promise<CancelRunResponse> {
  const response = await api.post<{ data: CancelRunResponse } | { error: unknown }>(
    '/triggers/cancel-run',
    { run_id: runId, ...(reason ? { reason } : {}) }
  );
  if ('error' in response.data) {
    throw new Error((response.data.error as { message: string }).message);
  }
  return response.data.data;
}

// Demo seed types
export interface DemoSeedResponse {
  message: string;
  mode: 'full' | 'incremental';
  inserted: number;
}

// Seed demo feed data
export async function triggerDemoSeed(
  mode: 'full' | 'incremental',
  count?: number
): Promise<DemoSeedResponse> {
  const response = await api.post<{ data: DemoSeedResponse } | { error: unknown; manual_command: string }>(
    '/triggers/demo-seed',
    { mode, ...(count ? { count } : {}) }
  );
  if ('error' in response.data) {
    throw new Error((response.data.error as { message: string }).message);
  }
  return response.data.data;
}
