import { query } from '../client.js';
import { sha256 } from '@diamond/shared';

export interface RawDiamondRow {
  id: string;
  run_id: string;
  supplier_stone_id: string;
  offer_id: string;
  source_updated_at: Date | null;
  payload: Record<string, unknown>;
  payload_hash: string;
  consolidated: boolean;
  consolidated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function upsertRawDiamond(
  runId: string,
  supplierStoneId: string,
  offerId: string,
  payload: Record<string, unknown>,
  sourceUpdatedAt?: Date
): Promise<void> {
  const payloadStr = JSON.stringify(payload);
  const payloadHash = sha256(payloadStr);

  // WHERE clause prevents no-op updates when payload hasn't changed
  await query(
    `INSERT INTO raw_diamonds_nivoda (
      run_id, supplier_stone_id, offer_id, payload, payload_hash, source_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (supplier_stone_id) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      offer_id = EXCLUDED.offer_id,
      payload = EXCLUDED.payload,
      payload_hash = EXCLUDED.payload_hash,
      source_updated_at = EXCLUDED.source_updated_at,
      consolidated = FALSE,
      consolidation_status = 'pending',
      consolidated_at = NULL,
      updated_at = NOW()
    WHERE raw_diamonds_nivoda.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash`,
    [runId, supplierStoneId, offerId, payloadStr, payloadHash, sourceUpdatedAt]
  );
}

/**
 * Minimal row type for claimed diamonds - only returns what consolidator needs.
 */
export interface ClaimedRawDiamond {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * Claims unconsolidated raw diamonds for exclusive processing by a consolidator instance.
 * Uses FOR UPDATE SKIP LOCKED with atomic status update to prevent duplicate processing
 * across multiple consolidator replicas.
 *
 * @param limit - Maximum number of rows to claim
 * @param claimedBy - Unique identifier for the consolidator instance (e.g., random UUID)
 * @returns Array of claimed diamonds with only id and payload (minimal data transfer)
 */
export async function claimUnconsolidatedRawDiamonds(
  limit: number,
  claimedBy: string
): Promise<ClaimedRawDiamond[]> {
  const result = await query<ClaimedRawDiamond>(
    `WITH candidates AS (
      SELECT id
      FROM raw_diamonds_nivoda
      WHERE consolidated = FALSE
        AND consolidation_status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE raw_diamonds_nivoda r
    SET consolidation_status = 'processing',
        claimed_at = NOW(),
        claimed_by = $2
    FROM candidates
    WHERE r.id = candidates.id
    RETURNING r.id, r.payload`,
    [limit, claimedBy]
  );
  return result.rows;
}

/**
 * @deprecated Use claimUnconsolidatedRawDiamonds instead for multi-replica safety.
 * This function's FOR UPDATE SKIP LOCKED doesn't prevent duplicate processing because
 * the lock is released immediately after the SELECT.
 */
export async function getUnconsolidatedRawDiamonds(
  limit: number
): Promise<RawDiamondRow[]> {
  const result = await query<RawDiamondRow>(
    `SELECT * FROM raw_diamonds_nivoda
     WHERE consolidated = FALSE
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return result.rows;
}

/**
 * Marks diamonds as consolidated after successful processing.
 * Updates both the legacy consolidated flag and the new consolidation_status.
 */
export async function markAsConsolidated(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await query(
    `UPDATE raw_diamonds_nivoda
     SET consolidated = TRUE,
         consolidation_status = 'done',
         consolidated_at = NOW(),
         updated_at = NOW()
     WHERE id = ANY($1)`,
    [ids]
  );
}

/**
 * Resets claims that have been stuck in 'processing' state for too long.
 * This recovers from consolidator crashes or timeouts by making rows available again.
 * Should be called periodically (e.g., at consolidator startup or every N processing loops).
 *
 * @param ttlMinutes - How long a claim can be held before it's considered stuck
 * @returns Number of rows reset
 */
export async function resetStuckClaims(ttlMinutes: number): Promise<number> {
  const result = await query<{ count: string }>(
    `WITH reset AS (
      UPDATE raw_diamonds_nivoda
      SET consolidation_status = 'pending',
          claimed_at = NULL,
          claimed_by = NULL
      WHERE consolidated = FALSE
        AND consolidation_status = 'processing'
        AND claimed_at < NOW() - make_interval(mins => $1)
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM reset`,
    [ttlMinutes]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function getUnconsolidatedCount(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM raw_diamonds_nivoda WHERE consolidated = FALSE`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export interface BulkRawDiamond {
  supplierStoneId: string;
  offerId: string;
  payload: Record<string, unknown>;
  sourceUpdatedAt?: Date;
}

/**
 * Bulk upsert raw diamonds for improved performance during worker processing.
 * Uses a single query with UNNEST to insert multiple records efficiently.
 */
export async function bulkUpsertRawDiamonds(
  runId: string,
  diamonds: BulkRawDiamond[]
): Promise<void> {
  if (diamonds.length === 0) return;

  const supplierStoneIds = diamonds.map(d => d.supplierStoneId);
  const offerIds = diamonds.map(d => d.offerId);
  const payloads = diamonds.map(d => JSON.stringify(d.payload));
  const payloadHashes = payloads.map(p => sha256(p));
  const sourceUpdatedAts = diamonds.map(d => d.sourceUpdatedAt ?? null);

  // WHERE clause prevents no-op updates when payload hasn't changed
  await query(
    `INSERT INTO raw_diamonds_nivoda (
      run_id, supplier_stone_id, offer_id, payload, payload_hash, source_updated_at
    )
    SELECT
      $1,
      UNNEST($2::TEXT[]),
      UNNEST($3::TEXT[]),
      UNNEST($4::JSONB[]),
      UNNEST($5::TEXT[]),
      UNNEST($6::TIMESTAMPTZ[])
    ON CONFLICT (supplier_stone_id) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      offer_id = EXCLUDED.offer_id,
      payload = EXCLUDED.payload,
      payload_hash = EXCLUDED.payload_hash,
      source_updated_at = EXCLUDED.source_updated_at,
      consolidated = FALSE,
      consolidation_status = 'pending',
      consolidated_at = NULL,
      updated_at = NOW()
    WHERE raw_diamonds_nivoda.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash`,
    [runId, supplierStoneIds, offerIds, payloads, payloadHashes, sourceUpdatedAts]
  );
}
