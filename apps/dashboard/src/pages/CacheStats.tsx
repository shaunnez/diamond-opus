import { useQuery } from '@tanstack/react-query';
import { Database, Search, BarChart3, Activity } from 'lucide-react';
import { getCacheStats } from '../api/system';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import { Card, CardHeader, Badge, Alert } from '../components/ui';
import { ProgressBar } from '../components/ui/Progress';
import { formatNumber } from '../utils/formatters';

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function rateVariant(rate: number): 'success' | 'warning' | 'error' {
  if (rate >= 0.7) return 'success';
  if (rate >= 0.4) return 'warning';
  return 'error';
}

function capacityVariant(used: number, max: number): 'primary' | 'warning' | 'error' {
  const pct = max > 0 ? used / max : 0;
  if (pct >= 0.95) return 'error';
  if (pct >= 0.8) return 'warning';
  return 'primary';
}

export function CacheStats() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['cache-stats'],
    queryFn: getCacheStats,
    refetchInterval: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <>
        <Header />
        <PageContainer>
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </PageContainer>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Failed to load cache stats">
            Unable to fetch cache statistics. Please try again later.
          </Alert>
        </PageContainer>
      </>
    );
  }

  if (!data) return null;

  const searchTotal = data.searchHits + data.searchMisses;
  const countTotal = data.countHits + data.countMisses;
  const analyticsTotal = data.analyticsHits + data.analyticsMisses;

  return (
    <>
      <Header onRefresh={refetch} isRefreshing={isFetching} />
      <PageContainer>
        {/* Hit Rate Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
                <Search className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">Search Hit Rate</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {searchTotal > 0 ? formatRate(data.searchHitRate) : '-'}
                  </p>
                  {searchTotal > 0 && (
                    <Badge variant={rateVariant(data.searchHitRate)}>
                      {formatNumber(data.searchHits)} / {formatNumber(searchTotal)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
                <span>{formatNumber(data.searchEntries)} entries</span>
                <span>max {formatNumber(data.searchMaxEntries)}</span>
              </div>
              <ProgressBar
                value={data.searchEntries}
                max={data.searchMaxEntries}
                size="sm"
                variant={capacityVariant(data.searchEntries, data.searchMaxEntries)}
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-success-50 dark:bg-success-900/30 rounded-xl">
                <Database className="w-6 h-6 text-success-600 dark:text-success-400" />
              </div>
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">Count Hit Rate</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {countTotal > 0 ? formatRate(data.countHitRate) : '-'}
                  </p>
                  {countTotal > 0 && (
                    <Badge variant={rateVariant(data.countHitRate)}>
                      {formatNumber(data.countHits)} / {formatNumber(countTotal)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
                <span>{formatNumber(data.countEntries)} entries</span>
                <span>max {formatNumber(data.countMaxEntries)}</span>
              </div>
              <ProgressBar
                value={data.countEntries}
                max={data.countMaxEntries}
                size="sm"
                variant={capacityVariant(data.countEntries, data.countMaxEntries)}
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-info-50 dark:bg-info-900/30 rounded-xl">
                <BarChart3 className="w-6 h-6 text-info-600 dark:text-info-400" />
              </div>
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">Analytics Hit Rate</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {analyticsTotal > 0 ? formatRate(data.analyticsHitRate) : '-'}
                  </p>
                  {analyticsTotal > 0 && (
                    <Badge variant={rateVariant(data.analyticsHitRate)}>
                      {formatNumber(data.analyticsHits)} / {formatNumber(analyticsTotal)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
                <span>{formatNumber(data.analyticsEntries)} entries</span>
                <span>max {formatNumber(data.analyticsMaxEntries)}</span>
              </div>
              <ProgressBar
                value={data.analyticsEntries}
                max={data.analyticsMaxEntries}
                size="sm"
                variant={capacityVariant(data.analyticsEntries, data.analyticsMaxEntries)}
              />
            </div>
          </Card>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hit/Miss Breakdown */}
          <Card>
            <CardHeader
              title="Hit / Miss Breakdown"
              subtitle="Cumulative since last restart"
            />
            <div className="space-y-4">
              {[
                { label: 'Search', hits: data.searchHits, misses: data.searchMisses, rate: data.searchHitRate },
                { label: 'Count', hits: data.countHits, misses: data.countMisses, rate: data.countHitRate },
                { label: 'Analytics', hits: data.analyticsHits, misses: data.analyticsMisses, rate: data.analyticsHitRate },
              ].map((row) => {
                const total = row.hits + row.misses;
                return (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-stone-100 dark:border-stone-700 last:border-0">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">{row.label}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-success-600 dark:text-success-400">{formatNumber(row.hits)} hits</span>
                      <span className="text-stone-400">|</span>
                      <span className="text-error-600 dark:text-error-400">{formatNumber(row.misses)} misses</span>
                      <Badge variant={total > 0 ? rateVariant(row.rate) : 'neutral'}>
                        {total > 0 ? formatRate(row.rate) : 'N/A'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader
              title="Configuration"
              subtitle="Current cache settings"
            />
            <div className="space-y-3">
              <div className="flex items-center gap-3 py-2 border-b border-stone-100 dark:border-stone-700">
                <Activity className="w-4 h-4 text-stone-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Dataset Version</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">{data.version}</p>
                </div>
              </div>
              {[
                { label: 'Search Cache Max', value: formatNumber(data.searchMaxEntries) },
                { label: 'Count Cache Max', value: formatNumber(data.countMaxEntries) },
                { label: 'Analytics Cache Max', value: formatNumber(data.analyticsMaxEntries) },
                { label: 'TTL', value: `${data.ttlMs / 1000}s` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between py-2 border-b border-stone-100 dark:border-stone-700 last:border-0">
                  <span className="text-sm text-stone-600 dark:text-stone-400">{item.label}</span>
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{item.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
