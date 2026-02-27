/**
 * Tests for diamond search query logic.
 * Verifies new sort columns, NULLS LAST ordering, new filters,
 * and the limit cap update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryFn = vi.fn();
vi.mock('../../client.js', () => ({
  query: (...args: unknown[]) => mockQueryFn(...args),
}));

import { searchDiamonds, getRelatedDiamonds, getRecommendedDiamonds } from '../diamonds.js';

function makeCountResult(count = 0) {
  return { rows: [{ count: String(count) }] };
}

function makeDataResult(rows: unknown[] = []) {
  return { rows };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchDiamonds — sort columns', () => {
  it('accepts price_model_price as sort column', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ sortBy: 'price_model_price', sortOrder: 'asc' });

    const dataCall = mockQueryFn.mock.calls[1];
    expect(dataCall[0]).toContain('price_model_price ASC NULLS LAST');
  });

  it('accepts rating as sort column', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ sortBy: 'rating', sortOrder: 'desc' });

    const dataCall = mockQueryFn.mock.calls[1];
    expect(dataCall[0]).toContain('rating DESC NULLS LAST');
  });

  it('falls back to created_at for unknown sort column', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ sortBy: 'unknown_column', sortOrder: 'asc' });

    const dataCall = mockQueryFn.mock.calls[1];
    expect(dataCall[0]).toContain('created_at ASC NULLS LAST');
  });

  it('always appends NULLS LAST to ORDER BY', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ sortBy: 'carats', sortOrder: 'desc' });

    const dataCall = mockQueryFn.mock.calls[1];
    expect(dataCall[0]).toContain('NULLS LAST');
  });
});

describe('searchDiamonds — limit cap', () => {
  it('respects limit up to 1000', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ limit: 1000 });

    const dataCall = mockQueryFn.mock.calls[1];
    const limitArg = dataCall[1].at(-2);
    expect(limitArg).toBe(1000);
  });

  it('caps limit at 1000', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ limit: 5000 });

    const dataCall = mockQueryFn.mock.calls[1];
    const limitArg = dataCall[1].at(-2);
    expect(limitArg).toBe(1000);
  });
});

describe('searchDiamonds — availability filter', () => {
  it('adds availability = ANY($n) when availability array provided', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ availability: ['available'] });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('availability = ANY(');
    // values array contains the pg array argument, e.g. [['available']]
    expect(countCall[1]).toContainEqual(['available']);
  });

  it('does not add availability filter when array is empty', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ availability: [] });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).not.toContain('availability = ANY(');
  });

  it('does not add availability filter when not provided', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({});

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).not.toContain('availability = ANY(');
  });
});

describe('searchDiamonds — price_model_price filters', () => {
  it('adds price_model_price >= $n for priceModelPriceMin', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ priceModelPriceMin: 1000 });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('price_model_price >=');
    expect(countCall[1]).toContain(1000);
  });

  it('adds price_model_price <= $n for priceModelPriceMax', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ priceModelPriceMax: 5000 });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('price_model_price <=');
    expect(countCall[1]).toContain(5000);
  });

  it('supports 0 as priceModelPriceMin', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ priceModelPriceMin: 0 });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('price_model_price >=');
    expect(countCall[1]).toContain(0);
  });
});

describe('searchDiamonds — fancyColor boolean filter', () => {
  it('adds IS NOT NULL condition when fancyColor is true', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ fancyColor: true });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('fancy_color IS NOT NULL');
    // No extra param bound — static condition
    expect(countCall[1]).not.toContainEqual(true);
    expect(countCall[1]).not.toContainEqual(false);
  });

  it('adds IS NULL condition when fancyColor is false', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ fancyColor: false });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('fancy_color IS NULL');
    expect(countCall[1]).not.toContainEqual(false);
  });

  it('does not add fancy_color condition when fancyColor is undefined', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({});

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).not.toContain('fancy_color');
  });
});

describe('searchDiamonds — fancyColors array filter', () => {
  it('adds fancy_color = ANY($n) when fancyColors array provided', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ fancyColors: ['Yellow', 'Pink'] });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).toContain('fancy_color = ANY(');
    expect(countCall[1]).toContainEqual(['Yellow', 'Pink']);
  });

  it('does not add fancyColors filter when array is empty', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce(makeDataResult());

    await searchDiamonds({ fancyColors: [] });

    const countCall = mockQueryFn.mock.calls[0];
    expect(countCall[0]).not.toContain('fancy_color = ANY(');
  });
});

describe('searchDiamonds — pagination', () => {
  it('returns correct pagination shape', async () => {
    mockQueryFn
      .mockResolvedValueOnce(makeCountResult(150))
      .mockResolvedValueOnce(makeDataResult());

    const result = await searchDiamonds({ page: 2, limit: 50 });

    expect(result.pagination.total).toBe(150);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.totalPages).toBe(3);
  });
});

// Minimal DB row matching the diamonds table column names used by mapRowToDiamond.
function makeAnchorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    feed: 'nivoda',
    supplier: 'nivoda',
    supplier_stone_id: 'S1',
    offer_id: 'O1',
    shape: 'ROUND',
    carats: 1.5,
    color: 'G',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: null,
    symmetry: null,
    fluorescence: null,
    fluorescence_intensity: null,
    fancy_color: null,
    fancy_intensity: null,
    fancy_overtone: null,
    ratio: null,
    lab_grown: false,
    treated: false,
    feed_price: 5000,
    supplier_price_cents: 500000,
    diamond_price: null,
    price_per_carat: 3333.33,
    price_model_price: null,
    price_model_price_cents: null,
    markup_ratio: null,
    pricing_rating: null,
    rating: null,
    availability: 'available',
    raw_availability: null,
    hold_id: null,
    image_url: null,
    video_url: null,
    certificate_lab: null,
    certificate_number: null,
    certificate_pdf_url: null,
    table_pct: null,
    depth_pct: null,
    length_mm: null,
    width_mm: null,
    depth_mm: null,
    crown_angle: null,
    crown_height: null,
    pavilion_angle: null,
    pavilion_depth: null,
    girdle: null,
    culet_size: null,
    eye_clean: null,
    brown: null,
    green: null,
    milky: null,
    supplier_name: null,
    supplier_legal_name: null,
    status: 'active',
    source_updated_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

describe('getRelatedDiamonds', () => {
  it('returns null when anchor diamond is not found', async () => {
    mockQueryFn.mockResolvedValueOnce(makeDataResult([]));

    const result = await getRelatedDiamonds('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBeNull();
    expect(mockQueryFn).toHaveBeenCalledTimes(1);
  });

  it('returns anchor and related diamonds array', async () => {
    const anchor = makeAnchorRow();
    const related = makeAnchorRow({ id: '550e8400-e29b-41d4-a716-446655440002' });

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))
      .mockResolvedValueOnce(makeDataResult([related]));

    const result = await getRelatedDiamonds('550e8400-e29b-41d4-a716-446655440001');

    expect(result).not.toBeNull();
    expect(result?.anchor.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(result?.related).toHaveLength(1);
  });

  it('applies carat tolerance range in the related query', async () => {
    const anchor = makeAnchorRow({ carats: 1.5 });

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))
      .mockResolvedValueOnce(makeDataResult([]));

    await getRelatedDiamonds('550e8400-e29b-41d4-a716-446655440001', { caratTolerance: 0.15 });

    const relatedQuerySql = mockQueryFn.mock.calls[1][0] as string;
    const relatedQueryValues = mockQueryFn.mock.calls[1][1] as unknown[];
    expect(relatedQuerySql).toContain('carats >=');
    expect(relatedQuerySql).toContain('carats <=');
    expect(relatedQueryValues).toContain(1.35); // 1.5 - 0.15
    expect(relatedQueryValues).toContain(1.65); // 1.5 + 0.15
  });

  it('always excludes the anchor from related results', async () => {
    const anchor = makeAnchorRow();

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))
      .mockResolvedValueOnce(makeDataResult([]));

    await getRelatedDiamonds('550e8400-e29b-41d4-a716-446655440001');

    const relatedQuerySql = mockQueryFn.mock.calls[1][0] as string;
    expect(relatedQuerySql).toContain('id !=');
  });
});

describe('getRecommendedDiamonds', () => {
  it('returns null when anchor diamond is not found', async () => {
    mockQueryFn.mockResolvedValueOnce(makeDataResult([]));

    const result = await getRecommendedDiamonds('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBeNull();
    expect(mockQueryFn).toHaveBeenCalledTimes(1);
  });

  it('returns anchor and all three slots when enough candidates exist', async () => {
    const anchor = makeAnchorRow({ id: 'anchor-id', rating: 5, price_model_price: '5000' });
    const slot1 = makeAnchorRow({ id: 'slot1-id', rating: 9, price_model_price: '8000' });
    const slot2 = makeAnchorRow({ id: 'slot2-id', rating: 6, price_model_price: '12000' });
    const slot3 = makeAnchorRow({ id: 'slot3-id', rating: 8, price_model_price: '6000' });

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))  // getDiamondById (anchor lookup)
      .mockResolvedValueOnce(makeDataResult([slot1]))   // slot 1: highest rated
      .mockResolvedValueOnce(makeDataResult([slot2]))   // slot 2: most expensive
      .mockResolvedValueOnce(makeDataResult([slot3]))   // slot 3: mid-rated (primary 7–8 attempt)

    const result = await getRecommendedDiamonds('anchor-id');

    expect(result).not.toBeNull();
    expect(result?.anchor.id).toBe('anchor-id');
    expect(result?.highestRated?.id).toBe('slot1-id');
    expect(result?.mostExpensive?.id).toBe('slot2-id');
    expect(result?.midRated?.id).toBe('slot3-id');
  });

  it('always excludes the anchor id from all slot queries', async () => {
    const anchor = makeAnchorRow();

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))
      .mockResolvedValue(makeDataResult([]));

    await getRecommendedDiamonds('550e8400-e29b-41d4-a716-446655440001');

    // Every query after the anchor lookup must exclude the anchor id
    for (let i = 1; i < mockQueryFn.mock.calls.length; i++) {
      const sql = mockQueryFn.mock.calls[i][0] as string;
      expect(sql).toContain('id !=');
    }
  });

  it('slot 3 falls back to closest-to-7.5 when no 7–8 rated diamond exists', async () => {
    const anchor = makeAnchorRow({ id: 'anchor-id' });
    const slot1 = makeAnchorRow({ id: 'slot1-id', rating: 10 });
    const slot2 = makeAnchorRow({ id: 'slot2-id', rating: 6 });
    const slot3Fallback = makeAnchorRow({ id: 'slot3-fb', rating: 5 });

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))    // anchor lookup
      .mockResolvedValueOnce(makeDataResult([slot1]))     // slot 1: highest rated
      .mockResolvedValueOnce(makeDataResult([slot2]))     // slot 2: most expensive
      .mockResolvedValueOnce(makeDataResult([]))          // slot 3 primary (7–8): none found
      .mockResolvedValueOnce(makeDataResult([slot3Fallback])); // slot 3 fallback

    const result = await getRecommendedDiamonds('anchor-id');

    expect(result?.midRated?.id).toBe('slot3-fb');
  });

  it('slot 3 primary query uses rating bounds 7 and 8', async () => {
    const anchor = makeAnchorRow({ id: 'anchor-id' });
    const slot1 = makeAnchorRow({ id: 'slot1-id', rating: 10 });
    const slot2 = makeAnchorRow({ id: 'slot2-id', rating: 6, price_model_price: '9000' });

    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))
      .mockResolvedValueOnce(makeDataResult([slot1]))
      .mockResolvedValueOnce(makeDataResult([slot2]))
      .mockResolvedValue(makeDataResult([]));

    await getRecommendedDiamonds('anchor-id');

    // The slot 3 primary attempt query should bind 7 and 8 as rating bounds
    const slot3PrimaryCall = mockQueryFn.mock.calls[3];
    const slot3Values = slot3PrimaryCall[1] as unknown[];
    expect(slot3Values).toContain(7);
    expect(slot3Values).toContain(8);
  });

  it('returns slots with nulls when pool is empty after constraint relaxation', async () => {
    const anchor = makeAnchorRow({ id: 'anchor-id' });

    // Anchor lookup + all subsequent slot queries return empty
    mockQueryFn
      .mockResolvedValueOnce(makeDataResult([anchor]))
      .mockResolvedValue(makeDataResult([]));

    const result = await getRecommendedDiamonds('anchor-id');

    expect(result).not.toBeNull();
    expect(result?.anchor.id).toBe('anchor-id');
    expect(result?.highestRated).toBeNull();
    expect(result?.mostExpensive).toBeNull();
    expect(result?.midRated).toBeNull();
  });
});
