import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Filter, X } from 'lucide-react';
import { getRuns, type RunsFilter, type RunWithStats } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Badge,
  Card,
  Button,
  Select,
  Table,
  Pagination,
  StatusBadge,
  RunTypeBadge,
  WorkerProgress,
  PageLoader,
  Alert,
} from '../components/ui';
import { RunsChart } from '../components/charts/RunsChart';
import {
  formatDateShort,
  formatDuration,
  formatLiveDuration,
  formatNumber,
  truncateId,
} from '../utils/formatters';

export function Runs() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<RunsFilter>({
    page: 1,
    limit: 20,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Get last week's date for chart
  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);

  // Chart data query - fetch last week's runs
  const { data: chartData } = useQuery({
    queryKey: ['runs-chart'],
    queryFn: () => getRuns({
      limit: 350,
      started_after: lastWeekDate.toISOString(),
    }),
    refetchInterval: 60000, // Refresh every minute
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Table data query
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['runs', filters],
    queryFn: () => getRuns(filters),
    refetchInterval: (filters.status === 'running' || filters.status === 'stalled') ? 5000 : 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const handleFilterChange = (key: keyof RunsFilter, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1, // Reset to first page on filter change
    }));
  };

  const clearFilters = () => {
    setFilters({ page: 1, limit: 20 });
  };

  const hasActiveFilters = filters.run_type || filters.status || filters.feed;

  const columns = [
    {
      key: 'runId',
      header: 'Run ID',
      render: (run: RunWithStats) => (
        <span className="font-mono text-sm">{truncateId(run.runId, 12)}</span>
      ),
    },
    {
      key: 'feed',
      header: 'Feed',
      render: (run: RunWithStats) => (
        <Badge variant={run.feed === 'demo' ? 'info' : 'neutral'}>
          {run.feed}
        </Badge>
      ),
    },
    {
      key: 'runType',
      header: 'Type',
      render: (run: RunWithStats) => <RunTypeBadge type={run.runType} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (run: RunWithStats) => <StatusBadge status={run.status} />,
    },
    {
      key: 'workers',
      header: 'Workers',
      render: (run: RunWithStats) => (
        <div className="w-40 sm:w-32">
          <WorkerProgress
            completed={run.completedWorkers}
            failed={run.failedWorkers}
            total={run.expectedWorkers}
          />
        </div>
      ),
    },
    {
      key: 'records',
      header: 'Records',
      render: (run: RunWithStats) => formatNumber(run.totalRecordsProcessed),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (run: RunWithStats) =>
        run.status === 'running'
          ? formatLiveDuration(run.startedAt)
          : formatDuration(run.durationMs),
    },
    {
      key: 'startedAt',
      header: 'Started',
      render: (run: RunWithStats) => formatDateShort(run.startedAt),
    },
  ];

  if (error) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Failed to load runs">
            Unable to fetch run data. Please try again later.
          </Alert>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header onRefresh={refetch} isRefreshing={isFetching} />
      <PageContainer>
        {/* Pipeline Activity Chart */}
        {chartData && chartData.data.length > 0 && (
          <RunsChart runs={chartData.data} />
        )}

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant={showFilters ? 'primary' : 'secondary'}
                size="sm"
                icon={<Filter className="w-4 h-4" />}
                onClick={() => setShowFilters(!showFilters)}
              >
                Filters
              </Button>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<X className="w-4 h-4" />}
                  onClick={clearFilters}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-stone-500">
              {data?.pagination.total ?? 0} total runs
            </p>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Select
                label="Feed"
                value={filters.feed || ''}
                onChange={(e) => handleFilterChange('feed', e.target.value)}
                options={[
                  { value: '', label: 'All Feeds' },
                  { value: 'nivoda-natural', label: 'Nivoda Natural' },
                  { value: 'nivoda-labgrown', label: 'Nivoda Labgrown' },
                  { value: 'demo', label: 'Demo' },
                ]}
              />
              <Select
                label="Run Type"
                value={filters.run_type || ''}
                onChange={(e) => handleFilterChange('run_type', e.target.value)}
                options={[
                  { value: '', label: 'All Types' },
                  { value: 'full', label: 'Full' },
                  { value: 'incremental', label: 'Incremental' },
                ]}
              />
              <Select
                label="Status"
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'running', label: 'Running' },
                  { value: 'stalled', label: 'Stalled' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'partial', label: 'Partial' },
                ]}
              />
            </div>
          )}
        </Card>

        {/* Table */}
        <Card className="p-0 overflow-hidden">
          {isLoading ? (
            <PageLoader />
          ) : (
            <>
              <Table
                columns={columns}
                data={data?.data ?? []}
                keyExtractor={(run) => run.runId}
                onRowClick={(run) => navigate(`/runs/${run.runId}`)}
                emptyMessage="No runs found"
              />
              {data && data.pagination.totalPages > 1 && (
                <Pagination
                  page={data.pagination.page}
                  totalPages={data.pagination.totalPages}
                  total={data.pagination.total}
                  limit={data.pagination.limit}
                  onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
                />
              )}
            </>
          )}
        </Card>
      </PageContainer>
    </>
  );
}
