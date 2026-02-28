import { query } from '../client.js';
import { sha256 } from '@diamond/shared';

/** Default raw table for backwards compatibility */
const DEFAULT_RAW_TABLE = 'raw_diamonds_nivoda';

/**
 * Allowlist of valid raw diamond table names.
 * Prevents SQL injection when table names are passed as parameters.
 */
const VALID_RAW_TABLES = new Set([
  'raw_diamonds_nivoda',
  'raw_diamonds_demo',
]);

function validateTableName(tableName: string): string {
  if (!VALID_RAW_TABLES.has(tableName)) {
    throw new Error(`Invalid raw diamond table name: '${tableName}'. Allowed: ${Array.from(VALID_RAW_TABLES).join(', ')}`);
  }
  return tableName;
}

export interface RawDiamondRow {
  id: string;
  run_id: string;
  supplier_stone_id: string;
  offer_id: string;
  source_updated_at: Date | null;
  payload: Record<string, unknown> | null;
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
  sourceUpdatedAt?: Date,
  tableName: string = DEFAULT_RAW_TABLE,
  feed?: string,
): Promise<void> {
  const table = validateTableName(tableName);
  const payloadStr = JSON.stringify(payload);
  const payloadHash = sha256(payloadStr);

  // WHERE clause prevents no-op updates when payload hasn't changed
  await query(
    `INSERT INTO ${table} (
      run_id, supplier_stone_id, offer_id, payload, payload_hash, source_updated_at, feed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (supplier_stone_id) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      offer_id = EXCLUDED.offer_id,
      payload = EXCLUDED.payload,
      payload_hash = EXCLUDED.payload_hash,
      source_updated_at = EXCLUDED.source_updated_at,
      consolidated = FALSE,
      consolidation_status = 'pending',
      consolidated_at = NULL,
      feed = EXCLUDED.feed,
      updated_at = NOW()
    WHERE ${table}.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash`,
    [runId, supplierStoneId, offerId, payloadStr, payloadHash, sourceUpdatedAt, feed ?? null]
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
 * @param tableName - Raw table to claim from (default: raw_diamonds_nivoda)
 * @param feed - When provided, only claim rows for this feed (prevents cross-feed contamination)
 * @returns Array of claimed diamonds with only id and payload (minimal data transfer)
 */
export async function claimUnconsolidatedRawDiamonds(
  limit: number,
  claimedBy: string,
  tableName: string = DEFAULT_RAW_TABLE,
  feed?: string,
): Promise<ClaimedRawDiamond[]> {
  const table = validateTableName(tableName);
  const result = await query<ClaimedRawDiamond>(
    feed
      ? `WITH candidates AS (
          SELECT id
          FROM ${table}
          WHERE consolidated = FALSE
            AND consolidation_status = 'pending'
            AND feed = $3
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ${table} r
        SET consolidation_status = 'processing',
            claimed_at = NOW(),
            claimed_by = $2
        FROM candidates
        WHERE r.id = candidates.id
        RETURNING r.id, r.payload`
      : `WITH candidates AS (
          SELECT id
          FROM ${table}
          WHERE consolidated = FALSE
            AND consolidation_status = 'pending'
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ${table} r
        SET consolidation_status = 'processing',
            claimed_at = NOW(),
            claimed_by = $2
        FROM candidates
        WHERE r.id = candidates.id
        RETURNING r.id, r.payload`,
    feed ? [limit, claimedBy, feed] : [limit, claimedBy]
  );
  return result.rows;
}

/**
 * @deprecated Use claimUnconsolidatedRawDiamonds instead for multi-replica safety.
 */
export async function getUnconsolidatedRawDiamonds(
  limit: number,
  tableName: string = DEFAULT_RAW_TABLE,
): Promise<RawDiamondRow[]> {
  const table = validateTableName(tableName);
  const result = await query<RawDiamondRow>(
    `SELECT * FROM ${table}
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
export async function markAsConsolidated(
  ids: string[],
  tableName: string = DEFAULT_RAW_TABLE,
): Promise<void> {
  if (ids.length === 0) return;
  const table = validateTableName(tableName);

  await query(
    `UPDATE ${table}
     SET consolidated = TRUE,
         consolidation_status = 'done',
         consolidated_at = NOW(),
         payload = NULL,
         updated_at = NOW()
     WHERE id = ANY($1)`,
    [ids]
  );
}

/**
 * Resets claims that have been stuck in 'processing' state for too long.
 * This recovers from consolidator crashes or timeouts by making rows available again.
 *
 * @param ttlMinutes - How long a claim can be held before it's considered stuck
 * @param tableName - Raw table to reset claims on (default: raw_diamonds_nivoda)
 * @returns Number of rows reset
 */
export async function resetStuckClaims(
  ttlMinutes: number,
  tableName: string = DEFAULT_RAW_TABLE,
): Promise<number> {
  const table = validateTableName(tableName);
  const result = await query<{ count: string }>(
    `WITH reset AS (
      UPDATE ${table}
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

/**
 * Marks diamonds as failed after an unrecoverable error during mapping/upsert.
 * These diamonds won't be retried automatically but can be resumed via
 * the resume-consolidation endpoint which resets them to 'pending'.
 */
export async function markAsFailed(
  ids: string[],
  tableName: string = DEFAULT_RAW_TABLE,
): Promise<void> {
  if (ids.length === 0) return;
  const table = validateTableName(tableName);

  await query(
    `UPDATE ${table}
     SET consolidation_status = 'failed',
         updated_at = NOW()
     WHERE id = ANY($1)`,
    [ids]
  );
}

/**
 * Resets failed diamonds back to pending so they can be retried.
 * Used by the resume-consolidation flow.
 *
 * @returns Number of rows reset
 */
export async function resetFailedDiamonds(
  runId?: string,
  tableName: string = DEFAULT_RAW_TABLE,
): Promise<number> {
  const table = validateTableName(tableName);
  const result = await query<{ count: string }>(
    runId
      ? `WITH reset AS (
          UPDATE ${table}
          SET consolidation_status = 'pending',
              claimed_at = NULL,
              claimed_by = NULL
          WHERE consolidated = FALSE
            AND consolidation_status IN ('failed', 'processing')
            AND run_id = $1
          RETURNING 1
        )
        SELECT COUNT(*)::text as count FROM reset`
      : `WITH reset AS (
          UPDATE ${table}
          SET consolidation_status = 'pending',
              claimed_at = NULL,
              claimed_by = NULL
          WHERE consolidated = FALSE
            AND consolidation_status IN ('failed', 'processing')
          RETURNING 1
        )
        SELECT COUNT(*)::text as count FROM reset`,
    runId ? [runId] : []
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function getUnconsolidatedCount(
  tableName: string = DEFAULT_RAW_TABLE,
): Promise<number> {
  const table = validateTableName(tableName);
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ${table} WHERE consolidated = FALSE`
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
 *
 * @param runId - The run ID to associate with these diamonds
 * @param diamonds - Array of raw diamonds to upsert
 * @param tableName - Raw table to upsert into (default: raw_diamonds_nivoda)
 * @param feed - Feed identifier to store on each row (e.g. 'nivoda-natural')
 */
export async function bulkUpsertRawDiamonds(
  runId: string,
  diamonds: BulkRawDiamond[],
  tableName: string = DEFAULT_RAW_TABLE,
  feed?: string,
): Promise<void> {
  if (diamonds.length === 0) return;
  const table = validateTableName(tableName);

  const supplierStoneIds = diamonds.map(d => d.supplierStoneId);
  const offerIds = diamonds.map(d => d.offerId);
  const payloads = diamonds.map(d => JSON.stringify(d.payload));
  const payloadHashes = payloads.map(p => sha256(p));
  const sourceUpdatedAts = diamonds.map(d => d.sourceUpdatedAt ?? null);

  // WHERE clause prevents no-op updates when payload hasn't changed
  await query(
    `INSERT INTO ${table} (
      run_id, supplier_stone_id, offer_id, payload, payload_hash, source_updated_at, feed
    )
    SELECT
      $1,
      UNNEST($2::TEXT[]),
      UNNEST($3::TEXT[]),
      UNNEST($4::JSONB[]),
      UNNEST($5::TEXT[]),
      UNNEST($6::TIMESTAMPTZ[]),
      $7
    ON CONFLICT (supplier_stone_id) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      offer_id = EXCLUDED.offer_id,
      payload = EXCLUDED.payload,
      payload_hash = EXCLUDED.payload_hash,
      source_updated_at = EXCLUDED.source_updated_at,
      consolidated = FALSE,
      consolidation_status = 'pending',
      consolidated_at = NULL,
      feed = EXCLUDED.feed,
      updated_at = NOW()
    WHERE ${table}.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash`,
    [runId, supplierStoneIds, offerIds, payloads, payloadHashes, sourceUpdatedAts, feed ?? null]
  );
}
