import type { RunMetadata, WorkerRun, RunType, WorkerStatus } from '@diamond/shared';
import { query } from '../client.js';
import { resetPartitionForRetry } from './partition-progress.js';

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
  const result = await query<RunMetadataRow & {
    completed_workers_actual: string;
    failed_workers_actual: string;
  }>(
    `SELECT
      rm.*,
      COALESCE(
        (SELECT COUNT(*) FROM partition_progress pp
         WHERE pp.run_id = rm.run_id AND pp.completed = TRUE),
        0
      ) as completed_workers_actual,
      COALESCE(
        (SELECT COUNT(*) FROM partition_progress pp
         WHERE pp.run_id = rm.run_id AND pp.failed = TRUE AND pp.completed = FALSE),
        0
      ) as failed_workers_actual
     FROM run_metadata rm
     WHERE rm.run_id = $1`,
    [runId]
  );
  const row = result.rows[0];
  if (!row) return null;

  // Use computed counts from partition_progress instead of stored counters
  return {
    ...mapRowToRunMetadata(row),
    completedWorkers: parseInt(row.completed_workers_actual, 10),
    failedWorkers: parseInt(row.failed_workers_actual, 10),
  };
}

/**
 * Get run worker counts computed from partition_progress.
 * Used by workers to determine if consolidation should be triggered.
 *
 * Note: This replaces incrementCompletedWorkers() which maintained counters in run_metadata.
 * Now we compute counts directly from partition_progress for consistency.
 */
export async function getRunWorkerCounts(
  runId: string
): Promise<{ completedWorkers: number; expectedWorkers: number; failedWorkers: number }> {
  const result = await query<{
    expected_workers: number;
    completed_count: string;
    failed_count: string;
  }>(
    `SELECT
      rm.expected_workers,
      COALESCE(
        (SELECT COUNT(*) FROM partition_progress pp
         WHERE pp.run_id = rm.run_id AND pp.completed = TRUE),
        0
      ) as completed_count,
      COALESCE(
        (SELECT COUNT(*) FROM partition_progress pp
         WHERE pp.run_id = rm.run_id AND pp.failed = TRUE AND pp.completed = FALSE),
        0
      ) as failed_count
     FROM run_metadata rm
     WHERE rm.run_id = $1`,
    [runId]
  );
  const row = result.rows[0]!;
  return {
    completedWorkers: parseInt(row.completed_count, 10),
    expectedWorkers: row.expected_workers,
    failedWorkers: parseInt(row.failed_count, 10),
  };
}

/**
 * @deprecated No longer needed - counts are computed from partition_progress
 */
export async function incrementCompletedWorkers(
  runId: string
): Promise<{ completedWorkers: number; expectedWorkers: number; failedWorkers: number }> {
  return getRunWorkerCounts(runId);
}

/**
 * @deprecated No longer needed - counts are computed from partition_progress
 */
export async function incrementFailedWorkers(runId: string): Promise<void> {
  // No-op - partition_progress.failed is set by markPartitionFailed()
}

export async function completeRun(runId: string, watermarkAfter?: Date): Promise<void> {
  await query(
    `UPDATE run_metadata
     SET completed_at = NOW(), watermark_after = $2
     WHERE run_id = $1`,
    [runId, watermarkAfter]
  );
}

export async function markConsolidationStarted(runId: string): Promise<void> {
  await query(
    `UPDATE run_metadata
     SET consolidation_started_at = NOW(),
         consolidation_completed_at = NULL,
         consolidation_processed = 0,
         consolidation_errors = 0,
         consolidation_total = 0
     WHERE run_id = $1`,
    [runId]
  );
}

export async function updateRunConsolidationStats(
  runId: string,
  stats: { processed: number; errors: number; total: number }
): Promise<void> {
  await query(
    `UPDATE run_metadata
     SET consolidation_completed_at = NOW(),
         consolidation_processed = $2,
         consolidation_errors = $3,
         consolidation_total = $4
     WHERE run_id = $1`,
    [runId, stats.processed, stats.errors, stats.total]
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
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE worker_runs
     SET status = $2, error_message = $3, completed_at = NOW()
     WHERE id = $1`,
    [id, status, errorMessage]
  );
}

export async function updateWorkerProgress(
  id: string,
  recordsProcessed: number
): Promise<void> {
  await query(
    `UPDATE worker_runs
     SET records_processed = records_processed + $2
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

  // Reset partition progress so retry resumes from where it left off
  // This clears the failed flag but preserves next_offset
  await resetPartitionForRetry(runId, partitionId);

  // Note: No need to decrement run_metadata.failed_workers - counts are now
  // computed from partition_progress.failed flag which is cleared above
}

export async function resetAllFailedWorkers(runId: string): Promise<number> {
  // Get failed worker partition IDs first
  const failedResult = await query<{ partition_id: string }>(
    `SELECT partition_id FROM worker_runs WHERE run_id = $1 AND status = 'failed'`,
    [runId]
  );
  const failedPartitionIds = failedResult.rows.map(r => r.partition_id);

  if (failedPartitionIds.length === 0) {
    return 0;
  }

  // Delete all failed worker run records
  await query(
    `DELETE FROM worker_runs WHERE run_id = $1 AND status = 'failed'`,
    [runId]
  );

  // Reset partition progress for all failed partitions so retries resume from where they left off
  for (const partitionId of failedPartitionIds) {
    await resetPartitionForRetry(runId, partitionId);
  }

  // Note: No need to reset run_metadata.failed_workers - counts are now
  // computed from partition_progress.failed flags which are cleared above

  return failedPartitionIds.length;
}
