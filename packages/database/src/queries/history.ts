import type { HoldHistory, PurchaseHistory } from '@diamond/shared';
import { query } from '../client.js';

interface HoldHistoryRow {
  id: string;
  diamond_id: string;
  supplier: string;
  supplier_hold_id: string | null;
  offer_id: string;
  status: string;
  denied: boolean;
  hold_until: Date | null;
  created_at: Date;
}

interface PurchaseHistoryRow {
  id: string;
  diamond_id: string;
  supplier: string;
  supplier_order_id: string | null;
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
    supplier: row.supplier,
    supplierHoldId: row.supplier_hold_id ?? undefined,
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
    supplier: row.supplier,
    supplierOrderId: row.supplier_order_id ?? undefined,
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
  supplier: string,
  offerId: string,
  supplierHoldId?: string,
  denied?: boolean,
  holdUntil?: Date
): Promise<HoldHistory> {
  const status = denied ? 'expired' : 'active';
  const result = await query<HoldHistoryRow>(
    `INSERT INTO hold_history (diamond_id, supplier, supplier_hold_id, offer_id, status, denied, hold_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [diamondId, supplier, supplierHoldId, offerId, status, denied ?? false, holdUntil]
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
  supplier: string,
  offerId: string,
  idempotencyKey: string,
  status: PurchaseHistory['status'] = 'pending',
  supplierOrderId?: string,
  reference?: string,
  comments?: string
): Promise<PurchaseHistory> {
  const result = await query<PurchaseHistoryRow>(
    `INSERT INTO purchase_history (
      diamond_id, supplier, supplier_order_id, offer_id, idempotency_key, status, reference, comments
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [diamondId, supplier, supplierOrderId, offerId, idempotencyKey, status, reference, comments]
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
  supplierOrderId?: string
): Promise<void> {
  await query(
    `UPDATE purchase_history
     SET status = $2, supplier_order_id = COALESCE($3, supplier_order_id), updated_at = NOW()
     WHERE id = $1`,
    [id, status, supplierOrderId]
  );
}
