import { query } from '../client.js';

// --- Row types ---

interface ReapplyJobRow {
  id: string;
  status: string;
  total_diamonds: number;
  processed_diamonds: number;
  updated_diamonds: number;
  failed_diamonds: number;
  feeds_affected: string[];
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  reverted_at: Date | null;
  created_at: Date;
  retry_count: number;
  last_progress_at: Date | null;
  next_retry_at: Date | null;
  trigger_type: string | null;
  triggered_by_rule_id: string | null;
  trigger_rule_snapshot: any | null;
}

interface ReapplySnapshotRow {
  job_id: string;
  diamond_id: string;
  feed: string;
  old_price_model_price: string;
  old_markup_ratio: string | null;
  old_rating: number | null;
  new_price_model_price: string;
  new_markup_ratio: string | null;
  new_rating: number | null;
}

interface AvailableDiamondPricingRow {
  id: string;
  feed: string;
  feed_price: string;
  price_model_price: string | null;
  markup_ratio: string | null;
  rating: number | null;
  carats: string | null;
  lab_grown: boolean;
  fancy_color: string | null;
}

// --- Public types ---

export interface ReapplyJob {
  id: string;
  status: string;
  totalDiamonds: number;
  processedDiamonds: number;
  updatedDiamonds: number;
  failedDiamonds: number;
  feedsAffected: string[];
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  revertedAt: Date | null;
  createdAt: Date;
  retryCount: number;
  lastProgressAt: Date | null;
  nextRetryAt: Date | null;
  triggerType: string | null;
  triggeredByRuleId: string | null;
  triggerRuleSnapshot: any | null;
}

export interface ReapplySnapshot {
  jobId: string;
  diamondId: string;
  feed: string;
  oldPriceModelPrice: number;
  oldMarkupRatio: number | null;
  oldRating: number | null;
  newPriceModelPrice: number;
  newMarkupRatio: number | null;
  newRating: number | null;
}

export interface AvailableDiamondPricing {
  id: string;
  feed: string;
  feedPrice: number;
  priceModelPrice: number | null;
  markupRatio: number | null;
  rating: number | null;
  carats: number | null;
  labGrown: boolean;
  fancyColor: string | null;
}

// --- Mappers ---

function mapJobRow(row: ReapplyJobRow): ReapplyJob {
  return {
    id: row.id,
    status: row.status,
    totalDiamonds: row.total_diamonds,
    processedDiamonds: row.processed_diamonds,
    updatedDiamonds: row.updated_diamonds,
    failedDiamonds: row.failed_diamonds,
    feedsAffected: row.feeds_affected,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    revertedAt: row.reverted_at,
    createdAt: row.created_at,
    retryCount: row.retry_count,
    lastProgressAt: row.last_progress_at,
    nextRetryAt: row.next_retry_at,
    triggerType: row.trigger_type,
    triggeredByRuleId: row.triggered_by_rule_id,
    triggerRuleSnapshot: row.trigger_rule_snapshot,
  };
}

function mapSnapshotRow(row: ReapplySnapshotRow): ReapplySnapshot {
  return {
    jobId: row.job_id,
    diamondId: row.diamond_id,
    feed: row.feed,
    oldPriceModelPrice: parseFloat(row.old_price_model_price),
    oldMarkupRatio: row.old_markup_ratio ? parseFloat(row.old_markup_ratio) : null,
    oldRating: row.old_rating,
    newPriceModelPrice: parseFloat(row.new_price_model_price),
    newMarkupRatio: row.new_markup_ratio ? parseFloat(row.new_markup_ratio) : null,
    newRating: row.new_rating,
  };
}

// --- Job queries ---

export async function createReapplyJob(
  totalDiamonds: number,
  triggerInfo?: {
    triggerType: 'manual' | 'rule_create' | 'rule_update';
    triggeredByRuleId?: string;
    triggerRuleSnapshot?: any;
  }
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO pricing_reapply_jobs (
      total_diamonds,
      trigger_type,
      triggered_by_rule_id,
      trigger_rule_snapshot
    ) VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      totalDiamonds,
      triggerInfo?.triggerType ?? null,
      triggerInfo?.triggeredByRuleId ?? null,
      triggerInfo?.triggerRuleSnapshot ? JSON.stringify(triggerInfo.triggerRuleSnapshot) : null,
    ]
  );
  return result.rows[0]!.id;
}

export async function getReapplyJob(id: string): Promise<ReapplyJob | null> {
  const result = await query<ReapplyJobRow>(
    `SELECT * FROM pricing_reapply_jobs WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function getReapplyJobs(limit = 20): Promise<ReapplyJob[]> {
  const result = await query<ReapplyJobRow>(
    `SELECT * FROM pricing_reapply_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapJobRow);
}

export async function getRunningReapplyJob(): Promise<ReapplyJob | null> {
  const result = await query<ReapplyJobRow>(
    `SELECT * FROM pricing_reapply_jobs WHERE status IN ('pending', 'running') LIMIT 1`
  );
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function updateReapplyJobStatus(
  id: string,
  status: string,
  fields?: {
    processedDiamonds?: number;
    updatedDiamonds?: number;
    failedDiamonds?: number;
    feedsAffected?: string[];
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    revertedAt?: Date;
    retryCount?: number;
    lastProgressAt?: Date;
    nextRetryAt?: Date | null;
  }
): Promise<void> {
  const setClauses = ['status = $2'];
  const values: unknown[] = [id, status];
  let paramIndex = 3;

  if (fields?.processedDiamonds !== undefined) {
    setClauses.push(`processed_diamonds = $${paramIndex++}`);
    values.push(fields.processedDiamonds);
  }
  if (fields?.updatedDiamonds !== undefined) {
    setClauses.push(`updated_diamonds = $${paramIndex++}`);
    values.push(fields.updatedDiamonds);
  }
  if (fields?.failedDiamonds !== undefined) {
    setClauses.push(`failed_diamonds = $${paramIndex++}`);
    values.push(fields.failedDiamonds);
  }
  if (fields?.feedsAffected !== undefined) {
    setClauses.push(`feeds_affected = $${paramIndex++}`);
    values.push(fields.feedsAffected);
  }
  if (fields?.error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    values.push(fields.error);
  }
  if (fields?.startedAt !== undefined) {
    setClauses.push(`started_at = $${paramIndex++}`);
    values.push(fields.startedAt);
  }
  if (fields?.completedAt !== undefined) {
    setClauses.push(`completed_at = $${paramIndex++}`);
    values.push(fields.completedAt);
  }
  if (fields?.revertedAt !== undefined) {
    setClauses.push(`reverted_at = $${paramIndex++}`);
    values.push(fields.revertedAt);
  }
  if (fields?.retryCount !== undefined) {
    setClauses.push(`retry_count = $${paramIndex++}`);
    values.push(fields.retryCount);
  }
  if (fields?.lastProgressAt !== undefined) {
    setClauses.push(`last_progress_at = $${paramIndex++}`);
    values.push(fields.lastProgressAt);
  }
  if (fields?.nextRetryAt !== undefined) {
    setClauses.push(`next_retry_at = $${paramIndex++}`);
    values.push(fields.nextRetryAt);
  }

  await query(
    `UPDATE pricing_reapply_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

// --- Diamond fetch for repricing ---

export async function countAvailableDiamonds(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM diamonds WHERE availability = 'available' AND status = 'active'`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function getAvailableDiamondsBatch(
  cursor: string | null,
  limit: number
): Promise<AvailableDiamondPricing[]> {
  const conditions = ["availability = 'available'", "status = 'active'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (cursor) {
    conditions.push(`id > $${paramIndex++}`);
    values.push(cursor);
  }

  values.push(limit);

  const result = await query<AvailableDiamondPricingRow>(
    `SELECT id, feed, feed_price, price_model_price, markup_ratio, rating, carats, lab_grown, fancy_color
     FROM diamonds
     WHERE ${conditions.join(' AND ')}
     ORDER BY id ASC
     LIMIT $${paramIndex}`,
    values
  );

  return result.rows.map((row) => ({
    id: row.id,
    feed: row.feed,
    feedPrice: parseFloat(row.feed_price),
    priceModelPrice: row.price_model_price ? parseFloat(row.price_model_price) : null,
    markupRatio: row.markup_ratio ? parseFloat(row.markup_ratio) : null,
    rating: row.rating,
    carats: row.carats ? parseFloat(row.carats) : null,
    labGrown: row.lab_grown,
    fancyColor: row.fancy_color,
  }));
}

// --- Batch updates ---

export async function batchUpdateDiamondPricing(
  updates: Array<{
    id: string;
    priceModelPrice: number;
    markupRatio: number;
    rating: number | undefined;
  }>
): Promise<number> {
  if (updates.length === 0) return 0;

  const ids: string[] = [];
  const prices: number[] = [];
  const ratios: number[] = [];
  const ratings: (number | null)[] = [];

  for (const u of updates) {
    ids.push(u.id);
    prices.push(u.priceModelPrice);
    ratios.push(u.markupRatio);
    ratings.push(u.rating ?? null);
  }

  const result = await query<{ count: string }>(
    `WITH updated AS (
      UPDATE diamonds d SET
        price_model_price = v.price_model_price,
        markup_ratio = v.markup_ratio,
        rating = v.rating,
        updated_at = NOW()
      FROM (
        SELECT * FROM UNNEST(
          $1::uuid[], $2::numeric[], $3::numeric[], $4::integer[]
        ) AS t(id, price_model_price, markup_ratio, rating)
      ) v
      WHERE d.id = v.id
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM updated`,
    [ids, prices, ratios, ratings]
  );

  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// --- Snapshot queries ---

export async function insertReapplySnapshots(
  jobId: string,
  snapshots: Array<{
    diamondId: string;
    feed: string;
    oldPriceModelPrice: number;
    oldMarkupRatio: number | null;
    oldRating: number | null;
    newPriceModelPrice: number;
    newMarkupRatio: number | null;
    newRating: number | null;
  }>
): Promise<void> {
  if (snapshots.length === 0) return;

  console.log(`[insertReapplySnapshots] Attempting to insert ${snapshots.length} snapshots for job ${jobId}`);

  const jobIds: string[] = [];
  const diamondIds: string[] = [];
  const feeds: string[] = [];
  const oldPrices: number[] = [];
  const oldRatios: (number | null)[] = [];
  const oldRatings: (number | null)[] = [];
  const newPrices: number[] = [];
  const newRatios: (number | null)[] = [];
  const newRatings: (number | null)[] = [];

  for (const s of snapshots) {
    jobIds.push(jobId);
    diamondIds.push(s.diamondId);
    feeds.push(s.feed);
    oldPrices.push(s.oldPriceModelPrice);
    oldRatios.push(s.oldMarkupRatio);
    oldRatings.push(s.oldRating);
    newPrices.push(s.newPriceModelPrice);
    newRatios.push(s.newMarkupRatio);
    newRatings.push(s.newRating);
  }

  try {
    await query(
      `INSERT INTO pricing_reapply_snapshots (
        job_id, diamond_id, feed,
        old_price_model_price, old_markup_ratio, old_rating,
        new_price_model_price, new_markup_ratio, new_rating
      )
      SELECT * FROM UNNEST(
        $1::uuid[], $2::uuid[], $3::text[],
        $4::numeric[], $5::numeric[], $6::integer[],
        $7::numeric[], $8::numeric[], $9::integer[]
      )
      ON CONFLICT (job_id, diamond_id) DO NOTHING`,
      [jobIds, diamondIds, feeds, oldPrices, oldRatios, oldRatings, newPrices, newRatios, newRatings]
    );
    console.log(`[insertReapplySnapshots] Successfully inserted/skipped ${snapshots.length} snapshots for job ${jobId}`);
  } catch (err) {
    console.error(`[insertReapplySnapshots] Failed to insert snapshots for job ${jobId}`, {
      error: err instanceof Error ? err.message : String(err),
      snapshotCount: snapshots.length,
      firstDiamondId: diamondIds[0],
    });
    throw err;
  }
}

export async function getReapplySnapshotsBatch(
  jobId: string,
  offset: number,
  limit: number
): Promise<ReapplySnapshot[]> {
  const result = await query<ReapplySnapshotRow>(
    `SELECT * FROM pricing_reapply_snapshots WHERE job_id = $1 ORDER BY diamond_id LIMIT $2 OFFSET $3`,
    [jobId, limit, offset]
  );
  return result.rows.map(mapSnapshotRow);
}

export async function revertDiamondPricingFromSnapshots(
  jobId: string,
  batchSize = 500
): Promise<number> {
  let offset = 0;
  let totalReverted = 0;

  while (true) {
    const snapshots = await getReapplySnapshotsBatch(jobId, offset, batchSize);
    if (snapshots.length === 0) break;

    const ids: string[] = [];
    const prices: number[] = [];
    const ratios: (number | null)[] = [];
    const ratings: (number | null)[] = [];

    for (const s of snapshots) {
      ids.push(s.diamondId);
      prices.push(s.oldPriceModelPrice);
      ratios.push(s.oldMarkupRatio);
      ratings.push(s.oldRating);
    }

    const result = await query<{ count: string }>(
      `WITH updated AS (
        UPDATE diamonds d SET
          price_model_price = v.price_model_price,
          markup_ratio = v.markup_ratio,
          rating = v.rating,
          updated_at = NOW()
        FROM (
          SELECT * FROM UNNEST(
            $1::uuid[], $2::numeric[], $3::numeric[], $4::integer[]
          ) AS t(id, price_model_price, markup_ratio, rating)
        ) v
        WHERE d.id = v.id
        RETURNING 1
      )
      SELECT COUNT(*)::text as count FROM updated`,
      [ids, prices, ratios, ratings]
    );

    totalReverted += parseInt(result.rows[0]?.count ?? '0', 10);
    offset += batchSize;
  }

  return totalReverted;
}

// --- Monitoring and retry queries ---

/**
 * Find jobs stuck in 'running' state with no progress for longer than threshold.
 * @param stallThresholdMinutes - Minutes without progress before considering stalled
 * @returns Array of stalled job IDs
 */
export async function findStalledJobs(stallThresholdMinutes: number): Promise<string[]> {
  const result = await query<{ id: string }>(
    `SELECT id FROM pricing_reapply_jobs
     WHERE status = 'running'
       AND (last_progress_at IS NULL OR last_progress_at < NOW() - INTERVAL '1 minute' * $1)`,
    [stallThresholdMinutes]
  );
  return result.rows.map(row => row.id);
}

/**
 * Find failed jobs eligible for automatic retry.
 * @param maxRetries - Maximum retry attempts allowed
 * @returns Array of retryable jobs (limited to 10)
 */
export async function findRetryableJobs(maxRetries: number): Promise<ReapplyJob[]> {
  const result = await query<ReapplyJobRow>(
    `SELECT * FROM pricing_reapply_jobs
     WHERE status = 'failed'
       AND retry_count < $1
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY next_retry_at ASC NULLS FIRST
     LIMIT 10`,
    [maxRetries]
  );
  return result.rows.map(mapJobRow);
}

/**
 * Mark multiple jobs as failed with stall error (batch update).
 * @param jobIds - Array of job IDs to mark as stalled
 * @returns Number of jobs updated
 */
export async function markJobsAsStalled(jobIds: string[]): Promise<number> {
  if (jobIds.length === 0) return 0;

  const result = await query<{ count: string }>(
    `WITH updated AS (
      UPDATE pricing_reapply_jobs
      SET status = 'failed',
          error = 'Job stalled - no progress for ' || $2 || ' minutes',
          completed_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND status = 'running'
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM updated`,
    [jobIds, 15] // Using constant from plan
  );

  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Atomically reset a failed job to pending for retry.
 * Increments retry_count and transitions status from 'failed' to 'pending'.
 * @param jobId - Job ID to reset
 * @returns true if job was reset, false if already picked up (race condition)
 */
export async function resetJobForRetry(jobId: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `WITH updated AS (
      UPDATE pricing_reapply_jobs
      SET status = 'pending',
          retry_count = retry_count + 1,
          error = NULL,
          next_retry_at = NULL
      WHERE id = $1
        AND status = 'failed'
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM updated`,
    [jobId]
  );

  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}
