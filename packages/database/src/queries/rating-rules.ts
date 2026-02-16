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
}

function mapRowToRatingRule(row: RatingRuleRow): RatingRule {
  return {
    id: row.id,
    priority: row.priority,
    priceMin: row.price_min ? parseFloat(row.price_min) : undefined,
    priceMax: row.price_max ? parseFloat(row.price_max) : undefined,
    shapes: row.shape ?? undefined,
    colors: row.color ?? undefined,
    clarities: row.clarity ?? undefined,
    cuts: row.cut ?? undefined,
    feed: row.feed ?? undefined,
    rating: row.rating,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
      priority, price_min, price_max, shape, color, clarity, cut, feed, rating
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

  if (updates.priority !== undefined) {
    fields.push(`priority = $${paramIndex++}`);
    values.push(updates.priority);
  }
  if (updates.priceMin !== undefined) {
    fields.push(`price_min = $${paramIndex++}`);
    values.push(updates.priceMin);
  }
  if (updates.priceMax !== undefined) {
    fields.push(`price_max = $${paramIndex++}`);
    values.push(updates.priceMax);
  }
  if (updates.shapes !== undefined) {
    fields.push(`shape = $${paramIndex++}`);
    values.push(updates.shapes);
  }
  if (updates.colors !== undefined) {
    fields.push(`color = $${paramIndex++}`);
    values.push(updates.colors);
  }
  if (updates.clarities !== undefined) {
    fields.push(`clarity = $${paramIndex++}`);
    values.push(updates.clarities);
  }
  if (updates.cuts !== undefined) {
    fields.push(`cut = $${paramIndex++}`);
    values.push(updates.cuts);
  }
  if (updates.feed !== undefined) {
    fields.push(`feed = $${paramIndex++}`);
    values.push(updates.feed);
  }
  if (updates.rating !== undefined) {
    fields.push(`rating = $${paramIndex++}`);
    values.push(updates.rating);
  }
  if (updates.active !== undefined) {
    fields.push(`active = $${paramIndex++}`);
    values.push(updates.active);
  }

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
