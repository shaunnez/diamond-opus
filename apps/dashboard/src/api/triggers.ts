import { api } from './client';

export interface TriggerSchedulerResponse {
  message: string;
  run_type: 'full' | 'incremental';
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

// Trigger a new scheduler run
export async function triggerScheduler(runType: 'full' | 'incremental'): Promise<TriggerSchedulerResponse> {
  const response = await api.post<{ data: TriggerSchedulerResponse } | { error: unknown; manual_command: string }>(
    '/triggers/scheduler',
    { run_type: runType }
  );
  if ('error' in response.data) {
    throw new Error((response.data.error as { message: string }).message);
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
