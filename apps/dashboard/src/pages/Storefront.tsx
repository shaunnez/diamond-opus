import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, RefreshCw, Grid, List } from 'lucide-react';
import { getDiamondsForStorefront, type StorefrontFilters } from '../api/trading';
import { PageContainer } from '../components/layout/Layout';
import {
  Button,
  PageLoader,
  Alert,
  Pagination,
  DiamondCard,
} from '../components/ui';

const FEEDS = ['all', 'nivoda', 'demo'] as const;
type FeedType = typeof FEEDS[number];

const SHAPES = ['ROUND', 'OVAL', 'EMERALD', 'CUSHION', 'PRINCESS', 'ASSCHER', 'RADIANT', 'MARQUISE', 'PEAR', 'HEART'];

export function Storefront() {
  const [page, setPage] = useState(1);
  const [selectedFeed, setSelectedFeed] = useState<FeedType>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<StorefrontFilters>({});
  const limit = 24;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['storefront-diamonds', page, selectedFeed, filters],
    queryFn: () => {
      const feedFilter = selectedFeed === 'all' ? undefined : selectedFeed;
      return getDiamondsForStorefront({ ...filters, feed: feedFilter }, page, limit);
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const handleFilterChange = (key: keyof StorefrontFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
  };

  if (isLoading) return <PageLoader />;

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-2">
          Diamond Storefront
        </h1>
        <p className="text-stone-600 dark:text-stone-400">
          Browse our collection of premium diamonds
        </p>
      </div>

      {/* Feed selector and controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Feed tabs */}
        <div className="inline-flex p-1 bg-stone-100 dark:bg-stone-800 rounded-lg">
          {FEEDS.map((feed) => (
            <button
              key={feed}
              onClick={() => {
                setSelectedFeed(feed);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                selectedFeed === feed
                  ? 'bg-white dark:bg-stone-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              {feed.charAt(0).toUpperCase() + feed.slice(1)}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="w-4 h-4" />}
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-6 p-4 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Filters</h3>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear All
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Shape filter */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                Shape
              </label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filters.shapes?.[0] || ''}
                onChange={(e) =>
                  handleFilterChange('shapes', e.target.value ? [e.target.value] : undefined)
                }
              >
                <option value="">All Shapes</option>
                {SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))}
              </select>
            </div>

            {/* Carat range */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                Carat Min
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="0.5"
                value={filters.caratMin || ''}
                onChange={(e) =>
                  handleFilterChange('caratMin', e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                Carat Max
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="5.0"
                value={filters.caratMax || ''}
                onChange={(e) =>
                  handleFilterChange('caratMax', e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </div>

            {/* Price range */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                Max Price
              </label>
              <input
                type="number"
                step="1000"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="100000"
                value={filters.priceMax || ''}
                onChange={(e) =>
                  handleFilterChange('priceMax', e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </div>

            {/* Lab grown toggle */}
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-primary-600 border-stone-300 dark:border-stone-600 rounded focus:ring-primary-500"
                  checked={filters.labGrown === true}
                  onChange={(e) =>
                    handleFilterChange('labGrown', e.target.checked ? true : undefined)
                  }
                />
                <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Lab Grown Only
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="error" title="Failed to load diamonds" className="mb-6">
          {(error as Error).message}
        </Alert>
      )}

      {/* Results count */}
      <div className="mb-4 text-sm text-stone-600 dark:text-stone-400">
        {data?.pagination.total || 0} diamonds found
      </div>

      {/* Diamond grid */}
      {!data?.data.length ? (
        <div className="text-center py-16">
          <Grid className="w-16 h-16 text-stone-300 dark:text-stone-600 mx-auto mb-4" />
          <p className="text-lg text-stone-500 dark:text-stone-400">No diamonds found</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">
            Try adjusting your filters or selected feed
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {data.data.map((diamond) => (
              <DiamondCard key={diamond.id} diamond={diamond} />
            ))}
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              limit={limit}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}
