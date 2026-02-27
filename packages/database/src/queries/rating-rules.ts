import type { RatingRule } from '@diamond/shared';
import { query } from '../client.js';

interface RatingRuleRow {
  id: string;
  priority: number;
  price_min: string | null;
  price_max: string | null;
  shape: string[] | null;
  color: string[] | null;
  clarity: string[] | null;
  cut: string[] | null;
  feed: string | null;
  rating: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  // Tier 1
  polish: string[] | null;
  symmetry: string[] | null;
  fluorescence: string[] | null;
  certificate_lab: string[] | null;
  lab_grown: boolean | null;
  carat_min: string | null;
  carat_max: string | null;
  // Tier 2
  table_min: string | null;
  table_max: string | null;
  depth_min: string | null;
  depth_max: string | null;
  crown_angle_min: string | null;
  crown_angle_max: string | null;
  crown_height_min: string | null;
  crown_height_max: string | null;
  pavilion_angle_min: string | null;
  pavilion_angle_max: string | null;
  pavilion_depth_min: string | null;
  pavilion_depth_max: string | null;
  girdle: string[] | null;
  culet_size: string[] | null;
  ratio_min: string | null;
  ratio_max: string | null;
}

function parseNumeric(val: string | null): number | undefined {
  return val ? parseFloat(val) : undefined;
}

function mapRowToRatingRule(row: RatingRuleRow): RatingRule {
  return {
    id: row.id,
    priority: row.priority,
    priceMin: parseNumeric(row.price_min),
    priceMax: parseNumeric(row.price_max),
    shapes: row.shape ?? undefined,
    colors: row.color ?? undefined,
    clarities: row.clarity ?? undefined,
    cuts: row.cut ?? undefined,
    feed: row.feed ?? undefined,
    rating: row.rating,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Tier 1
    polishes: row.polish ?? undefined,
    symmetries: row.symmetry ?? undefined,
    fluorescences: row.fluorescence ?? undefined,
    certificateLabs: row.certificate_lab ?? undefined,
    labGrown: row.lab_grown ?? undefined,
    caratMin: parseNumeric(row.carat_min),
    caratMax: parseNumeric(row.carat_max),
    // Tier 2
    tableMin: parseNumeric(row.table_min),
    tableMax: parseNumeric(row.table_max),
    depthMin: parseNumeric(row.depth_min),
    depthMax: parseNumeric(row.depth_max),
    crownAngleMin: parseNumeric(row.crown_angle_min),
    crownAngleMax: parseNumeric(row.crown_angle_max),
    crownHeightMin: parseNumeric(row.crown_height_min),
    crownHeightMax: parseNumeric(row.crown_height_max),
    pavilionAngleMin: parseNumeric(row.pavilion_angle_min),
    pavilionAngleMax: parseNumeric(row.pavilion_angle_max),
    pavilionDepthMin: parseNumeric(row.pavilion_depth_min),
    pavilionDepthMax: parseNumeric(row.pavilion_depth_max),
    girdles: row.girdle ?? undefined,
    culetSizes: row.culet_size ?? undefined,
    ratioMin: parseNumeric(row.ratio_min),
    ratioMax: parseNumeric(row.ratio_max),
  };
}

export async function getActiveRatingRules(): Promise<RatingRule[]> {
  const result = await query<RatingRuleRow>(
    `SELECT * FROM rating_rules WHERE active = TRUE ORDER BY priority ASC`
  );
  return result.rows.map(mapRowToRatingRule);
}

export async function createRatingRule(
  rule: Omit<RatingRule, 'id' | 'active' | 'createdAt' | 'updatedAt'>
): Promise<RatingRule> {
  const result = await query<RatingRuleRow>(
    `INSERT INTO rating_rules (
      priority, price_min, price_max, shape, color, clarity, cut, feed, rating,
      polish, symmetry, fluorescence, certificate_lab, lab_grown,
      carat_min, carat_max,
      table_min, table_max, depth_min, depth_max,
      crown_angle_min, crown_angle_max, crown_height_min, crown_height_max,
      pavilion_angle_min, pavilion_angle_max, pavilion_depth_min, pavilion_depth_max,
      girdle, culet_size, ratio_min, ratio_max
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16,
      $17, $18, $19, $20,
      $21, $22, $23, $24,
      $25, $26, $27, $28,
      $29, $30, $31, $32
    )
    RETURNING *`,
    [
      rule.priority,
      rule.priceMin,
      rule.priceMax,
      rule.shapes ?? null,
      rule.colors ?? null,
      rule.clarities ?? null,
      rule.cuts ?? null,
      rule.feed,
      rule.rating,
      rule.polishes ?? null,
      rule.symmetries ?? null,
      rule.fluorescences ?? null,
      rule.certificateLabs ?? null,
      rule.labGrown ?? null,
      rule.caratMin,
      rule.caratMax,
      rule.tableMin,
      rule.tableMax,
      rule.depthMin,
      rule.depthMax,
      rule.crownAngleMin,
      rule.crownAngleMax,
      rule.crownHeightMin,
      rule.crownHeightMax,
      rule.pavilionAngleMin,
      rule.pavilionAngleMax,
      rule.pavilionDepthMin,
      rule.pavilionDepthMax,
      rule.girdles ?? null,
      rule.culetSizes ?? null,
      rule.ratioMin,
      rule.ratioMax,
    ]
  );
  return mapRowToRatingRule(result.rows[0]!);
}

export async function updateRatingRule(
  id: string,
  updates: Partial<Omit<RatingRule, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const pushField = (col: string, val: unknown) => {
    fields.push(`${col} = $${paramIndex++}`);
    values.push(val);
  };

  if (updates.priority !== undefined) pushField('priority', updates.priority);
  if (updates.priceMin !== undefined) pushField('price_min', updates.priceMin);
  if (updates.priceMax !== undefined) pushField('price_max', updates.priceMax);
  if (updates.shapes !== undefined) pushField('shape', updates.shapes);
  if (updates.colors !== undefined) pushField('color', updates.colors);
  if (updates.clarities !== undefined) pushField('clarity', updates.clarities);
  if (updates.cuts !== undefined) pushField('cut', updates.cuts);
  if (updates.feed !== undefined) pushField('feed', updates.feed);
  if (updates.rating !== undefined) pushField('rating', updates.rating);
  if (updates.active !== undefined) pushField('active', updates.active);
  // Tier 1
  if (updates.polishes !== undefined) pushField('polish', updates.polishes);
  if (updates.symmetries !== undefined) pushField('symmetry', updates.symmetries);
  if (updates.fluorescences !== undefined) pushField('fluorescence', updates.fluorescences);
  if (updates.certificateLabs !== undefined) pushField('certificate_lab', updates.certificateLabs);
  if (updates.labGrown !== undefined) pushField('lab_grown', updates.labGrown);
  if (updates.caratMin !== undefined) pushField('carat_min', updates.caratMin);
  if (updates.caratMax !== undefined) pushField('carat_max', updates.caratMax);
  // Tier 2
  if (updates.tableMin !== undefined) pushField('table_min', updates.tableMin);
  if (updates.tableMax !== undefined) pushField('table_max', updates.tableMax);
  if (updates.depthMin !== undefined) pushField('depth_min', updates.depthMin);
  if (updates.depthMax !== undefined) pushField('depth_max', updates.depthMax);
  if (updates.crownAngleMin !== undefined) pushField('crown_angle_min', updates.crownAngleMin);
  if (updates.crownAngleMax !== undefined) pushField('crown_angle_max', updates.crownAngleMax);
  if (updates.crownHeightMin !== undefined) pushField('crown_height_min', updates.crownHeightMin);
  if (updates.crownHeightMax !== undefined) pushField('crown_height_max', updates.crownHeightMax);
  if (updates.pavilionAngleMin !== undefined) pushField('pavilion_angle_min', updates.pavilionAngleMin);
  if (updates.pavilionAngleMax !== undefined) pushField('pavilion_angle_max', updates.pavilionAngleMax);
  if (updates.pavilionDepthMin !== undefined) pushField('pavilion_depth_min', updates.pavilionDepthMin);
  if (updates.pavilionDepthMax !== undefined) pushField('pavilion_depth_max', updates.pavilionDepthMax);
  if (updates.girdles !== undefined) pushField('girdle', updates.girdles);
  if (updates.culetSizes !== undefined) pushField('culet_size', updates.culetSizes);
  if (updates.ratioMin !== undefined) pushField('ratio_min', updates.ratioMin);
  if (updates.ratioMax !== undefined) pushField('ratio_max', updates.ratioMax);

  if (fields.length === 0) return;

  fields.push('updated_at = NOW()');
  values.push(id);

  await query(
    `UPDATE rating_rules SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function deactivateRatingRule(id: string): Promise<void> {
  await query(
    `UPDATE rating_rules SET active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
