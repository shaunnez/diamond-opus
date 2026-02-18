import { useState } from 'react';
import { SlidersHorizontal, ArrowUpDown, Database } from 'lucide-react';
import { FilterPanel } from '../components/filters/FilterPanel';
import { DiamondGrid } from '../components/diamonds/DiamondGrid';
import { Pagination } from '../components/ui/Pagination';
import { Spinner } from '../components/ui/Spinner';
import { useDiamondSearch } from '../hooks/useDiamondSearch';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'created_at', order: 'desc' as const },
  { label: 'Price: Low to High', value: 'price_model_price', order: 'asc' as const },
  { label: 'Price: High to Low', value: 'price_model_price', order: 'desc' as const },
  { label: 'Rating: Best First', value: 'rating', order: 'desc' as const },
  { label: 'Carat: Low to High', value: 'carats', order: 'asc' as const },
  { label: 'Carat: High to Low', value: 'carats', order: 'desc' as const },
  { label: 'Color', value: 'color', order: 'asc' as const },
  { label: 'Clarity', value: 'clarity', order: 'asc' as const },
];

const FEED_OPTIONS = [
  { label: 'All Feeds', value: 'all' },
  { label: 'Nivoda', value: 'nivoda' },
  { label: 'Demo', value: 'demo' },
];

export function SearchPage() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);

  const {
    filters,
    stoneType,
    selectedFeed,
    setFilters,
    setFeed,
    setStoneType,
    resetFilters,
    setPage,
    setSort,
    diamonds,
    pagination,
    isLoading,
    isFetching,
  } = useDiamondSearch();

  const currentSort = SORT_OPTIONS.find(
    (s) => s.value === (filters.sort_by || 'created_at') && s.order === (filters.sort_order || 'desc')
  );

  const currentFeed = FEED_OPTIONS.find((f) => f.value === selectedFeed);

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-charcoal">
          Diamond Collection
        </h1>
        <p className="text-sm text-warm-gray-500 mt-1">
          Browse our curated selection of natural, lab-grown, and fancy coloured diamonds
        </p>
      </div>

      <div className="flex gap-6">
        {/* Filter Panel */}
        <FilterPanel
          filters={filters}
          stoneType={stoneType}
          onFiltersChange={setFilters}
          onStoneTypeChange={setStoneType}
          onReset={resetFilters}
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
        />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3">
              {/* Mobile filter toggle */}
              <button
                onClick={() => setFilterOpen(true)}
                className="lg:hidden flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-white text-warm-gray-600 hover:text-charcoal transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
              </button>

              {/* Result count */}
              <p className="text-sm text-warm-gray-500">
                {pagination.total.toLocaleString()} diamond{pagination.total !== 1 ? 's' : ''}
                {isFetching && !isLoading && (
                  <span className="ml-2 text-warm-gray-400">updating...</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Feed selector */}
              <div className="relative">
                <button
                  onClick={() => setFeedOpen(!feedOpen)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-white text-warm-gray-600 hover:text-charcoal transition-colors"
                >
                  <Database className="w-3.5 h-3.5" />
                  {currentFeed?.label || 'Feed'}
                </button>
                {feedOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFeedOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-border shadow-card-hover z-20 min-w-[140px] animate-fade-in">
                      {FEED_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setFeed(opt.value);
                            setFeedOpen(false);
                          }}
                          className={`block w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${
                            selectedFeed === opt.value
                              ? 'bg-cream text-charcoal'
                              : 'text-warm-gray-500 hover:bg-cream hover:text-charcoal'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSortOpen(!sortOpen)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-white text-warm-gray-600 hover:text-charcoal transition-colors"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {currentSort?.label || 'Sort'}
                </button>
                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-border shadow-card-hover z-20 min-w-[180px] animate-fade-in">
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={`${opt.value}-${opt.order}`}
                          onClick={() => {
                            setSort(opt.value, opt.order);
                            setSortOpen(false);
                          }}
                          className={`block w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${
                            currentSort?.value === opt.value && currentSort?.order === opt.order
                              ? 'bg-cream text-charcoal'
                              : 'text-warm-gray-500 hover:bg-cream hover:text-charcoal'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Diamond grid */}
          {isLoading ? (
            <Spinner className="py-20" />
          ) : (
            <>
              <DiamondGrid diamonds={diamonds} />
              {pagination.totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
