import type { RunMetadata, WorkerRun, RunType, WorkerStatus } from '@diamond/shared';
import { query } from '../client.js';

interface RunMetadataRow {
  run_id: string;
  run_type: string;
  expected_workers: number;
  completed_workers: number;
  failed_workers: number;
  watermark_before: Date | null;
  watermark_after: Date | null;
  started_at: Date;
  completed_at: Date | null;
}

interface WorkerRunRow {
  id: string;
  run_id: string;
  partition_id: string;
  worker_id: string;
  status: string;
  records_processed: number;
  error_message: string | null;
  work_item_payload: Record<string, unknown> | null;
  started_at: Date;
  completed_at: Date | null;
}

function mapRowToRunMetadata(row: RunMetadataRow): RunMetadata {
  return {
    runId: row.run_id,
    runType: row.run_type as RunType,
    expectedWorkers: row.expected_workers,
    completedWorkers: row.completed_workers,
    failedWorkers: row.failed_workers,
    watermarkBefore: row.watermark_before ?? undefined,
    watermarkAfter: row.watermark_after ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function mapRowToWorkerRun(row: WorkerRunRow): WorkerRun {
  return {
    id: row.id,
    runId: row.run_id,
    partitionId: row.partition_id,
    workerId: row.worker_id,
    status: row.status as WorkerStatus,
    recordsProcessed: row.records_processed,
    errorMessage: row.error_message ?? undefined,
    workItemPayload: row.work_item_payload ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export async function createRunMetadata(
  runType: RunType,
  expectedWorkers: number,
  watermarkBefore?: Date
): Promise<RunMetadata> {
  const result = await query<RunMetadataRow>(
    `INSERT INTO run_metadata (run_type, expected_workers, watermark_before)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [runType, expectedWorkers, watermarkBefore]
  );
  return mapRowToRunMetadata(result.rows[0]!);
}

export async function getRunMetadata(runId: string): Promise<RunMetadata | null> {
  const result = await query<RunMetadataRow>(
    `SELECT * FROM run_metadata WHERE run_id = $1`,
    [runId]
  );
  const row = result.rows[0];
  return row ? mapRowToRunMetadata(row) : null;
}

export async function incrementCompletedWorkers(
  runId: string
): Promise<{ completedWorkers: number; expectedWorkers: number; failedWorkers: number }> {
  const result = await query<{ completed_workers: number; expected_workers: number; failed_workers: number }>(
    `UPDATE run_metadata
     SET completed_workers = completed_workers + 1
     WHERE run_id = $1
     RETURNING completed_workers, expected_workers, failed_workers`,
    [runId]
  );
  const row = result.rows[0]!;
  return {
    completedWorkers: row.completed_workers,
    expectedWorkers: row.expected_workers,
    failedWorkers: row.failed_workers,
  };
}

export async function incrementFailedWorkers(runId: string): Promise<void> {
  await query(
    `UPDATE run_metadata SET failed_workers = failed_workers + 1 WHERE run_id = $1`,
    [runId]
  );
}

export async function completeRun(runId: string, watermarkAfter?: Date): Promise<void> {
  await query(
    `UPDATE run_metadata
     SET completed_at = NOW(), watermark_after = $2
     WHERE run_id = $1`,
    [runId, watermarkAfter]
  );
}

export async function createWorkerRun(
  runId: string,
  partitionId: string,
  workerId: string,
  workItemPayload?: Record<string, unknown>
): Promise<WorkerRun> {
  const result = await query<WorkerRunRow>(
    `INSERT INTO worker_runs (run_id, partition_id, worker_id, status, work_item_payload)
     VALUES ($1, $2, $3, 'running', $4)
     RETURNING *`,
    [runId, partitionId, workerId, workItemPayload ? JSON.stringify(workItemPayload) : null]
  );
  return mapRowToWorkerRun(result.rows[0]!);
}

export async function updateWorkerRun(
  id: string,
  status: WorkerStatus,
  recordsProcessed: number,
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE worker_runs
     SET status = $2, records_processed = $3, error_message = $4, completed_at = NOW()
     WHERE id = $1`,
    [id, status, recordsProcessed, errorMessage]
  );
}

export async function updateWorkerProgress(
  id: string,
  recordsProcessed: number
): Promise<void> {
  await query(
    `UPDATE worker_runs
     SET records_processed = $2
     WHERE id = $1 AND status = 'running'`,
    [id, recordsProcessed]
  );
}

export async function getWorkerRunsByRunId(runId: string): Promise<WorkerRun[]> {
  const result = await query<WorkerRunRow>(
    `SELECT * FROM worker_runs WHERE run_id = $1 ORDER BY started_at`,
    [runId]
  );
  return result.rows.map(mapRowToWorkerRun);
}

export async function getFailedWorkerRuns(runId: string): Promise<WorkerRun[]> {
  const result = await query<WorkerRunRow>(
    `SELECT * FROM worker_runs WHERE run_id = $1 AND status = 'failed' ORDER BY started_at`,
    [runId]
  );
  return result.rows.map(mapRowToWorkerRun);
}

export async function resetFailedWorker(
  runId: string,
  partitionId: string
): Promise<void> {
  // Delete the failed worker run record so it can be recreated
  await query(
    `DELETE FROM worker_runs WHERE run_id = $1 AND partition_id = $2 AND status = 'failed'`,
    [runId, partitionId]
  );

  // Decrement the failed workers count and completed workers count
  await query(
    `UPDATE run_metadata
     SET failed_workers = GREATEST(0, failed_workers - 1)
     WHERE run_id = $1`,
    [runId]
  );
}

export async function resetAllFailedWorkers(runId: string): Promise<number> {
  // Get count of failed workers first
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM worker_runs WHERE run_id = $1 AND status = 'failed'`,
    [runId]
  );
  const failedCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

  if (failedCount === 0) {
    return 0;
  }

  // Delete all failed worker run records
  await query(
    `DELETE FROM worker_runs WHERE run_id = $1 AND status = 'failed'`,
    [runId]
  );

  // Reset the failed workers count
  await query(
    `UPDATE run_metadata SET failed_workers = 0 WHERE run_id = $1`,
    [runId]
  );

  return failedCount;
}
