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
      consolidated_at = NULL,
      updated_at = NOW()`,
    [runId, supplierStoneId, offerId, payloadStr, payloadHash, sourceUpdatedAt]
  );
}

/**
 * Fetches unconsolidated raw diamonds with row-level locking.
 * Uses FOR UPDATE SKIP LOCKED to enable safe multi-replica processing:
 * - Each replica gets a unique set of rows
 * - Locked rows are skipped by other replicas
 * - No duplicate processing or race conditions
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

export async function markAsConsolidated(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await query(
    `UPDATE raw_diamonds_nivoda
     SET consolidated = TRUE, consolidated_at = NOW(), updated_at = NOW()
     WHERE id = ANY($1)`,
    [ids]
  );
}

export async function getUnconsolidatedCount(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM raw_diamonds_nivoda WHERE consolidated = FALSE`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}
