import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, Clock, History, Layers, Play, RefreshCw, Zap } from 'lucide-react';
import {
  runHeatmap,
  previewHeatmap,
  getHeatmapHistory,
  type HeatmapResult,
  type HeatmapHistoryEntry,
  type RunHeatmapOptions,
} from '../api/heatmap';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Select,
  Input,
  Alert,
  useToast,
} from '../components/ui';
import { formatNumber, formatDuration, formatRelativeTime } from '../utils/formatters';

// Color scale for density visualization
function getDensityColor(count: number, maxCount: number): string {
  const intensity = Math.min(count / maxCount, 1);
  if (intensity < 0.2) return 'bg-blue-100';
  if (intensity < 0.4) return 'bg-blue-200';
  if (intensity < 0.6) return 'bg-blue-400';
  if (intensity < 0.8) return 'bg-blue-500';
  return 'bg-blue-600';
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function Heatmap() {
  const { addToast } = useToast();
  const [feed, setFeed] = useState('nivoda-natural');
  const [minPrice, setMinPrice] = useState('0');
  const [maxPrice, setMaxPrice] = useState('50000');
  const [maxWorkers, setMaxWorkers] = useState('10');
  const [result, setResult] = useState<HeatmapResult | null>(null);

  // Fetch heatmap history for the selected feed
  const historyQuery = useQuery({
    queryKey: ['heatmap-history', feed],
    queryFn: () => getHeatmapHistory(feed),
    retry: false,
  });

  const runMutation = useMutation({
    mutationFn: (options: RunHeatmapOptions) => runHeatmap(options),
    onSuccess: (data) => {
      setResult(data);
      historyQuery.refetch();
      addToast({
        variant: 'success',
        title: 'Heatmap scan complete',
        message: `Found ${data.total_records.toLocaleString()} records across ${data.worker_count} partitions`,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Heatmap scan failed',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (options: RunHeatmapOptions) => previewHeatmap(options),
    onSuccess: (data) => {
      setResult(data);
      historyQuery.refetch();
      addToast({
        variant: 'success',
        title: 'Preview complete',
        message: `Found ${data.total_records.toLocaleString()} records across ${data.worker_count} partitions`,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Preview failed',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const handleRun = (isPreview: boolean) => {
    const options: RunHeatmapOptions = {
      min_price: parseInt(minPrice, 10) || 0,
      max_price: parseInt(maxPrice, 10) || 50000,
      max_workers: parseInt(maxWorkers, 10) || 10,
      feed,
    };


    if (isPreview) {
      previewMutation.mutate(options);
    } else {
      runMutation.mutate(options);
    }
  };

  const loadFromHistory = (entry: HeatmapHistoryEntry) => {
    setResult(entry.result);
    addToast({
      variant: 'success',
      title: 'Loaded from history',
      message: `Loaded ${entry.scan_type} scan from ${new Date(entry.scanned_at).toLocaleString()}`,
    });
  };

  const isLoading = runMutation.isPending || previewMutation.isPending;
  const error = runMutation.error || previewMutation.error;

  // Memoize expensive density computations — only recalculate when result changes
  const maxCount = useMemo(
    () => (result ? Math.max(...result.density_map.map((d) => d.count)) : 0),
    [result]
  );

  const priceBands = useMemo(
    () => (result ? groupIntoPriceBands(result.density_map, 10) : []),
    [result]
  );

  return (
    <>
      <Header />
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Heatmap Scanner</h1>
            <p className="text-stone-600 dark:text-stone-400 mt-1">
              Analyze diamond inventory density by price per carat to optimize worker partitioning
            </p>
          </div>

          {/* Last Scan History */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Last Scan History
                </span>
              }
              subtitle={`Feed: ${feed}`}
              action={
                <div className="flex items-center gap-3">
                  <Select
                    label=""
                    value={feed}
                    onChange={(e) => setFeed(e.target.value)}
                    options={[
                      { value: 'nivoda-natural', label: 'Nivoda Natural' },
                      { value: 'nivoda-labgrown', label: 'Nivoda Labgrown' },
                      { value: 'demo', label: 'Demo' },
                    ]}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => historyQuery.refetch()}
                    disabled={historyQuery.isFetching}
                    icon={<RefreshCw className={`w-4 h-4 ${historyQuery.isFetching ? 'animate-spin' : ''}`} />}
                  >
                    Refresh
                  </Button>
                </div>
              }
            />
            {historyQuery.isError && (
              <Alert variant="warning" className="mb-4">
                Could not load scan history. Azure Storage may not be configured.
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Last Full Run */}
              <HistoryCard
                title="Last Full Scan"
                entry={historyQuery.data?.run ?? null}
                isLoading={historyQuery.isLoading}
                onLoad={loadFromHistory}
              />
              {/* Last Preview */}
              <HistoryCard
                title="Last Preview Scan"
                entry={historyQuery.data?.preview ?? null}
                isLoading={historyQuery.isLoading}
                onLoad={loadFromHistory}
              />
            </div>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader
              title="Scan Configuration"
              subtitle="Configure the heatmap scanning parameters"
            />
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Min $/ct"
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <Input
                label="Max $/ct"
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
              <Input
                label="Max Workers"
                type="number"
                value={maxWorkers}
                onChange={(e) => setMaxWorkers(e.target.value)}
              />
            </div>

            <div className="mt-4 flex items-center gap-6">
              
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => handleRun(true)}
                disabled={isLoading}
                icon={<Zap className="w-4 h-4" />}
              >
                {previewMutation.isPending ? 'Running Preview...' : 'Quick Preview'}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleRun(false)}
                disabled={isLoading}
                icon={<Play className="w-4 h-4" />}
              >
                {runMutation.isPending ? 'Running Full Scan...' : 'Run Full Scan'}
              </Button>
            </div>

            {error && (
              <Alert variant="error" className="mt-4">
                {error instanceof Error ? error.message : 'An error occurred'}
              </Alert>
            )}
          </Card>

          {/* Results */}
          {result && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary-50 rounded-xl">
                      <BarChart3 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm text-stone-500">Total Records</p>
                      <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                        {formatNumber(result.total_records)}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-success-50 rounded-xl">
                      <Layers className="w-6 h-6 text-success-600" />
                    </div>
                    <div>
                      <p className="text-sm text-stone-500">Worker Partitions</p>
                      <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                        {result.worker_count}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-warning-50 rounded-xl">
                      <Activity className="w-6 h-6 text-warning-600" />
                    </div>
                    <div>
                      <p className="text-sm text-stone-500">API Calls</p>
                      <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                        {result.stats.api_calls}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-error-50 rounded-xl">
                      <Clock className="w-6 h-6 text-error-600" />
                    </div>
                    <div>
                      <p className="text-sm text-stone-500">Scan Duration</p>
                      <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                        {formatDuration(result.stats.scan_duration_ms)}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Density Heatmap Visualization */}
              <Card>
                <CardHeader
                  title="Density Heatmap"
                  subtitle={`${result.stats.non_empty_ranges} price ranges with data`}
                />
                <div className="mt-4">
                  {/* Bar chart visualization */}
                  <div className="space-y-2">
                    {priceBands.map((band, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-32 text-right text-sm text-stone-500 font-mono">
                          {formatPrice(band.minPrice)}
                        </div>
                        <div className="flex-1 h-8 bg-stone-100 rounded-lg overflow-hidden relative">
                          <div
                            className={`h-full ${getDensityColor(band.count, maxCount)} transition-all duration-300`}
                            style={{
                              width: `${Math.max((band.count / maxCount) * 100, 1)}%`,
                            }}
                          />
                          <div className="absolute inset-0 flex items-center px-3">
                            <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                              {formatNumber(band.count)} diamonds
                            </span>
                          </div>
                        </div>
                        <div className="w-32 text-sm text-stone-500 font-mono">
                          {formatPrice(band.maxPrice)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Color legend */}
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <span className="text-sm text-stone-500">Density:</span>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-100 rounded" />
                      <span className="text-xs text-stone-500">Low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-200 rounded" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-400 rounded" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-500 rounded" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-600 rounded" />
                      <span className="text-xs text-stone-500">High</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Partitions Table */}
              <Card>
                <CardHeader
                  title="Worker Partitions"
                  subtitle="How work will be distributed across workers"
                />
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-stone-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Partition
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                          $/ct Range
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Records
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                          % of Total
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Distribution
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {result.partitions.map((partition) => {
                        const percentage = (partition.total_records / result.total_records) * 100;
                        return (
                          <tr key={partition.partition_id} className="hover:bg-stone-50">
                            <td className="px-4 py-3 text-sm font-mono text-stone-900 dark:text-stone-100">
                              {partition.partition_id}
                            </td>
                            <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                              {formatPrice(partition.min_price)} - {formatPrice(partition.max_price)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-stone-900 dark:text-stone-100 font-medium">
                              {formatNumber(partition.total_records)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-stone-600 dark:text-stone-400">
                              {percentage.toFixed(1)}%
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-32 h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary-500 rounded-full"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Raw Density Data */}
              <Card>
                <CardHeader
                  title="Raw Density Data"
                  subtitle={`${result.density_map.length} price ranges scanned`}
                />
                <div className="mt-4 max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-stone-200">
                    <thead className="bg-stone-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 uppercase">
                          Min $/ct
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 uppercase">
                          Max $/ct
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-stone-500 uppercase">
                          Count
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 uppercase">
                          Density
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {result.density_map.map((chunk, index) => (
                        <tr key={index} className="hover:bg-stone-50">
                          <td className="px-4 py-2 text-sm font-mono text-stone-600 dark:text-stone-400">
                            {formatPrice(chunk.min_price)}
                          </td>
                          <td className="px-4 py-2 text-sm font-mono text-stone-600 dark:text-stone-400">
                            {formatPrice(chunk.max_price)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-stone-900 dark:text-stone-100">
                            {formatNumber(chunk.count)}
                          </td>
                          <td className="px-4 py-2">
                            <div
                              className={`w-16 h-4 rounded ${getDensityColor(chunk.count, maxCount)}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </PageContainer>
    </>
  );
}

// ============================================================================
// History Card component
// ============================================================================

function HistoryCard({
  title,
  entry,
  isLoading,
  onLoad,
}: {
  title: string;
  entry: HeatmapHistoryEntry | null;
  isLoading: boolean;
  onLoad: (entry: HeatmapHistoryEntry) => void;
}) {
  if (isLoading) {
    return (
      <div className="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-stone-700 dark:text-stone-300">{title}</h4>
        <div className="mt-2 animate-pulse space-y-2">
          <div className="h-4 bg-stone-200 rounded w-3/4" />
          <div className="h-4 bg-stone-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-stone-700 dark:text-stone-300">{title}</h4>
        <p className="mt-2 text-sm text-stone-400">No scan recorded yet</p>
      </div>
    );
  }

  return (
    <div className="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <h4 className="text-sm font-medium text-stone-700 dark:text-stone-300">{title}</h4>
        <Button variant="secondary" size="sm" onClick={() => onLoad(entry)}>
          Load Results
        </Button>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">Scanned</span>
          <span className="text-stone-700 dark:text-stone-300">
            {formatRelativeTime(entry.scanned_at)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">Total Records</span>
          <span className="text-stone-700 dark:text-stone-300 font-medium">
            {formatNumber(entry.result.total_records)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">Partitions</span>
          <span className="text-stone-700 dark:text-stone-300">
            {entry.result.worker_count}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">Duration</span>
          <span className="text-stone-700 dark:text-stone-300">
            {formatDuration(entry.result.stats.scan_duration_ms)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">API Calls</span>
          <span className="text-stone-700 dark:text-stone-300">
            {entry.result.stats.api_calls}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper function to group density chunks into larger price bands
// ============================================================================

function groupIntoPriceBands(
  densityMap: { min_price: number; max_price: number; count: number }[],
  numBands: number
): { minPrice: number; maxPrice: number; count: number }[] {
  if (densityMap.length === 0) return [];

  const minPrice = densityMap[0].min_price;
  const maxPrice = densityMap[densityMap.length - 1].max_price;
  const bandSize = (maxPrice - minPrice) / numBands;

  const bands: { minPrice: number; maxPrice: number; count: number }[] = [];

  for (let i = 0; i < numBands; i++) {
    const bandMin = minPrice + i * bandSize;
    const bandMax = minPrice + (i + 1) * bandSize;

    const count = densityMap
      .filter(
        (chunk) =>
          (chunk.min_price >= bandMin && chunk.min_price < bandMax) ||
          (chunk.max_price > bandMin && chunk.max_price <= bandMax) ||
          (chunk.min_price <= bandMin && chunk.max_price >= bandMax)
      )
      .reduce((sum, chunk) => sum + chunk.count, 0);

    if (count > 0) {
      bands.push({ minPrice: bandMin, maxPrice: bandMax, count });
    }
  }

  return bands;
}
