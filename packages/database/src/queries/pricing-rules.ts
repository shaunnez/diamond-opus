import type { PricingRule, StoneType } from '@diamond/shared';
import { query } from '../client.js';

interface PricingRuleRow {
  id: string;
  priority: number;
  stone_type: string | null;
  price_min: string | null;
  price_max: string | null;
  feed: string | null;
  margin_modifier: string;
  rating: number | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToPricingRule(row: PricingRuleRow): PricingRule {
  return {
    id: row.id,
    priority: row.priority,
    stoneType: (row.stone_type as StoneType) ?? undefined,
    priceMin: row.price_min ? parseFloat(row.price_min) : undefined,
    priceMax: row.price_max ? parseFloat(row.price_max) : undefined,
    feed: row.feed ?? undefined,
    marginModifier: parseFloat(row.margin_modifier),
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
      priority, stone_type, price_min, price_max, feed, margin_modifier, rating
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      rule.priority,
      rule.stoneType,
      rule.priceMin,
      rule.priceMax,
      rule.feed,
      rule.marginModifier,
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
  if (updates.stoneType !== undefined) {
    fields.push(`stone_type = $${paramIndex++}`);
    values.push(updates.stoneType);
  }
  if (updates.priceMin !== undefined) {
    fields.push(`price_min = $${paramIndex++}`);
    values.push(updates.priceMin);
  }
  if (updates.priceMax !== undefined) {
    fields.push(`price_max = $${paramIndex++}`);
    values.push(updates.priceMax);
  }
  if (updates.feed !== undefined) {
    fields.push(`feed = $${paramIndex++}`);
    values.push(updates.feed);
  }
  if (updates.marginModifier !== undefined) {
    fields.push(`margin_modifier = $${paramIndex++}`);
    values.push(updates.marginModifier);
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
