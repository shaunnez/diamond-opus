/**
 * Tests for the diamond search Zod validator.
 * Verifies 0-as-min, limit 1000, new sort values, fields param, and new filters.
 */

import { describe, it, expect } from 'vitest';
import { diamondSearchSchema } from '../diamonds.js';

describe('diamondSearchSchema — minimum value 0', () => {
  it('accepts 0 for carat_min', () => {
    const result = diamondSearchSchema.safeParse({ carat_min: 0 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.carat_min).toBe(0);
  });

  it('accepts 0 for price_min', () => {
    const result = diamondSearchSchema.safeParse({ price_min: 0 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price_min).toBe(0);
  });

  it('accepts 0 for ratio_min', () => {
    const result = diamondSearchSchema.safeParse({ ratio_min: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts 0 for table_min', () => {
    const result = diamondSearchSchema.safeParse({ table_min: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts 0 for depth_pct_min', () => {
    const result = diamondSearchSchema.safeParse({ depth_pct_min: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts 0 for price_model_price_min', () => {
    const result = diamondSearchSchema.safeParse({ price_model_price_min: 0 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price_model_price_min).toBe(0);
  });

  it('accepts 0 for length_min, width_min, depth_mm_min', () => {
    const result = diamondSearchSchema.safeParse({ length_min: 0, width_min: 0, depth_mm_min: 0 });
    expect(result.success).toBe(true);
  });
});

describe('diamondSearchSchema — limit', () => {
  it('accepts limit of 1000', () => {
    const result = diamondSearchSchema.safeParse({ limit: 1000 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(1000);
  });

  it('rejects limit above 1000', () => {
    const result = diamondSearchSchema.safeParse({ limit: 1001 });
    expect(result.success).toBe(false);
  });

  it('defaults limit to 50', () => {
    const result = diamondSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(50);
  });

  it('rejects limit of 0', () => {
    const result = diamondSearchSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });
});

describe('diamondSearchSchema — sort_by', () => {
  it('accepts price_model_price', () => {
    const result = diamondSearchSchema.safeParse({ sort_by: 'price_model_price' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sort_by).toBe('price_model_price');
  });

  it('accepts rating', () => {
    const result = diamondSearchSchema.safeParse({ sort_by: 'rating' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sort_by).toBe('rating');
  });

  it('accepts legacy feed_price', () => {
    const result = diamondSearchSchema.safeParse({ sort_by: 'feed_price' });
    expect(result.success).toBe(true);
  });

  it('accepts created_at', () => {
    const result = diamondSearchSchema.safeParse({ sort_by: 'created_at' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown sort column', () => {
    const result = diamondSearchSchema.safeParse({ sort_by: 'unknown_column' });
    expect(result.success).toBe(false);
  });

  it('defaults to created_at', () => {
    const result = diamondSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sort_by).toBe('created_at');
  });
});

describe('diamondSearchSchema — fields', () => {
  it('accepts slim', () => {
    const result = diamondSearchSchema.safeParse({ fields: 'slim' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fields).toBe('slim');
  });

  it('accepts full', () => {
    const result = diamondSearchSchema.safeParse({ fields: 'full' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fields).toBe('full');
  });

  it('rejects invalid fields value', () => {
    const result = diamondSearchSchema.safeParse({ fields: 'partial' });
    expect(result.success).toBe(false);
  });

  it('defaults to full', () => {
    const result = diamondSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fields).toBe('full');
  });
});

describe('diamondSearchSchema — availability filter', () => {
  it('accepts a single availability string', () => {
    const result = diamondSearchSchema.safeParse({ availability: 'available' });
    expect(result.success).toBe(true);
  });

  it('accepts an array of availability values', () => {
    const result = diamondSearchSchema.safeParse({ availability: ['available', 'on_hold'] });
    expect(result.success).toBe(true);
  });

  it('is optional', () => {
    const result = diamondSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.availability).toBeUndefined();
  });
});

describe('diamondSearchSchema — price_model_price filters', () => {
  it('accepts price_model_price_min', () => {
    const result = diamondSearchSchema.safeParse({ price_model_price_min: 500 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price_model_price_min).toBe(500);
  });

  it('accepts price_model_price_max', () => {
    const result = diamondSearchSchema.safeParse({ price_model_price_max: 10000 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price_model_price_max).toBe(10000);
  });

  it('accepts 0 for price_model_price_min', () => {
    const result = diamondSearchSchema.safeParse({ price_model_price_min: 0 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price_model_price_min).toBe(0);
  });

  it('rejects negative price_model_price_min', () => {
    const result = diamondSearchSchema.safeParse({ price_model_price_min: -1 });
    expect(result.success).toBe(false);
  });
});

describe('diamondSearchSchema — coercion from strings (query param style)', () => {
  it('coerces string "0" to 0 for carat_min', () => {
    const result = diamondSearchSchema.safeParse({ carat_min: '0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.carat_min).toBe(0);
  });

  it('coerces string "1000" to 1000 for limit', () => {
    const result = diamondSearchSchema.safeParse({ limit: '1000' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(1000);
  });
});
