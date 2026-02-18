import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchDiamonds } from '../api/diamonds';
import type { DiamondSearchParams, StoneType } from '../types/diamond';

const ARRAY_PARAMS = [
  'shape',
  'color',
  'clarity',
  'cut',
  'polish',
  'symmetry',
  'fluorescence_intensity',
  'lab',
  'fancy_intensity',
  'fancy_colors',
] as const;

const NUMBER_PARAMS = [
  'carat_min',
  'carat_max',
  'price_min',
  'price_max',
  'ratio_min',
  'ratio_max',
  'table_min',
  'table_max',
  'depth_pct_min',
  'depth_pct_max',
  'page',
  'limit',
] as const;

const BOOLEAN_PARAMS = ['eye_clean', 'no_bgm'] as const;

function parseFiltersFromURL(params: URLSearchParams): DiamondSearchParams {
  const filters: DiamondSearchParams = {};

  const feed = params.get('feed');
  if (feed && feed !== 'all') filters.feed = feed;

  for (const key of NUMBER_PARAMS) {
    const val = params.get(key);
    if (val) (filters as Record<string, number>)[key] = Number(val);
  }

  for (const key of ARRAY_PARAMS) {
    const val = params.get(key);
    if (val) (filters as Record<string, string[]>)[key] = val.split(',');
  }

  for (const key of BOOLEAN_PARAMS) {
    const val = params.get(key);
    if (val === 'true') (filters as Record<string, boolean>)[key] = true;
  }

  const sortBy = params.get('sort_by');
  if (sortBy) filters.sort_by = sortBy;

  const sortOrder = params.get('sort_order');
  if (sortOrder === 'asc' || sortOrder === 'desc') filters.sort_order = sortOrder;

  return filters;
}

function filtersToURLParams(filters: DiamondSearchParams): Record<string, string> {
  const result: Record<string, string> = {};

  if (filters.feed && filters.feed !== 'all') result.feed = filters.feed;

  for (const key of NUMBER_PARAMS) {
    const val = (filters as Record<string, number | undefined>)[key];
    if (val !== undefined) result[key] = String(val);
  }

  for (const key of ARRAY_PARAMS) {
    const val = (filters as Record<string, string[] | undefined>)[key];
    if (val?.length) result[key] = val.join(',');
  }

  for (const key of BOOLEAN_PARAMS) {
    const val = (filters as Record<string, boolean | undefined>)[key];
    if (val !== undefined) result[key] = String(val);
  }

  if (filters.sort_by) result.sort_by = filters.sort_by;
  if (filters.sort_order) result.sort_order = filters.sort_order;

  return result;
}

function getStoneTypeFromURL(params: URLSearchParams): StoneType {
  const val = params.get('stone_type');
  if (val === 'natural' || val === 'lab' || val === 'natural_fancy' || val === 'lab_fancy') return val;
  return 'all';
}

export function useDiamondSearch() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchParams]);
  const stoneType = useMemo(() => getStoneTypeFromURL(searchParams), [searchParams]);
  const selectedFeed = filters.feed || 'all';

  // Build the API params from filters + stone type
  const apiParams = useMemo(() => {
    const params: DiamondSearchParams = { ...filters };
    if (!params.limit) params.limit = 24;
    if (!params.page) params.page = 1;
    // Always request slim fields for list views (full detail fetched per-diamond)
    params.fields = 'slim';
    // Default to available-only unless the user has explicitly set availability
    if (!params.availability?.length) params.availability = ['available'];

    // Apply stone type filter
    if (stoneType === 'natural') {
      params.lab_grown = false;
      delete params.fancy_color;
      delete params.fancy_intensity;
      delete params.fancy_colors;
    } else if (stoneType === 'natural_fancy') {
      params.lab_grown = false;
      params.fancy_color = true;
      delete params.color;
    } else if (stoneType === 'lab') {
      params.lab_grown = true;
      delete params.fancy_color;
      delete params.fancy_intensity;
      delete params.fancy_colors;
    } else if (stoneType === 'lab_fancy') {
      params.lab_grown = true;
      params.fancy_color = true;
      delete params.color;
    } else {
      // 'all' - don't restrict
      delete params.lab_grown;
    }

    return params;
  }, [filters, stoneType]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['diamonds', apiParams],
    queryFn: () => searchDiamonds(apiParams),
    placeholderData: (prev) => prev,
  });

  const setFilters = useCallback(
    (newFilters: DiamondSearchParams) => {
      const urlParams = filtersToURLParams(newFilters);
      if (stoneType !== 'all') urlParams.stone_type = stoneType;
      setSearchParams(urlParams, { replace: true });
    },
    [setSearchParams, stoneType]
  );

  const setFeed = useCallback(
    (feed: string) => {
      const newFilters = { ...filters, feed: feed === 'all' ? undefined : feed, page: 1 };
      const urlParams = filtersToURLParams(newFilters);
      if (stoneType !== 'all') urlParams.stone_type = stoneType;
      setSearchParams(urlParams, { replace: true });
    },
    [setSearchParams, filters, stoneType]
  );

  const setStoneType = useCallback(
    (type: StoneType) => {
      const newFilters = { ...filters };
      const isFancy = type === 'natural_fancy' || type === 'lab_fancy';
      if (isFancy) {
        delete newFilters.color;
      } else {
        delete newFilters.fancy_colors;
        delete newFilters.fancy_intensity;
      }
      const urlParams = filtersToURLParams(newFilters);
      if (type !== 'all') urlParams.stone_type = type;
      setSearchParams(urlParams, { replace: true });
    },
    [setSearchParams, filters]
  );

  const resetFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const setPage = useCallback(
    (page: number) => {
      setFilters({ ...filters, page });
    },
    [filters, setFilters]
  );

  const setSort = useCallback(
    (sort_by: string, sort_order: 'asc' | 'desc') => {
      setFilters({ ...filters, sort_by, sort_order, page: 1 });
    },
    [filters, setFilters]
  );

  return {
    filters,
    stoneType,
    selectedFeed,
    setFilters,
    setFeed,
    setStoneType,
    resetFilters,
    setPage,
    setSort,
    diamonds: data?.data ?? [],
    pagination: data?.pagination ?? { total: 0, page: 1, limit: 24, totalPages: 0 },
    isLoading,
    isFetching,
    error,
  };
}
