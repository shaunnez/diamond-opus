import type { Diamond, DiamondSearchParams, PaginatedResponse } from '@diamond/shared';
import { query } from '../client.js';

interface DiamondRow {
  id: string;
  supplier: string;
  supplier_stone_id: string;
  offer_id: string;
  shape: string;
  carats: string;
  color: string;
  clarity: string;
  cut: string | null;
  polish: string | null;
  symmetry: string | null;
  fluorescence: string | null;
  lab_grown: boolean;
  treated: boolean;
  supplier_price_cents: string;
  price_per_carat_cents: string;
  retail_price_cents: string | null;
  markup_ratio: string | null;
  rating: number | null;
  availability: string;
  raw_availability: string | null;
  hold_id: string | null;
  image_url: string | null;
  video_url: string | null;
  certificate_lab: string | null;
  certificate_number: string | null;
  certificate_pdf_url: string | null;
  measurements: Record<string, unknown> | null;
  attributes: Record<string, unknown> | null;
  supplier_name: string | null;
  supplier_legal_name: string | null;
  status: string;
  source_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function mapRowToDiamond(row: DiamondRow): Diamond {
  return {
    id: row.id,
    supplier: row.supplier,
    supplierStoneId: row.supplier_stone_id,
    offerId: row.offer_id,
    shape: row.shape,
    carats: parseFloat(row.carats),
    color: row.color,
    clarity: row.clarity,
    cut: row.cut ?? undefined,
    polish: row.polish ?? undefined,
    symmetry: row.symmetry ?? undefined,
    fluorescence: row.fluorescence ?? undefined,
    labGrown: row.lab_grown,
    treated: row.treated,
    supplierPriceCents: parseInt(row.supplier_price_cents, 10),
    pricePerCaratCents: parseInt(row.price_per_carat_cents, 10),
    retailPriceCents: row.retail_price_cents ? parseInt(row.retail_price_cents, 10) : undefined,
    markupRatio: row.markup_ratio ? parseFloat(row.markup_ratio) : undefined,
    rating: row.rating ?? undefined,
    availability: row.availability as Diamond['availability'],
    rawAvailability: row.raw_availability ?? undefined,
    holdId: row.hold_id ?? undefined,
    imageUrl: row.image_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    certificateLab: row.certificate_lab ?? undefined,
    certificateNumber: row.certificate_number ?? undefined,
    certificatePdfUrl: row.certificate_pdf_url ?? undefined,
    measurements: row.measurements ?? undefined,
    attributes: row.attributes ?? undefined,
    supplierName: row.supplier_name ?? undefined,
    supplierLegalName: row.supplier_legal_name ?? undefined,
    status: row.status as Diamond['status'],
    sourceUpdatedAt: row.source_updated_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export async function searchDiamonds(
  params: DiamondSearchParams
): Promise<PaginatedResponse<Diamond>> {
  const conditions: string[] = ["status = 'active'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.shape) {
    conditions.push(`shape = $${paramIndex++}`);
    values.push(params.shape);
  }

  if (params.caratMin !== undefined) {
    conditions.push(`carats >= $${paramIndex++}`);
    values.push(params.caratMin);
  }

  if (params.caratMax !== undefined) {
    conditions.push(`carats <= $${paramIndex++}`);
    values.push(params.caratMax);
  }

  if (params.colors && params.colors.length > 0) {
    conditions.push(`color = ANY($${paramIndex++})`);
    values.push(params.colors);
  }

  if (params.clarities && params.clarities.length > 0) {
    conditions.push(`clarity = ANY($${paramIndex++})`);
    values.push(params.clarities);
  }

  if (params.cuts && params.cuts.length > 0) {
    conditions.push(`cut = ANY($${paramIndex++})`);
    values.push(params.cuts);
  }

  if (params.labGrown !== undefined) {
    conditions.push(`lab_grown = $${paramIndex++}`);
    values.push(params.labGrown);
  }

  if (params.priceMin !== undefined) {
    conditions.push(`supplier_price_cents >= $${paramIndex++}`);
    values.push(params.priceMin);
  }

  if (params.priceMax !== undefined) {
    conditions.push(`supplier_price_cents <= $${paramIndex++}`);
    values.push(params.priceMax);
  }

  const whereClause = conditions.join(' AND ');
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  const sortBy = params.sortBy ?? 'created_at';
  const sortOrder = params.sortOrder ?? 'desc';
  const allowedSortColumns = ['created_at', 'supplier_price_cents', 'carats', 'color', 'clarity'];
  const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM diamonds WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataResult = await query<DiamondRow>(
    `SELECT * FROM diamonds WHERE ${whereClause} ORDER BY ${safeSort} ${safeOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(mapRowToDiamond),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDiamondById(id: string): Promise<Diamond | null> {
  const result = await query<DiamondRow>(
    "SELECT * FROM diamonds WHERE id = $1 AND status = 'active'",
    [id]
  );
  const row = result.rows[0];
  return row ? mapRowToDiamond(row) : null;
}

export async function upsertDiamond(diamond: Omit<Diamond, 'id' | 'createdAt' | 'updatedAt'>): Promise<Diamond> {
  const result = await query<DiamondRow>(
    `INSERT INTO diamonds (
      supplier, supplier_stone_id, offer_id, shape, carats, color, clarity,
      cut, polish, symmetry, fluorescence, lab_grown, treated,
      supplier_price_cents, price_per_carat_cents, retail_price_cents,
      markup_ratio, rating, availability, raw_availability, hold_id,
      image_url, video_url, certificate_lab, certificate_number, certificate_pdf_url,
      measurements, attributes, supplier_name, supplier_legal_name,
      status, source_updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
    )
    ON CONFLICT (supplier, supplier_stone_id) DO UPDATE SET
      offer_id = EXCLUDED.offer_id,
      shape = EXCLUDED.shape,
      carats = EXCLUDED.carats,
      color = EXCLUDED.color,
      clarity = EXCLUDED.clarity,
      cut = EXCLUDED.cut,
      polish = EXCLUDED.polish,
      symmetry = EXCLUDED.symmetry,
      fluorescence = EXCLUDED.fluorescence,
      lab_grown = EXCLUDED.lab_grown,
      treated = EXCLUDED.treated,
      supplier_price_cents = EXCLUDED.supplier_price_cents,
      price_per_carat_cents = EXCLUDED.price_per_carat_cents,
      retail_price_cents = EXCLUDED.retail_price_cents,
      markup_ratio = EXCLUDED.markup_ratio,
      rating = EXCLUDED.rating,
      availability = EXCLUDED.availability,
      raw_availability = EXCLUDED.raw_availability,
      hold_id = EXCLUDED.hold_id,
      image_url = EXCLUDED.image_url,
      video_url = EXCLUDED.video_url,
      certificate_lab = EXCLUDED.certificate_lab,
      certificate_number = EXCLUDED.certificate_number,
      certificate_pdf_url = EXCLUDED.certificate_pdf_url,
      measurements = EXCLUDED.measurements,
      attributes = EXCLUDED.attributes,
      supplier_name = EXCLUDED.supplier_name,
      supplier_legal_name = EXCLUDED.supplier_legal_name,
      status = EXCLUDED.status,
      source_updated_at = EXCLUDED.source_updated_at,
      updated_at = NOW()
    RETURNING *`,
    [
      diamond.supplier,
      diamond.supplierStoneId,
      diamond.offerId,
      diamond.shape,
      diamond.carats,
      diamond.color,
      diamond.clarity,
      diamond.cut,
      diamond.polish,
      diamond.symmetry,
      diamond.fluorescence,
      diamond.labGrown,
      diamond.treated,
      diamond.supplierPriceCents,
      diamond.pricePerCaratCents,
      diamond.retailPriceCents,
      diamond.markupRatio,
      diamond.rating,
      diamond.availability,
      diamond.rawAvailability,
      diamond.holdId,
      diamond.imageUrl,
      diamond.videoUrl,
      diamond.certificateLab,
      diamond.certificateNumber,
      diamond.certificatePdfUrl,
      diamond.measurements ? JSON.stringify(diamond.measurements) : null,
      diamond.attributes ? JSON.stringify(diamond.attributes) : null,
      diamond.supplierName,
      diamond.supplierLegalName,
      diamond.status,
      diamond.sourceUpdatedAt,
    ]
  );

  return mapRowToDiamond(result.rows[0]!);
}

export async function updateDiamondAvailability(
  id: string,
  availability: Diamond['availability'],
  holdId?: string
): Promise<void> {
  await query(
    `UPDATE diamonds SET availability = $1, hold_id = $2, updated_at = NOW() WHERE id = $3`,
    [availability, holdId, id]
  );
}

export async function softDeleteDiamond(id: string): Promise<void> {
  await query(
    `UPDATE diamonds SET status = 'deleted', deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
