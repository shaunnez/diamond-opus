import type { Diamond, DiamondSearchParams, PaginatedResponse } from '@diamond/shared';
import { query } from '../client.js';

interface DiamondRow {
  id: string;
  feed: string;
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
  price_model_price: string;
  price_per_carat: string;
  retail_price: string | null;
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
    feed: row.feed,
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
    priceModelPrice: parseFloat(row.price_model_price),
    pricePerCarat: parseFloat(row.price_per_carat),
    retailPrice: row.retail_price ? parseFloat(row.retail_price) : undefined,
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
    conditions.push(`price_model_price >= $${paramIndex++}`);
    values.push(params.priceMin);
  }

  if (params.priceMax !== undefined) {
    conditions.push(`price_model_price <= $${paramIndex++}`);
    values.push(params.priceMax);
  }

  const whereClause = conditions.join(' AND ');
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  const sortBy = params.sortBy ?? 'created_at';
  const sortOrder = params.sortOrder ?? 'desc';
  const allowedSortColumns = ['created_at', 'price_model_price', 'carats', 'color', 'clarity'];
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

export async function getDiamondByOfferId(offerId: string): Promise<Diamond | null> {
  const result = await query<DiamondRow>(
    "SELECT * FROM diamonds WHERE offer_id = $1 AND status = 'active'",
    [offerId]
  );
  const row = result.rows[0];
  return row ? mapRowToDiamond(row) : null;
}

export async function getDiamondsOnHold(): Promise<Diamond[]> {
  const result = await query<DiamondRow>(
    "SELECT * FROM diamonds WHERE availability = 'on_hold' AND status = 'active' ORDER BY updated_at DESC"
  );
  return result.rows.map(mapRowToDiamond);
}

export async function upsertDiamond(diamond: Omit<Diamond, 'id' | 'createdAt' | 'updatedAt'>): Promise<Diamond> {
  const result = await query<DiamondRow>(
    `INSERT INTO diamonds (
      feed, supplier_stone_id, offer_id, shape, carats, color, clarity,
      cut, polish, symmetry, fluorescence, lab_grown, treated,
      price_model_price, price_per_carat, retail_price,
      markup_ratio, rating, availability, raw_availability, hold_id,
      image_url, video_url, certificate_lab, certificate_number, certificate_pdf_url,
      measurements, attributes, supplier_name, supplier_legal_name,
      status, source_updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
    )
    ON CONFLICT (feed, supplier_stone_id) DO UPDATE SET
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
      price_model_price = EXCLUDED.price_model_price,
      price_per_carat = EXCLUDED.price_per_carat,
      retail_price = EXCLUDED.retail_price,
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
      diamond.feed,
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
      diamond.priceModelPrice,
      diamond.pricePerCarat,
      diamond.retailPrice,
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

export type DiamondInput = Omit<Diamond, 'id' | 'createdAt' | 'updatedAt'>;

export async function upsertDiamondsBatch(diamonds: DiamondInput[]): Promise<number> {
  if (diamonds.length === 0) return 0;

  // Build arrays for each column - PostgreSQL UNNEST for efficient batch insert
  const feeds: string[] = [];
  const supplierStoneIds: string[] = [];
  const offerIds: string[] = [];
  const shapes: string[] = [];
  const carats: (number | null)[] = [];
  const colors: (string | null)[] = [];
  const clarities: (string | null)[] = [];
  const cuts: (string | null)[] = [];
  const polishes: (string | null)[] = [];
  const symmetries: (string | null)[] = [];
  const fluorescences: (string | null)[] = [];
  const labGrowns: boolean[] = [];
  const treateds: boolean[] = [];
  const priceModelPrice: number[] = [];
  const pricePerCarat: number[] = [];
  const retailPrice: (number | null)[] = [];
  const markupRatios: (number | null)[] = [];
  const ratings: (number | null)[] = [];
  const availabilities: string[] = [];
  const rawAvailabilities: (string | null)[] = [];
  const holdIds: (string | null)[] = [];
  const imageUrls: (string | null)[] = [];
  const videoUrls: (string | null)[] = [];
  const certificateLabs: (string | null)[] = [];
  const certificateNumbers: (string | null)[] = [];
  const certificatePdfUrls: (string | null)[] = [];
  const measurements: (string | null)[] = [];
  const attributes: (string | null)[] = [];
  const supplierNames: (string | null)[] = [];
  const supplierLegalNames: (string | null)[] = [];
  const statuses: string[] = [];
  const sourceUpdatedAts: (Date | null)[] = [];

  for (const d of diamonds) {
    feeds.push(d.feed);
    supplierStoneIds.push(d.supplierStoneId);
    offerIds.push(d.offerId);
    shapes.push(d.shape);
    carats.push(d.carats ?? null);
    colors.push(d.color ?? null);
    clarities.push(d.clarity ?? null);
    cuts.push(d.cut ?? null);
    polishes.push(d.polish ?? null);
    symmetries.push(d.symmetry ?? null);
    fluorescences.push(d.fluorescence ?? null);
    labGrowns.push(d.labGrown);
    treateds.push(d.treated);
    priceModelPrice.push(d.priceModelPrice);
    pricePerCarat.push(d.pricePerCarat);
    retailPrice.push(d.retailPrice ?? null);
    markupRatios.push(d.markupRatio ?? null);
    ratings.push(d.rating ?? null);
    availabilities.push(d.availability);
    rawAvailabilities.push(d.rawAvailability ?? null);
    holdIds.push(d.holdId ?? null);
    imageUrls.push(d.imageUrl ?? null);
    videoUrls.push(d.videoUrl ?? null);
    certificateLabs.push(d.certificateLab ?? null);
    certificateNumbers.push(d.certificateNumber ?? null);
    certificatePdfUrls.push(d.certificatePdfUrl ?? null);
    measurements.push(d.measurements ? JSON.stringify(d.measurements) : null);
    attributes.push(d.attributes ? JSON.stringify(d.attributes) : null);
    supplierNames.push(d.supplierName ?? null);
    supplierLegalNames.push(d.supplierLegalName ?? null);
    statuses.push(d.status);
    sourceUpdatedAts.push(d.sourceUpdatedAt ?? null);
  }

  // WHERE clause prevents no-op updates when nothing changed (reduces index churn)
  const result = await query<{ count: string }>(
    `WITH upserted AS (
      INSERT INTO diamonds (
        feed, supplier_stone_id, offer_id, shape, carats, color, clarity,
        cut, polish, symmetry, fluorescence, lab_grown, treated,
        price_model_price, price_per_carat, retail_price,
        markup_ratio, rating, availability, raw_availability, hold_id,
        image_url, video_url, certificate_lab, certificate_number, certificate_pdf_url,
        measurements, attributes, supplier_name, supplier_legal_name,
        status, source_updated_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
        $11::text[], $12::boolean[], $13::boolean[], $14::numeric[], $15::numeric[],
        $16::numeric[], $17::numeric[], $18::integer[], $19::text[], $20::text[],
        $21::text[], $22::text[], $23::text[], $24::text[], $25::text[],
        $26::text[], $27::jsonb[], $28::jsonb[], $29::text[], $30::text[],
        $31::text[], $32::timestamptz[]
      )
      ON CONFLICT (feed, supplier_stone_id) DO UPDATE SET
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
        price_model_price = EXCLUDED.price_model_price,
        price_per_carat = EXCLUDED.price_per_carat,
        retail_price = EXCLUDED.retail_price,
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
      WHERE diamonds.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at
         OR diamonds.price_model_price IS DISTINCT FROM EXCLUDED.price_model_price
         OR diamonds.status IS DISTINCT FROM EXCLUDED.status
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM upserted`,
    [
      feeds, supplierStoneIds, offerIds, shapes, carats,
      colors, clarities, cuts, polishes, symmetries,
      fluorescences, labGrowns, treateds, priceModelPrice, pricePerCarat,
      retailPrice, markupRatios, ratings, availabilities, rawAvailabilities,
      holdIds, imageUrls, videoUrls, certificateLabs, certificateNumbers,
      certificatePdfUrls, measurements, attributes, supplierNames, supplierLegalNames,
      statuses, sourceUpdatedAts,
    ]
  );

  return parseInt(result.rows[0]?.count ?? '0', 10);
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
