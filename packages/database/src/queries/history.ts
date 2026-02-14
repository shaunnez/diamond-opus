import type { HoldHistory, PurchaseHistory } from '@diamond/shared';
import { query } from '../client.js';

interface HoldHistoryRow {
  id: string;
  diamond_id: string;
  feed: string;
  feed_hold_id: string | null;
  offer_id: string;
  status: string;
  denied: boolean;
  hold_until: Date | null;
  created_at: Date;
}

interface PurchaseHistoryRow {
  id: string;
  diamond_id: string;
  feed: string;
  feed_order_id: string | null;
  offer_id: string;
  idempotency_key: string;
  status: string;
  reference: string | null;
  comments: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToHoldHistory(row: HoldHistoryRow): HoldHistory {
  return {
    id: row.id,
    diamondId: row.diamond_id,
    feed: row.feed,
    feedHoldId: row.feed_hold_id ?? undefined,
    offerId: row.offer_id,
    status: row.status as HoldHistory['status'],
    denied: row.denied,
    holdUntil: row.hold_until ?? undefined,
    createdAt: row.created_at,
  };
}

function mapRowToPurchaseHistory(row: PurchaseHistoryRow): PurchaseHistory {
  return {
    id: row.id,
    diamondId: row.diamond_id,
    feed: row.feed,
    feedOrderId: row.feed_order_id ?? undefined,
    offerId: row.offer_id,
    idempotencyKey: row.idempotency_key,
    status: row.status as PurchaseHistory['status'],
    reference: row.reference ?? undefined,
    comments: row.comments ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createHoldHistory(
  diamondId: string,
  feed: string,
  offerId: string,
  feedHoldId?: string,
  denied?: boolean,
  holdUntil?: Date
): Promise<HoldHistory> {
  const status = denied ? 'expired' : 'active';
  const result = await query<HoldHistoryRow>(
    `INSERT INTO hold_history (diamond_id, feed, feed_hold_id, offer_id, status, denied, hold_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [diamondId, feed, feedHoldId, offerId, status, denied ?? false, holdUntil]
  );
  return mapRowToHoldHistory(result.rows[0]!);
}

export async function getHoldHistoryByDiamondId(diamondId: string): Promise<HoldHistory[]> {
  const result = await query<HoldHistoryRow>(
    `SELECT * FROM hold_history WHERE diamond_id = $1 ORDER BY created_at DESC`,
    [diamondId]
  );
  return result.rows.map(mapRowToHoldHistory);
}

export async function createPurchaseHistory(
  diamondId: string,
  feed: string,
  offerId: string,
  idempotencyKey: string,
  status: PurchaseHistory['status'] = 'pending',
  feedOrderId?: string,
  reference?: string,
  comments?: string
): Promise<PurchaseHistory> {
  const result = await query<PurchaseHistoryRow>(
    `INSERT INTO purchase_history (
      diamond_id, feed, feed_order_id, offer_id, idempotency_key, status, reference, comments
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [diamondId, feed, feedOrderId, offerId, idempotencyKey, status, reference, comments]
  );
  return mapRowToPurchaseHistory(result.rows[0]!);
}

export async function getPurchaseByIdempotencyKey(idempotencyKey: string): Promise<PurchaseHistory | null> {
  const result = await query<PurchaseHistoryRow>(
    `SELECT * FROM purchase_history WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  const row = result.rows[0];
  return row ? mapRowToPurchaseHistory(row) : null;
}

export async function updatePurchaseStatus(
  id: string,
  status: PurchaseHistory['status'],
  feedOrderId: string | null
): Promise<void> {
  await query(
    `UPDATE purchase_history
     SET status = $2, feed_order_id = COALESCE($3, feed_order_id), updated_at = NOW()
     WHERE id = $1`,
    [id, status, feedOrderId]
  );
}

// ============================================================================
// Listing queries for dashboard
// ============================================================================

export async function getHoldHistoryList(
  limit = 50,
  offset = 0
): Promise<{ holds: HoldHistory[]; total: number }> {
  const [countResult, dataResult] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) as count FROM hold_history`),
    query<HoldHistoryRow>(
      `SELECT * FROM hold_history ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
  ]);
  return {
    holds: dataResult.rows.map(mapRowToHoldHistory),
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
  };
}

export async function getPurchaseHistoryList(
  limit = 50,
  offset = 0
): Promise<{ orders: PurchaseHistory[]; total: number }> {
  const [countResult, dataResult] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) as count FROM purchase_history`),
    query<PurchaseHistoryRow>(
      `SELECT * FROM purchase_history ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
  ]);
  return {
    orders: dataResult.rows.map(mapRowToPurchaseHistory),
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
  };
}

export async function getHoldById(holdId: string): Promise<HoldHistory | null> {
  const result = await query<HoldHistoryRow>(
    `SELECT * FROM hold_history WHERE id = $1`,
    [holdId]
  );
  const row = result.rows[0];
  return row ? mapRowToHoldHistory(row) : null;
}

export async function updateHoldStatus(
  holdId: string,
  status: HoldHistory['status']
): Promise<void> {
  await query(
    `UPDATE hold_history SET status = $2 WHERE id = $1`,
    [holdId, status]
  );
}

export async function getPurchaseById(purchaseId: string): Promise<PurchaseHistory | null> {
  const result = await query<PurchaseHistoryRow>(
    `SELECT * FROM purchase_history WHERE id = $1`,
    [purchaseId]
  );
  const row = result.rows[0];
  return row ? mapRowToPurchaseHistory(row) : null;
}
