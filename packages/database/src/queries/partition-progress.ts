import { query } from '../client.js';

export interface PartitionProgress {
  runId: string;
  partitionId: string;
  nextOffset: number;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PartitionProgressRow {
  run_id: string;
  partition_id: string;
  next_offset: number;
  completed: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToPartitionProgress(row: PartitionProgressRow): PartitionProgress {
  return {
    runId: row.run_id,
    partitionId: row.partition_id,
    nextOffset: row.next_offset,
    completed: row.completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Initialize or get partition progress for idempotency.
 * Returns existing progress if already initialized.
 */
export async function initializePartitionProgress(
  runId: string,
  partitionId: string
): Promise<PartitionProgress> {
  const result = await query<PartitionProgressRow>(
    `INSERT INTO partition_progress (run_id, partition_id, next_offset, completed)
     VALUES ($1, $2, 0, FALSE)
     ON CONFLICT (run_id, partition_id) DO NOTHING
     RETURNING *`,
    [runId, partitionId]
  );

  // If insert succeeded, return the new row
  if (result.rows.length > 0) {
    return mapRowToPartitionProgress(result.rows[0]!);
  }

  // If conflict, fetch the existing row
  return getPartitionProgress(runId, partitionId);
}

/**
 * Get current partition progress.
 * Returns null if partition doesn't exist.
 */
export async function getPartitionProgress(
  runId: string,
  partitionId: string
): Promise<PartitionProgress> {
  const result = await query<PartitionProgressRow>(
    `SELECT * FROM partition_progress
     WHERE run_id = $1 AND partition_id = $2`,
    [runId, partitionId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Partition progress not found for runId=${runId}, partitionId=${partitionId}`);
  }

  return mapRowToPartitionProgress(result.rows[0]!);
}

/**
 * Atomically update next offset after processing a page.
 * Only updates if current offset matches expected (for idempotency).
 * Returns true if update succeeded, false if offset mismatch (duplicate/out-of-order).
 */
export async function updatePartitionOffset(
  runId: string,
  partitionId: string,
  currentOffset: number,
  newOffset: number
): Promise<boolean> {
  const result = await query<{ updated: boolean }>(
    `UPDATE partition_progress
     SET next_offset = $3, updated_at = NOW()
     WHERE run_id = $1 AND partition_id = $2 AND next_offset = $4 AND completed = FALSE
     RETURNING TRUE as updated`,
    [runId, partitionId, newOffset, currentOffset]
  );

  return result.rows.length > 0;
}

/**
 * Mark partition as completed.
 * Only marks completed if current offset matches expected (for idempotency).
 * Returns true if marked completed, false if already completed or offset mismatch.
 */
export async function completePartition(
  runId: string,
  partitionId: string,
  expectedOffset: number
): Promise<boolean> {
  const result = await query<{ updated: boolean }>(
    `UPDATE partition_progress
     SET completed = TRUE, updated_at = NOW()
     WHERE run_id = $1 AND partition_id = $2 AND next_offset = $3 AND completed = FALSE
     RETURNING TRUE as updated`,
    [runId, partitionId, expectedOffset]
  );

  return result.rows.length > 0;
}

/**
 * Get all partition progress for a run (for debugging/monitoring).
 */
export async function getRunPartitions(runId: string): Promise<PartitionProgress[]> {
  const result = await query<PartitionProgressRow>(
    `SELECT * FROM partition_progress
     WHERE run_id = $1
     ORDER BY partition_id`,
    [runId]
  );

  return result.rows.map(mapRowToPartitionProgress);
}

/**
 * Check if partition is completed.
 */
export async function isPartitionCompleted(
  runId: string,
  partitionId: string
): Promise<boolean> {
  const result = await query<{ completed: boolean }>(
    `SELECT completed FROM partition_progress
     WHERE run_id = $1 AND partition_id = $2`,
    [runId, partitionId]
  );

  return result.rows[0]?.completed ?? false;
}
