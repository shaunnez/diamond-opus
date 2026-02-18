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

import { searchDiamonds } from '../diamonds.js';

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
