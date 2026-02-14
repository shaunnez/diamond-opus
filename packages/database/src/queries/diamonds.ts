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
  fluorescence_intensity: string | null;
  fancy_color: string | null;
  fancy_intensity: string | null;
  fancy_overtone: string | null;
  ratio: string | null;
  lab_grown: boolean;
  treated: boolean;
  feed_price: string;
  diamond_price: string | null;
  price_per_carat: string;
  price_model_price: string | null;
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
    fluorescenceIntensity: row.fluorescence_intensity ?? undefined,
    fancyColor: row.fancy_color ?? undefined,
    fancyIntensity: row.fancy_intensity ?? undefined,
    fancyOvertone: row.fancy_overtone ?? undefined,
    ratio: row.ratio ? parseFloat(row.ratio) : undefined,
    labGrown: row.lab_grown,
    treated: row.treated,
    feedPrice: parseFloat(row.feed_price),
    diamondPrice: row.diamond_price ? parseFloat(row.diamond_price) : undefined,
    pricePerCarat: parseFloat(row.price_per_carat),
    priceModelPrice: row.price_model_price ? parseFloat(row.price_model_price) : undefined,
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
    conditions.push(`feed_price >= $${paramIndex++}`);
    values.push(params.priceMin);
  }

  if (params.priceMax !== undefined) {
    conditions.push(`feed_price <= $${paramIndex++}`);
    values.push(params.priceMax);
  }

  if (params.fancyColors && params.fancyColors.length > 0) {
    conditions.push(`fancy_color = ANY($${paramIndex++})`);
    values.push(params.fancyColors);
  }

  if (params.fancyIntensities && params.fancyIntensities.length > 0) {
    conditions.push(`fancy_intensity = ANY($${paramIndex++})`);
    values.push(params.fancyIntensities);
  }

  if (params.fluorescenceIntensities && params.fluorescenceIntensities.length > 0) {
    conditions.push(`fluorescence_intensity = ANY($${paramIndex++})`);
    values.push(params.fluorescenceIntensities);
  }

  if (params.polishes && params.polishes.length > 0) {
    conditions.push(`polish = ANY($${paramIndex++})`);
    values.push(params.polishes);
  }

  if (params.symmetries && params.symmetries.length > 0) {
    conditions.push(`symmetry = ANY($${paramIndex++})`);
    values.push(params.symmetries);
  }

  if (params.ratioMin !== undefined) {
    conditions.push(`ratio >= $${paramIndex++}`);
    values.push(params.ratioMin);
  }

  if (params.ratioMax !== undefined) {
    conditions.push(`ratio <= $${paramIndex++}`);
    values.push(params.ratioMax);
  }

  if (params.labs && params.labs.length > 0) {
    conditions.push(`certificate_lab = ANY($${paramIndex++})`);
    values.push(params.labs);
  }

  if (params.tableMin !== undefined) {
    conditions.push(`(measurements->>'table')::numeric >= $${paramIndex++}`);
    values.push(params.tableMin);
  }

  if (params.tableMax !== undefined) {
    conditions.push(`(measurements->>'table')::numeric <= $${paramIndex++}`);
    values.push(params.tableMax);
  }

  if (params.depthPercentageMin !== undefined) {
    conditions.push(`(measurements->>'depthPercentage')::numeric >= $${paramIndex++}`);
    values.push(params.depthPercentageMin);
  }

  if (params.depthPercentageMax !== undefined) {
    conditions.push(`(measurements->>'depthPercentage')::numeric <= $${paramIndex++}`);
    values.push(params.depthPercentageMax);
  }

  if (params.crownAngleMin !== undefined) {
    conditions.push(`(measurements->>'crownAngle')::numeric >= $${paramIndex++}`);
    values.push(params.crownAngleMin);
  }

  if (params.crownAngleMax !== undefined) {
    conditions.push(`(measurements->>'crownAngle')::numeric <= $${paramIndex++}`);
    values.push(params.crownAngleMax);
  }

  if (params.pavAngleMin !== undefined) {
    conditions.push(`(measurements->>'pavAngle')::numeric >= $${paramIndex++}`);
    values.push(params.pavAngleMin);
  }

  if (params.pavAngleMax !== undefined) {
    conditions.push(`(measurements->>'pavAngle')::numeric <= $${paramIndex++}`);
    values.push(params.pavAngleMax);
  }

  if (params.lengthMin !== undefined) {
    conditions.push(`(measurements->>'length')::numeric >= $${paramIndex++}`);
    values.push(params.lengthMin);
  }

  if (params.lengthMax !== undefined) {
    conditions.push(`(measurements->>'length')::numeric <= $${paramIndex++}`);
    values.push(params.lengthMax);
  }

  if (params.widthMin !== undefined) {
    conditions.push(`(measurements->>'width')::numeric >= $${paramIndex++}`);
    values.push(params.widthMin);
  }

  if (params.widthMax !== undefined) {
    conditions.push(`(measurements->>'width')::numeric <= $${paramIndex++}`);
    values.push(params.widthMax);
  }

  if (params.depthMeasurementMin !== undefined) {
    conditions.push(`(measurements->>'depth')::numeric >= $${paramIndex++}`);
    values.push(params.depthMeasurementMin);
  }

  if (params.depthMeasurementMax !== undefined) {
    conditions.push(`(measurements->>'depth')::numeric <= $${paramIndex++}`);
    values.push(params.depthMeasurementMax);
  }

  if (params.eyeClean !== undefined) {
    conditions.push(`(attributes->>'eyeClean')::boolean = $${paramIndex++}`);
    values.push(params.eyeClean);
  }

  if (params.noBgm === true) {
    conditions.push(`(
      (attributes->>'brown' IS NULL OR UPPER(attributes->>'brown') IN ('NONE', 'N/A', ''))
      AND (attributes->>'green' IS NULL OR UPPER(attributes->>'green') IN ('NONE', 'N/A', ''))
      AND (attributes->>'milky' IS NULL OR UPPER(attributes->>'milky') IN ('NONE', 'N/A', ''))
    )`);
  }

  const whereClause = conditions.join(' AND ');
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  const sortBy = params.sortBy ?? 'created_at';
  const sortOrder = params.sortOrder ?? 'desc';
  const allowedSortColumns = ['created_at', 'feed_price', 'carats', 'color', 'clarity', 'ratio', 'fancy_color', 'fluorescence_intensity', 'certificate_lab'];
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
      cut, polish, symmetry, fluorescence, fluorescence_intensity,
      fancy_color, fancy_intensity, fancy_overtone, ratio,
      lab_grown, treated,
      feed_price, diamond_price, price_per_carat, price_model_price,
      markup_ratio, rating, availability, raw_availability, hold_id,
      image_url, video_url, certificate_lab, certificate_number, certificate_pdf_url,
      measurements, attributes, supplier_name, supplier_legal_name,
      status, source_updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
      $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37, $38
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
      fluorescence_intensity = EXCLUDED.fluorescence_intensity,
      fancy_color = EXCLUDED.fancy_color,
      fancy_intensity = EXCLUDED.fancy_intensity,
      fancy_overtone = EXCLUDED.fancy_overtone,
      ratio = EXCLUDED.ratio,
      lab_grown = EXCLUDED.lab_grown,
      treated = EXCLUDED.treated,
      
      feed_price = EXCLUDED.feed_price,
      diamond_price = EXCLUDED.diamond_price,
      price_per_carat = EXCLUDED.price_per_carat,
      price_model_price = EXCLUDED.price_model_price,
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
      diamond.fluorescenceIntensity,
      diamond.fancyColor,
      diamond.fancyIntensity,
      diamond.fancyOvertone,
      diamond.ratio,
      diamond.labGrown,
      diamond.treated,
      diamond.fancyColor,
      diamond.feedPrice,
      diamond.diamondPrice,
      diamond.pricePerCarat,
      diamond.priceModelPrice,
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
  const fluorescenceIntensities: (string | null)[] = [];
  const fancyColors: (string | null)[] = [];
  const fancyIntensities: (string | null)[] = [];
  const fancyOvertones: (string | null)[] = [];
  const ratios: (number | null)[] = [];
  const labGrowns: boolean[] = [];
  const treateds: boolean[] = [];

  const feedPrice: number[] = [];
  const diamondPrices: (number | null)[] = [];
  const pricePerCarat: number[] = [];
  const priceModelPrice: (number | null)[] = [];
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
    fluorescenceIntensities.push(d.fluorescenceIntensity ?? null);
    fancyColors.push(d.fancyColor ?? null);
    fancyIntensities.push(d.fancyIntensity ?? null);
    fancyOvertones.push(d.fancyOvertone ?? null);
    ratios.push(d.ratio ?? null);
    labGrowns.push(d.labGrown);
    treateds.push(d.treated);
    feedPrice.push(d.feedPrice);
    diamondPrices.push(d.diamondPrice ?? null);
    pricePerCarat.push(d.pricePerCarat);
    priceModelPrice.push(d.priceModelPrice ?? null);
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
        cut, polish, symmetry, fluorescence, fluorescence_intensity,
        fancy_color, fancy_intensity, fancy_overtone, ratio,
        lab_grown, treated,
        feed_price, diamond_price, price_per_carat, price_model_price,
        markup_ratio, rating, availability, raw_availability, hold_id,
        image_url, video_url, certificate_lab, certificate_number, certificate_pdf_url,
        measurements, attributes, supplier_name, supplier_legal_name,
        status, source_updated_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
        $11::text[], $12::text[], $13::text[], $14::text[], $15::text[],
        $16::numeric[], $17::boolean[], $18::boolean[], $19::numeric[], $20::numeric[],
        $21::numeric[], $22::numeric[], $23::numeric[], $24::integer[], $25::text[],
        $26::text[], $27::text[], $28::text[], $29::text[], $30::text[],
        $31::text[], $32::text[], $33::jsonb[], $34::jsonb[], $35::text[],
        $36::text[], $37::text[], $38::timestamptz[]
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
        fluorescence_intensity = EXCLUDED.fluorescence_intensity,
        fancy_color = EXCLUDED.fancy_color,
        fancy_intensity = EXCLUDED.fancy_intensity,
        fancy_overtone = EXCLUDED.fancy_overtone,
        ratio = EXCLUDED.ratio,
        lab_grown = EXCLUDED.lab_grown,
        treated = EXCLUDED.treated,
        
        feed_price = EXCLUDED.feed_price,
        diamond_price = EXCLUDED.diamond_price,
        price_per_carat = EXCLUDED.price_per_carat,
        price_model_price = EXCLUDED.price_model_price,
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
         OR diamonds.feed_price IS DISTINCT FROM EXCLUDED.feed_price
         OR diamonds.status IS DISTINCT FROM EXCLUDED.status
      RETURNING 1
    )
    SELECT COUNT(*)::text as count FROM upserted`,
    [
      feeds, supplierStoneIds, offerIds, shapes, carats,
      colors, clarities, cuts, polishes, symmetries,
      fluorescences, fluorescenceIntensities, fancyColors, fancyIntensities, fancyOvertones,
      ratios, labGrowns, treateds, feedPrice, diamondPrices,
      pricePerCarat, priceModelPrice, markupRatios, ratings, availabilities,
      rawAvailabilities, holdIds, imageUrls, videoUrls, certificateLabs,
      certificateNumbers, certificatePdfUrls, measurements, attributes, supplierNames,
      supplierLegalNames, statuses, sourceUpdatedAts,
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

/**
 * Quick text search across key diamond identifier fields.
 * Searches supplier_stone_id, offer_id, and certificate_number with ILIKE prefix matching.
 * Returns up to `limit` active, available diamonds.
 */
export async function quickSearchDiamonds(
  searchText: string,
  limit = 10,
  feed?: string
): Promise<Diamond[]> {
  const pattern = `${searchText}%`;
  const conditions = [
    "status = 'active'",
    `(supplier_stone_id ILIKE $1 OR offer_id ILIKE $1 OR certificate_number ILIKE $1)`,
  ];
  const values: unknown[] = [pattern];
  let paramIndex = 2;

  if (feed) {
    conditions.push(`feed = $${paramIndex++}`);
    values.push(feed);
  }

  values.push(Math.min(limit, 50));

  const result = await query<DiamondRow>(
    `SELECT * FROM diamonds WHERE ${conditions.join(' AND ')}
     ORDER BY updated_at DESC LIMIT $${paramIndex}`,
    values
  );
  return result.rows.map(mapRowToDiamond);
}
