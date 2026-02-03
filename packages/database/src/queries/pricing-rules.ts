import type { PricingRule } from '@diamond/shared';
import { query } from '../client.js';

interface PricingRuleRow {
  id: string;
  priority: number;
  carat_min: string | null;
  carat_max: string | null;
  shapes: string[] | null;
  lab_grown: boolean | null;
  feed: string | null;
  markup_ratio: string;
  rating: number | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToPricingRule(row: PricingRuleRow): PricingRule {
  return {
    id: row.id,
    priority: row.priority,
    caratMin: row.carat_min ? parseFloat(row.carat_min) : undefined,
    caratMax: row.carat_max ? parseFloat(row.carat_max) : undefined,
    shapes: row.shapes ?? undefined,
    labGrown: row.lab_grown ?? undefined,
    feed: row.feed ?? undefined,
    markupRatio: parseFloat(row.markup_ratio),
    rating: row.rating ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getActivePricingRules(): Promise<PricingRule[]> {
  const result = await query<PricingRuleRow>(
    `SELECT * FROM pricing_rules WHERE active = TRUE ORDER BY priority ASC`
  );
  return result.rows.map(mapRowToPricingRule);
}

export async function createPricingRule(
  rule: Omit<PricingRule, 'id' | 'active' | 'createdAt' | 'updatedAt'>
): Promise<PricingRule> {
  const result = await query<PricingRuleRow>(
    `INSERT INTO pricing_rules (
      priority, carat_min, carat_max, shapes, lab_grown, feed, markup_ratio, rating
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      rule.priority,
      rule.caratMin,
      rule.caratMax,
      rule.shapes,
      rule.labGrown,
      rule.feed,
      rule.markupRatio,
      rule.rating,
    ]
  );
  return mapRowToPricingRule(result.rows[0]!);
}

export async function updatePricingRule(
  id: string,
  updates: Partial<Omit<PricingRule, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.priority !== undefined) {
    fields.push(`priority = $${paramIndex++}`);
    values.push(updates.priority);
  }
  if (updates.caratMin !== undefined) {
    fields.push(`carat_min = $${paramIndex++}`);
    values.push(updates.caratMin);
  }
  if (updates.caratMax !== undefined) {
    fields.push(`carat_max = $${paramIndex++}`);
    values.push(updates.caratMax);
  }
  if (updates.shapes !== undefined) {
    fields.push(`shapes = $${paramIndex++}`);
    values.push(updates.shapes);
  }
  if (updates.labGrown !== undefined) {
    fields.push(`lab_grown = $${paramIndex++}`);
    values.push(updates.labGrown);
  }
  if (updates.feed !== undefined) {
    fields.push(`feed = $${paramIndex++}`);
    values.push(updates.feed);
  }
  if (updates.markupRatio !== undefined) {
    fields.push(`markup_ratio = $${paramIndex++}`);
    values.push(updates.markupRatio);
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
    `UPDATE pricing_rules SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function deactivatePricingRule(id: string): Promise<void> {
  await query(
    `UPDATE pricing_rules SET active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
