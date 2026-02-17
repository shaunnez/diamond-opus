import { query } from '../client.js';

// --- Row types ---

interface RatingReapplyJobRow {
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

interface RatingReapplySnapshotRow {
  job_id: string;
  diamond_id: string;
  feed: string;
  old_rating: number | null;
  new_rating: number | null;
}

interface AvailableDiamondRatingRow {
  id: string;
  feed: string;
  feed_price: string;
  shape: string;
  color: string | null;
  clarity: string | null;
  cut: string | null;
  rating: number | null;
}

// --- Public types ---

export interface RatingReapplyJob {
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

export interface RatingReapplySnapshot {
  jobId: string;
  diamondId: string;
  feed: string;
  oldRating: number | null;
  newRating: number | null;
}

export interface AvailableDiamondRating {
  id: string;
  feed: string;
  feedPrice: number;
  shape: string;
  color: string | null;
  clarity: string | null;
  cut: string | null;
  rating: number | null;
}

// --- Mappers ---

function mapJobRow(row: RatingReapplyJobRow): RatingReapplyJob {
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

// --- Job queries ---

export async function createRatingReapplyJob(
  totalDiamonds: number,
  triggerInfo?: {
    triggerType: 'manual' | 'rule_create' | 'rule_update';
    triggeredByRuleId?: string;
    triggerRuleSnapshot?: any;
  }
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO rating_reapply_jobs (
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

export async function getRatingReapplyJob(id: string): Promise<RatingReapplyJob | null> {
  const result = await query<RatingReapplyJobRow>(
    `SELECT * FROM rating_reapply_jobs WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function getRatingReapplyJobs(limit = 20): Promise<RatingReapplyJob[]> {
  const result = await query<RatingReapplyJobRow>(
    `SELECT * FROM rating_reapply_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapJobRow);
}

export async function getRunningRatingReapplyJob(): Promise<RatingReapplyJob | null> {
  const result = await query<RatingReapplyJobRow>(
    `SELECT * FROM rating_reapply_jobs WHERE status IN ('pending', 'running') LIMIT 1`
  );
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function updateRatingReapplyJobStatus(
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
    `UPDATE rating_reapply_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

// --- Diamond fetch for re-rating ---

export async function countAvailableDiamondsForRating(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM diamonds WHERE availability = 'available' AND status = 'active'`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function getAvailableDiamondsBatchForRating(
  cursor: string | null,
  limit: number
): Promise<AvailableDiamondRating[]> {
  const conditions = ["availability = 'available'", "status = 'active'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (cursor) {
    conditions.push(`id > $${paramIndex++}`);
    values.push(cursor);
  }

  values.push(limit);

  const result = await query<AvailableDiamondRatingRow>(
    `SELECT id, feed, feed_price, shape, color, clarity, cut, rating
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
    shape: row.shape,
    color: row.color,
    clarity: row.clarity,
    cut: row.cut,
    rating: row.rating,
  }));
}

// --- Batch updates ---

export async function batchUpdateDiamondRating(
  updates: Array<{
    id: string;
    rating: number | undefined;
  }>
): Promise<number> {
  if (updates.length === 0) return 0;

  const ids: string[] = [];
  const ratings: (number | null)[] = [];

  for (const u of updates) {
    ids.push(u.id);
    ratings.push(u.rating ?? null);
  }

  const result = await query<{ count: string }>(
    `WITH updated AS (
      UPDATE diamonds d SET
        rating = v.rating,
        updated_at = NOW()
      FROM (
        SELECT * FROM UNNEST(
          $1::uuid[], $2::integer[]
        ) AS t(id, rating)
      ) v
      WHERE d.id = v.id
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM updated`,
    [ids, ratings]
  );

  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// --- Snapshot queries ---

export async function insertRatingReapplySnapshots(
  jobId: string,
  snapshots: Array<{
    diamondId: string;
    feed: string;
    oldRating: number | null;
    newRating: number | null;
  }>
): Promise<void> {
  if (snapshots.length === 0) return;

  const jobIds: string[] = [];
  const diamondIds: string[] = [];
  const feeds: string[] = [];
  const oldRatings: (number | null)[] = [];
  const newRatings: (number | null)[] = [];

  for (const s of snapshots) {
    jobIds.push(jobId);
    diamondIds.push(s.diamondId);
    feeds.push(s.feed);
    oldRatings.push(s.oldRating);
    newRatings.push(s.newRating);
  }

  await query(
    `INSERT INTO rating_reapply_snapshots (
      job_id, diamond_id, feed, old_rating, new_rating
    )
    SELECT * FROM UNNEST(
      $1::uuid[], $2::uuid[], $3::text[], $4::integer[], $5::integer[]
    )
    ON CONFLICT (job_id, diamond_id) DO NOTHING`,
    [jobIds, diamondIds, feeds, oldRatings, newRatings]
  );
}

export async function getRatingReapplySnapshotsBatch(
  jobId: string,
  offset: number,
  limit: number
): Promise<RatingReapplySnapshot[]> {
  const result = await query<RatingReapplySnapshotRow>(
    `SELECT * FROM rating_reapply_snapshots WHERE job_id = $1 ORDER BY diamond_id LIMIT $2 OFFSET $3`,
    [jobId, limit, offset]
  );
  return result.rows.map((row) => ({
    jobId: row.job_id,
    diamondId: row.diamond_id,
    feed: row.feed,
    oldRating: row.old_rating,
    newRating: row.new_rating,
  }));
}

export async function revertDiamondRatingFromSnapshots(
  jobId: string,
  batchSize = 500
): Promise<number> {
  let offset = 0;
  let totalReverted = 0;

  while (true) {
    const snapshots = await getRatingReapplySnapshotsBatch(jobId, offset, batchSize);
    if (snapshots.length === 0) break;

    const ids: string[] = [];
    const ratings: (number | null)[] = [];

    for (const s of snapshots) {
      ids.push(s.diamondId);
      ratings.push(s.oldRating);
    }

    const result = await query<{ count: string }>(
      `WITH updated AS (
        UPDATE diamonds d SET
          rating = v.rating,
          updated_at = NOW()
        FROM (
          SELECT * FROM UNNEST(
            $1::uuid[], $2::integer[]
          ) AS t(id, rating)
        ) v
        WHERE d.id = v.id
        RETURNING 1
      )
      SELECT COUNT(*)::text as count FROM updated`,
      [ids, ratings]
    );

    totalReverted += parseInt(result.rows[0]?.count ?? '0', 10);
    offset += batchSize;
  }

  return totalReverted;
}

// --- Monitoring and retry queries ---

export async function resetRatingJobForRetry(jobId: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `WITH updated AS (
      UPDATE rating_reapply_jobs
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
