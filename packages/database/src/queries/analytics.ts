import type { RunMetadata, WorkerRun, RunType, WorkerStatus } from '@diamond/shared';
import { query } from '../client.js';

// ============================================================================
// Feed-aware raw table resolution
// ============================================================================

/** Feed identifiers supported by consolidation analytics */
export type AnalyticsFeed = 'nivoda-natural' | 'nivoda-labgrown' | 'demo';

const RAW_TABLE_BY_FEED: Record<AnalyticsFeed, string> = {
  'nivoda-natural': 'raw_diamonds_nivoda',
  'nivoda-labgrown': 'raw_diamonds_nivoda',
  demo: 'raw_diamonds_demo',
};

/** Validates a feed string and returns the corresponding raw table name.
 *  Prevents SQL injection by only allowing known feed identifiers. */
export function resolveRawTable(feed: AnalyticsFeed): string {
  const table = RAW_TABLE_BY_FEED[feed];
  if (!table) {
    throw new Error(`Invalid analytics feed: '${feed}'. Allowed: ${Object.keys(RAW_TABLE_BY_FEED).join(', ')}`);
  }
  return table;
}

/** Type guard for AnalyticsFeed */
export function isValidAnalyticsFeed(value: string): value is AnalyticsFeed {
  return value in RAW_TABLE_BY_FEED;
}

// ============================================================================
// Types
// ============================================================================

export type RunStatus = 'running' | 'completed' | 'failed' | 'partial' | 'stalled';

export interface RunWithStats extends RunMetadata {
  totalRecordsProcessed: number;
  durationMs: number | null;
  status: RunStatus;
}

export interface DashboardSummary {
  totalActiveDiamonds: number;
  totalFeeds: number;
  lastSuccessfulRun: RunMetadata | null;
  currentWatermark: Date | null;
  recentRunsCount: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  diamondsByAvailability: {
    available: number;
    onHold: number;
    sold: number;
    unavailable: number;
  };
}

export interface FeedStats {
  feed: string;
  totalDiamonds: number;
  availableDiamonds: number;
  onHoldDiamonds: number;
  soldDiamonds: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  lastUpdated: Date | null;
}

export interface ConsolidationProgress {
  runId: string;
  totalRawDiamonds: number;
  consolidatedCount: number;
  pendingCount: number;
  failedCount: number;
  progressPercent: number;
  oldestPendingCreatedAt: Date | null;
}

export interface RunConsolidationStatus {
  runId: string;
  runType: RunType;
  startedAt: Date;
  completedAt: Date | null;
  expectedWorkers: number;
  completedWorkers: number;
  failedWorkers: number;
  consolidationStartedAt: Date | null;
  consolidationCompletedAt: Date | null;
  consolidationProcessed: number;
  consolidationErrors: number;
  consolidationTotal: number;
  liveProgress: ConsolidationProgress | null;
}

/** Threshold in minutes after which a run with no worker activity is considered stalled */
export const RUN_STALL_THRESHOLD_MINUTES = 30;

export interface RunsFilter {
  runType?: RunType;
  status?: RunStatus;
  feed?: string;
  startedAfter?: Date;
  startedBefore?: Date;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Dashboard Summary
// ============================================================================

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // Run queries in parallel — diamond stats merged into single scan
  const [
    diamondStatsResult,
    lastSuccessfulRunResult,
    recentRunsResult,
  ] = await Promise.all([
    // Single scan: total count, feed count, and availability breakdown
    query<{
      total_diamonds: string;
      feed_count: string;
      available: string;
      on_hold: string;
      sold: string;
      unavailable: string;
    }>(
      `SELECT
        COUNT(*) as total_diamonds,
        COUNT(DISTINCT feed) as feed_count,
        COUNT(*) FILTER (WHERE availability = 'available') as available,
        COUNT(*) FILTER (WHERE availability = 'on_hold') as on_hold,
        COUNT(*) FILTER (WHERE availability = 'sold') as sold,
        COUNT(*) FILTER (WHERE availability = 'unavailable') as unavailable
       FROM diamonds
       WHERE status = 'active'`
    ),
    // Last successful run — NOT EXISTS short-circuits on first failed worker
    query<{
      run_id: string;
      feed: string;
      run_type: string;
      expected_workers: number;
      completed_workers: number;
      failed_workers: number;
      watermark_before: Date | null;
      watermark_after: Date | null;
      started_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT rm.*
       FROM run_metadata rm
       WHERE rm.completed_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM worker_runs wr
           WHERE wr.run_id = rm.run_id AND wr.status = 'failed'
           LIMIT 1
         )
       ORDER BY rm.completed_at DESC LIMIT 1`
    ),
    // Recent runs count (last 7 days)
    query<{ status: string; count: string }>(
      `WITH run_statuses AS (
         SELECT
           rm.run_id,
           CASE
             WHEN rm.completed_at IS NOT NULL AND COALESCE(wr_stats.failed_count, 0) = 0 THEN 'completed'
             WHEN COALESCE(wr_stats.completed_count, 0) >= rm.expected_workers AND COALESCE(wr_stats.failed_count, 0) = 0 THEN 'completed'
             WHEN COALESCE(wr_stats.failed_count, 0) > 0
                  AND COALESCE(wr_stats.completed_count, 0) + COALESCE(wr_stats.failed_count, 0) >= rm.expected_workers THEN 'failed'
             WHEN COALESCE(wr_stats.failed_count, 0) > 0 THEN 'partial'
             ELSE 'running'
           END as status
         FROM run_metadata rm
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*) FILTER (WHERE wr.status = 'completed') as completed_count,
             COUNT(*) FILTER (WHERE wr.status = 'failed') as failed_count
           FROM worker_runs wr
           WHERE wr.run_id = rm.run_id
         ) wr_stats ON TRUE
         WHERE rm.started_at > NOW() - INTERVAL '7 days'
       )
       SELECT status, COUNT(*) as count
       FROM run_statuses
       GROUP BY status`
    ),
  ]);

  const ds = diamondStatsResult.rows[0];
  const totalActiveDiamonds = parseInt(ds?.total_diamonds ?? '0', 10);
  const totalFeeds = parseInt(ds?.feed_count ?? '0', 10);

  const lastSuccessfulRunRow = lastSuccessfulRunResult.rows[0];
  const lastSuccessfulRun = lastSuccessfulRunRow
    ? {
        runId: lastSuccessfulRunRow.run_id,
        feed: lastSuccessfulRunRow.feed ?? 'nivoda-natural',
        runType: lastSuccessfulRunRow.run_type as RunType,
        expectedWorkers: lastSuccessfulRunRow.expected_workers,
        completedWorkers: lastSuccessfulRunRow.completed_workers,
        failedWorkers: lastSuccessfulRunRow.failed_workers,
        watermarkBefore: lastSuccessfulRunRow.watermark_before ?? undefined,
        watermarkAfter: lastSuccessfulRunRow.watermark_after ?? undefined,
        startedAt: lastSuccessfulRunRow.started_at,
        completedAt: lastSuccessfulRunRow.completed_at ?? undefined,
      }
    : null;

  const recentRunsCount = {
    total: 0,
    completed: 0,
    failed: 0,
    running: 0,
  };
  for (const row of recentRunsResult.rows) {
    const count = parseInt(row.count, 10);
    recentRunsCount.total += count;
    if (row.status === 'completed') recentRunsCount.completed = count;
    else if (row.status === 'failed') recentRunsCount.failed = count;
    else if (row.status === 'running') recentRunsCount.running = count;
  }

  const diamondsByAvailability = {
    available: parseInt(ds?.available ?? '0', 10),
    onHold: parseInt(ds?.on_hold ?? '0', 10),
    sold: parseInt(ds?.sold ?? '0', 10),
    unavailable: parseInt(ds?.unavailable ?? '0', 10),
  };

  return {
    totalActiveDiamonds,
    totalFeeds,
    lastSuccessfulRun,
    currentWatermark: lastSuccessfulRun?.watermarkAfter ?? null,
    recentRunsCount,
    diamondsByAvailability,
  };
}

// ============================================================================
// Runs Queries
// ============================================================================

export async function getRunsWithStats(filters: RunsFilter = {}): Promise<{
  runs: RunWithStats[];
  total: number;
}> {
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.runType) {
    conditions.push(`rm.run_type = $${paramIndex++}`);
    values.push(filters.runType);
  }

  if (filters.feed) {
    conditions.push(`rm.feed = $${paramIndex++}`);
    values.push(filters.feed);
  }

  if (filters.startedAfter) {
    conditions.push(`rm.started_at >= $${paramIndex++}`);
    values.push(filters.startedAfter);
  }

  if (filters.startedBefore) {
    conditions.push(`rm.started_at <= $${paramIndex++}`);
    values.push(filters.startedBefore);
  }

  // Status filter uses pre-aggregated partition stats via CTE
  const needsPartitionStats = !!filters.status;
  if (filters.status) {
    conditions.push(getStatusCondition(filters.status));
  }

  const whereClause = conditions.join(' AND ');
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  // CTE for partition stats — only materialized when status filter is active
  const ppStatsCte = `pp_stats AS (
      SELECT run_id,
        COUNT(*) FILTER (WHERE completed = TRUE) as completed_pp,
        COUNT(*) FILTER (WHERE failed = TRUE AND completed = FALSE) as failed_pp
      FROM partition_progress
      GROUP BY run_id
    )`;
  const ctePrefix = needsPartitionStats ? `WITH ${ppStatsCte}` : '';
  const ppJoin = needsPartitionStats ? 'LEFT JOIN pp_stats pp ON rm.run_id = pp.run_id' : '';

  const [countResult, dataResult] = await Promise.all([
    query<{ count: string }>(
      `${ctePrefix}
       SELECT COUNT(*) as count
       FROM run_metadata rm
       ${ppJoin}
       WHERE ${whereClause}`,
      values
    ),
    query<{
      run_id: string;
      feed: string;
      run_type: string;
      expected_workers: number;
      completed_workers_actual: string;
      failed_workers_actual: string;
      watermark_before: Date | null;
      watermark_after: Date | null;
      started_at: Date;
      completed_at: Date | null;
      total_records: string;
      last_worker_completed_at: Date | null;
      last_worker_activity_at: Date | null;
    }>(
      `${ctePrefix}
       SELECT
        rm.*,
        COUNT(*) FILTER (WHERE wr.status = 'completed') as completed_workers_actual,
        COUNT(*) FILTER (WHERE wr.status = 'failed') as failed_workers_actual,
        COALESCE(SUM(wr.records_processed), 0) as total_records,
        MAX(wr.completed_at) as last_worker_completed_at,
        pp_activity.last_activity as last_worker_activity_at
       FROM run_metadata rm
       ${ppJoin}
       LEFT JOIN worker_runs wr ON rm.run_id = wr.run_id
       LEFT JOIN LATERAL (
         SELECT MAX(updated_at) as last_activity
         FROM partition_progress
         WHERE run_id = rm.run_id
       ) pp_activity ON TRUE
       WHERE ${whereClause}
       GROUP BY rm.run_id, pp_activity.last_activity
       ORDER BY rm.started_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
  const runs = dataResult.rows.map((row) => ({
    runId: row.run_id,
    feed: row.feed ?? 'nivoda-natural',
    runType: row.run_type as RunType,
    expectedWorkers: row.expected_workers,
    completedWorkers: parseInt(row.completed_workers_actual, 10),
    failedWorkers: parseInt(row.failed_workers_actual, 10),
    watermarkBefore: row.watermark_before ?? undefined,
    watermarkAfter: row.watermark_after ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    totalRecordsProcessed: parseInt(row.total_records, 10),
    durationMs: row.completed_at
      ? row.completed_at.getTime() - row.started_at.getTime()
      : row.last_worker_completed_at
        ? row.last_worker_completed_at.getTime() - row.started_at.getTime()
        : null,
    status: getRunStatus({
      completed_at: row.completed_at,
      failed_workers: parseInt(row.failed_workers_actual, 10),
      completed_workers: parseInt(row.completed_workers_actual, 10),
      expected_workers: row.expected_workers,
      started_at: row.started_at,
      last_worker_activity_at: row.last_worker_activity_at,
    }),
  }));

  return { runs, total };
}

/** Returns a WHERE condition referencing pp_stats CTE columns (pre-aggregated partition stats). */
function getStatusCondition(status: string): string {
  const completedPp = 'COALESCE(pp.completed_pp, 0)';
  const failedPp = 'COALESCE(pp.failed_pp, 0)';

  switch (status) {
    case 'running':
      // Running includes stalled (stall is computed at application level)
      return `(rm.completed_at IS NULL AND ${failedPp} = 0 AND ${completedPp} < rm.expected_workers)`;
    case 'stalled':
      // Same SQL filter as running — stall detection is done in getRunStatus()
      return `(rm.completed_at IS NULL AND ${failedPp} = 0 AND ${completedPp} < rm.expected_workers)`;
    case 'completed':
      return `((rm.completed_at IS NOT NULL AND ${failedPp} = 0) OR (${completedPp} >= rm.expected_workers AND ${failedPp} = 0))`;
    case 'failed':
      return `(${failedPp} > 0 AND ${completedPp} + ${failedPp} >= rm.expected_workers)`;
    case 'partial':
      return `(${failedPp} > 0 AND ${completedPp} + ${failedPp} < rm.expected_workers)`;
    default:
      return '1=1';
  }
}

function getRunStatus(row: {
  completed_at: Date | null;
  failed_workers: number;
  completed_workers: number;
  expected_workers: number;
  started_at?: Date;
  last_worker_activity_at?: Date | null;
}): RunStatus {
  if (row.completed_at !== null && row.failed_workers === 0) return 'completed';
  // All workers completed with no failures → completed (consolidation may be pending)
  if (row.completed_workers >= row.expected_workers && row.failed_workers === 0) return 'completed';
  if (row.failed_workers > 0 && row.completed_workers + row.failed_workers >= row.expected_workers)
    return 'failed';
  if (row.failed_workers > 0) return 'partial';

  // Stall detection: if the run has been going for a while with no recent worker activity,
  // it's likely stalled (workers died, messages expired, etc.)
  if (row.started_at && row.completed_at === null) {
    const now = Date.now();
    const stallThresholdMs = RUN_STALL_THRESHOLD_MINUTES * 60 * 1000;
    const lastActivity = row.last_worker_activity_at
      ? new Date(row.last_worker_activity_at).getTime()
      : new Date(row.started_at).getTime();
    const timeSinceLastActivity = now - lastActivity;

    if (timeSinceLastActivity > stallThresholdMs) {
      return 'stalled';
    }
  }

  return 'running';
}

export async function getRunDetails(runId: string): Promise<{
  run: RunWithStats | null;
  workers: WorkerRun[];
}> {
  const [runResult, workersResult, statsResult] = await Promise.all([
    query<{
      run_id: string;
      feed: string;
      run_type: string;
      expected_workers: number;
      watermark_before: Date | null;
      watermark_after: Date | null;
      started_at: Date;
      completed_at: Date | null;
    }>(`SELECT * FROM run_metadata WHERE run_id = $1`, [runId]),
    query<{
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
    }>(`SELECT * FROM worker_runs WHERE run_id = $1 ORDER BY partition_id`, [runId]),
    query<{
      completed_count: string;
      failed_count: string;
      total_records: string;
      last_worker_completed_at: Date | null;
      last_worker_activity_at: Date | null;
    }>(
      `SELECT
        COALESCE(COUNT(*) FILTER (WHERE wr.status = 'completed'), 0) as completed_count,
        COALESCE(COUNT(*) FILTER (WHERE wr.status = 'failed'), 0) as failed_count,
        COALESCE(SUM(wr.records_processed), 0) as total_records,
        MAX(wr.completed_at) as last_worker_completed_at,
        (SELECT MAX(pp.updated_at) FROM partition_progress pp
         WHERE pp.run_id = $1) as last_worker_activity_at
       FROM worker_runs wr
       WHERE wr.run_id = $1`,
      [runId]
    ),
  ]);

  const runRow = runResult.rows[0];
  if (!runRow) {
    return { run: null, workers: [] };
  }

  const stats = statsResult.rows[0]!;

  const run: RunWithStats = {
    runId: runRow.run_id,
    feed: runRow.feed ?? 'nivoda-natural',
    runType: runRow.run_type as RunType,
    expectedWorkers: runRow.expected_workers,
    completedWorkers: parseInt(stats.completed_count, 10),
    failedWorkers: parseInt(stats.failed_count, 10),
    watermarkBefore: runRow.watermark_before ?? undefined,
    watermarkAfter: runRow.watermark_after ?? undefined,
    startedAt: runRow.started_at,
    completedAt: runRow.completed_at ?? undefined,
    totalRecordsProcessed: parseInt(stats.total_records, 10),
    durationMs: runRow.completed_at
      ? runRow.completed_at.getTime() - runRow.started_at.getTime()
      : stats.last_worker_completed_at
        ? stats.last_worker_completed_at.getTime() - runRow.started_at.getTime()
        : null,
    status: getRunStatus({
      completed_at: runRow.completed_at,
      failed_workers: parseInt(stats.failed_count, 10),
      completed_workers: parseInt(stats.completed_count, 10),
      expected_workers: runRow.expected_workers,
      started_at: runRow.started_at,
      last_worker_activity_at: stats.last_worker_activity_at,
    }),
  };

  const workers: WorkerRun[] = workersResult.rows.map((row) => ({
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
  }));

  return { run, workers };
}

// ============================================================================
// Recent Failed Workers (across all runs)
// ============================================================================

export interface RecentFailedWorker {
  id: string;
  runId: string;
  partitionId: string;
  workerId: string;
  status: 'failed';
  recordsProcessed: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  runType: RunType;
  runStartedAt: Date;
}

export async function getRecentFailedWorkers(limit = 20): Promise<RecentFailedWorker[]> {
  const result = await query<{
    id: string;
    run_id: string;
    partition_id: string;
    worker_id: string;
    status: string;
    records_processed: number;
    error_message: string | null;
    started_at: Date;
    completed_at: Date | null;
    run_type: string;
    run_started_at: Date;
  }>(
    `SELECT
      wr.id, wr.run_id, wr.partition_id, wr.worker_id, wr.status,
      wr.records_processed, wr.error_message, wr.started_at, wr.completed_at,
      rm.run_type, rm.started_at as run_started_at
     FROM worker_runs wr
     JOIN run_metadata rm ON wr.run_id = rm.run_id
     WHERE wr.status = 'failed'
     ORDER BY wr.completed_at DESC NULLS LAST, wr.started_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    partitionId: row.partition_id,
    workerId: row.worker_id,
    status: 'failed' as const,
    recordsProcessed: row.records_processed,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    runType: row.run_type as RunType,
    runStartedAt: row.run_started_at,
  }));
}

// ============================================================================
// Feed Stats
// ============================================================================

export async function getFeedStats(): Promise<FeedStats[]> {
  const result = await query<{
    feed: string;
    total_diamonds: string;
    available_diamonds: string;
    on_hold_diamonds: string;
    sold_diamonds: string;
    avg_price: string;
    min_price: string;
    max_price: string;
    last_updated: Date | null;
  }>(
    `SELECT
      feed,
      COUNT(*) as total_diamonds,
      COUNT(*) FILTER (WHERE availability = 'available') as available_diamonds,
      COUNT(*) FILTER (WHERE availability = 'on_hold') as on_hold_diamonds,
      COUNT(*) FILTER (WHERE availability = 'sold') as sold_diamonds,
      COALESCE(AVG(feed_price), 0) as avg_price,
      COALESCE(MIN(feed_price), 0) as min_price,
      COALESCE(MAX(feed_price), 0) as max_price,
      MAX(updated_at) as last_updated
     FROM diamonds
     WHERE status = 'active'
     GROUP BY feed
     ORDER BY total_diamonds DESC`
  );

  return result.rows.map((row) => ({
    feed: row.feed,
    totalDiamonds: parseInt(row.total_diamonds, 10),
    availableDiamonds: parseInt(row.available_diamonds, 10),
    onHoldDiamonds: parseInt(row.on_hold_diamonds, 10),
    soldDiamonds: parseInt(row.sold_diamonds, 10),
    avgPrice: parseFloat(row.avg_price),
    minPrice: parseFloat(row.min_price),
    maxPrice: parseFloat(row.max_price),
    lastUpdated: row.last_updated,
  }));
}

// ============================================================================
// Consolidation Progress
// ============================================================================

export async function getConsolidationProgress(runId: string, feed: AnalyticsFeed = 'nivoda-natural'): Promise<ConsolidationProgress | null> {
  const rawTable = resolveRawTable(feed);
  const result = await query<{
    total_raw: string;
    consolidated_count: string;
    pending_count: string;
    failed_count: string;
    oldest_pending: Date | null;
  }>(
    `SELECT
      COUNT(*) as total_raw,
      COUNT(*) FILTER (WHERE consolidated = true) as consolidated_count,
      COUNT(*) FILTER (WHERE consolidated = false AND consolidation_status != 'failed') as pending_count,
      COUNT(*) FILTER (WHERE consolidation_status = 'failed') as failed_count,
      MIN(created_at) FILTER (WHERE consolidated = false) as oldest_pending
     FROM ${rawTable}
     WHERE run_id = $1`,
    [runId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const totalRaw = parseInt(row.total_raw, 10);
  const consolidatedCount = parseInt(row.consolidated_count, 10);
  const pendingCount = parseInt(row.pending_count, 10);
  const failedCount = parseInt(row.failed_count, 10);

  return {
    runId,
    totalRawDiamonds: totalRaw,
    consolidatedCount,
    pendingCount,
    failedCount,
    progressPercent: totalRaw > 0 ? Math.round((consolidatedCount / totalRaw) * 100) : 0,
    oldestPendingCreatedAt: row.oldest_pending,
  };
}

export async function getOverallConsolidationStats(feed: AnalyticsFeed = 'nivoda-natural'): Promise<{
  totalRaw: number;
  totalConsolidated: number;
  totalPending: number;
  progressPercent: number;
}> {
  const rawTable = resolveRawTable(feed);
  const result = await query<{
    total_raw: string;
    consolidated_count: string;
    pending_count: string;
  }>(
    `SELECT
      COUNT(*) as total_raw,
      COUNT(*) FILTER (WHERE consolidated = true) as consolidated_count,
      COUNT(*) FILTER (WHERE consolidated = false) as pending_count
     FROM ${rawTable}`
  );

  const row = result.rows[0]!;
  const totalRaw = parseInt(row.total_raw, 10);
  const consolidatedCount = parseInt(row.consolidated_count, 10);
  const pendingCount = parseInt(row.pending_count, 10);

  return {
    totalRaw,
    totalConsolidated: consolidatedCount,
    totalPending: pendingCount,
    progressPercent: totalRaw > 0 ? Math.round((consolidatedCount / totalRaw) * 100) : 0,
  };
}

// ============================================================================
// Consolidation Status per Run (for dashboard)
// ============================================================================

export async function getRunsConsolidationStatus(limit = 10, feed: AnalyticsFeed = 'nivoda-natural'): Promise<RunConsolidationStatus[]> {
  const rawTable = resolveRawTable(feed);
  const result = await query<{
    run_id: string;
    run_type: string;
    started_at: Date;
    completed_at: Date | null;
    expected_workers: number;
    completed_workers_actual: string;
    failed_workers_actual: string;
    consolidation_started_at: Date | null;
    consolidation_completed_at: Date | null;
    consolidation_processed: number;
    consolidation_errors: number;
    consolidation_total: number;
    total_raw: string;
    consolidated_count: string;
    pending_count: string;
    failed_count: string;
    oldest_pending: Date | null;
  }>(
    `WITH pp_stats AS (
      SELECT run_id,
        COUNT(*) FILTER (WHERE completed = TRUE) as completed_pp,
        COUNT(*) FILTER (WHERE failed = TRUE) as failed_pp
      FROM partition_progress
      GROUP BY run_id
    )
    SELECT
      rm.run_id,
      rm.run_type,
      rm.started_at,
      rm.completed_at,
      rm.expected_workers,
      COALESCE(pp.completed_pp, 0)::text as completed_workers_actual,
      COALESCE(pp.failed_pp, 0)::text as failed_workers_actual,
      rm.consolidation_started_at,
      rm.consolidation_completed_at,
      COALESCE(rm.consolidation_processed, 0) as consolidation_processed,
      COALESCE(rm.consolidation_errors, 0) as consolidation_errors,
      COALESCE(rm.consolidation_total, 0) as consolidation_total,
      COALESCE(raw_stats.total_raw, 0)::text as total_raw,
      COALESCE(raw_stats.consolidated_count, 0)::text as consolidated_count,
      COALESCE(raw_stats.pending_count, 0)::text as pending_count,
      COALESCE(raw_stats.failed_count, 0)::text as failed_count,
      raw_stats.oldest_pending
     FROM run_metadata rm
     LEFT JOIN pp_stats pp ON rm.run_id = pp.run_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) as total_raw,
         COUNT(*) FILTER (WHERE consolidated = true) as consolidated_count,
         COUNT(*) FILTER (WHERE consolidated = false AND consolidation_status != 'failed') as pending_count,
         COUNT(*) FILTER (WHERE consolidation_status = 'failed') as failed_count,
         MIN(created_at) FILTER (WHERE consolidated = false) as oldest_pending
       FROM ${rawTable} rdn
       WHERE rdn.run_id = rm.run_id
     ) raw_stats ON TRUE
     WHERE rm.feed = $1
     ORDER BY rm.started_at DESC
     LIMIT $2`,
    [feed, limit]
  );

  return result.rows.map((row) => {
    const totalRaw = parseInt(row.total_raw, 10);
    const consolidatedCount = parseInt(row.consolidated_count, 10);
    const pendingCount = parseInt(row.pending_count, 10);
    const failedCount = parseInt(row.failed_count, 10);

    return {
      runId: row.run_id,
      runType: row.run_type as RunType,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      expectedWorkers: row.expected_workers,
      completedWorkers: parseInt(row.completed_workers_actual, 10),
      failedWorkers: parseInt(row.failed_workers_actual, 10),
      consolidationStartedAt: row.consolidation_started_at,
      consolidationCompletedAt: row.consolidation_completed_at,
      consolidationProcessed: row.consolidation_processed,
      consolidationErrors: row.consolidation_errors,
      consolidationTotal: row.consolidation_total,
      liveProgress: totalRaw > 0
        ? {
            runId: row.run_id,
            totalRawDiamonds: totalRaw,
            consolidatedCount,
            pendingCount,
            failedCount,
            progressPercent: Math.round((consolidatedCount / totalRaw) * 100),
            oldestPendingCreatedAt: row.oldest_pending,
          }
        : null,
    };
  });
}

// ============================================================================
// Query Proxy - Flexible database queries
// ============================================================================

export type QueryOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

export interface QueryFilter {
  [field: string]: {
    [K in QueryOperator]?: unknown;
  };
}

export interface QueryOptions {
  select?: string;
  filters?: QueryFilter;
  order?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
}

// Allowlist of tables that can be queried
const ALLOWED_TABLES = ['diamonds', 'run_metadata', 'worker_runs'] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

// Allowlist of columns per table for security
const ALLOWED_COLUMNS: Record<AllowedTable, string[]> = {
  diamonds: [
    'id', 'feed', 'supplier_stone_id', 'offer_id', 'shape', 'carats', 'color', 'clarity',
    'cut', 'polish', 'symmetry', 'fluorescence', 'fluorescence_intensity',
    'fancy_color', 'fancy_intensity', 'fancy_overtone', 'lab_grown', 'treated', 'ratio',
    'feed_price', 'diamond_price', 'price_per_carat', 'price_model_price',
    'markup_ratio', 'rating', 'availability', 'raw_availability',
    'image_url', 'video_url', 'certificate_lab', 'certificate_number',
    'supplier_name', 'status', 'source_updated_at', 'created_at', 'updated_at',
  ],
  run_metadata: [
    'run_id', 'run_type', 'expected_workers',
    'watermark_before', 'watermark_after', 'started_at', 'completed_at',
    'consolidation_started_at', 'consolidation_completed_at',
    'consolidation_processed', 'consolidation_errors', 'consolidation_total',
  ],
  worker_runs: [
    'id', 'run_id', 'partition_id', 'worker_id', 'status',
    'records_processed', 'error_message', 'started_at', 'completed_at',
  ],
};

export function isAllowedTable(table: string): table is AllowedTable {
  return ALLOWED_TABLES.includes(table as AllowedTable);
}

function validateColumns(table: AllowedTable, columns: string[]): boolean {
  const allowed = ALLOWED_COLUMNS[table];
  return columns.every((col) => {
    // Handle aggregate functions and aliases
    const cleanCol = col.replace(/\s+as\s+\w+$/i, '').trim();
    const match = cleanCol.match(/^(?:count|sum|avg|min|max)\((\*|\w+)\)$/i);
    if (match) {
      return match[1] === '*' || allowed.includes(match[1]!);
    }
    return allowed.includes(cleanCol);
  });
}

function buildOperatorCondition(
  field: string,
  operator: QueryOperator,
  value: unknown,
  paramIndex: number
): { condition: string; values: unknown[]; nextIndex: number } {
  switch (operator) {
    case 'eq':
      return { condition: `${field} = $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'neq':
      return { condition: `${field} != $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'gt':
      return { condition: `${field} > $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'gte':
      return { condition: `${field} >= $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'lt':
      return { condition: `${field} < $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'lte':
      return { condition: `${field} <= $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'like':
      return { condition: `${field} LIKE $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'ilike':
      return { condition: `${field} ILIKE $${paramIndex}`, values: [value], nextIndex: paramIndex + 1 };
    case 'in':
      return { condition: `${field} = ANY($${paramIndex})`, values: [value], nextIndex: paramIndex + 1 };
    case 'is':
      // For IS NULL / IS NOT NULL
      if (value === null) {
        return { condition: `${field} IS NULL`, values: [], nextIndex: paramIndex };
      }
      return { condition: `${field} IS NOT NULL`, values: [], nextIndex: paramIndex };
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

export async function executeQuery(
  table: string,
  options: QueryOptions
): Promise<{ rows: Record<string, unknown>[]; count: number }> {
  if (!isAllowedTable(table)) {
    throw new Error(`Table '${table}' is not allowed for querying`);
  }

  // Parse and validate select columns
  const selectClause = options.select || '*';
  if (selectClause !== '*') {
    const columns = selectClause.split(',').map((c) => c.trim());
    if (!validateColumns(table, columns)) {
      throw new Error(`Invalid columns in select clause`);
    }
  }

  // Build WHERE clause from filters
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.filters) {
    for (const [field, operators] of Object.entries(options.filters)) {
      // Validate field name
      if (!ALLOWED_COLUMNS[table].includes(field)) {
        throw new Error(`Invalid field '${field}' for table '${table}'`);
      }

      for (const [op, value] of Object.entries(operators)) {
        const result = buildOperatorCondition(field, op as QueryOperator, value, paramIndex);
        conditions.push(result.condition);
        values.push(...result.values);
        paramIndex = result.nextIndex;
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build ORDER BY clause
  let orderClause = '';
  if (options.order) {
    if (!ALLOWED_COLUMNS[table].includes(options.order.column)) {
      throw new Error(`Invalid order column '${options.order.column}'`);
    }
    orderClause = `ORDER BY ${options.order.column} ${options.order.ascending ? 'ASC' : 'DESC'}`;
  }

  // Build LIMIT/OFFSET
  const limit = Math.min(options.limit ?? 100, 1000);
  const offset = options.offset ?? 0;

  // Execute count query
  const countSql = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;
  const countResult = await query<{ count: string }>(countSql, values);
  const count = parseInt(countResult.rows[0]?.count ?? '0', 10);

  // Execute data query
  const dataSql = `SELECT ${selectClause} FROM ${table} ${whereClause} ${orderClause} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  const dataResult = await query<Record<string, unknown>>(dataSql, [...values, limit, offset]);

  return {
    rows: dataResult.rows,
    count,
  };
}
