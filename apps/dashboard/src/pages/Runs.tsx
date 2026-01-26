import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Filter, X } from 'lucide-react';
import { getRuns, type RunsFilter } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
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
import {
  formatDateShort,
  formatDuration,
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

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['runs', filters],
    queryFn: () => getRuns(filters),
    refetchInterval: filters.status === 'running' ? 5000 : 30000,
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

  const hasActiveFilters = filters.run_type || filters.status;

  const columns = [
    {
      key: 'runId',
      header: 'Run ID',
      render: (run: (typeof data)['data'][0]) => (
        <span className="font-mono text-sm">{truncateId(run.runId, 12)}</span>
      ),
    },
    {
      key: 'runType',
      header: 'Type',
      render: (run: (typeof data)['data'][0]) => <RunTypeBadge type={run.runType} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (run: (typeof data)['data'][0]) => <StatusBadge status={run.status} />,
    },
    {
      key: 'workers',
      header: 'Workers',
      render: (run: (typeof data)['data'][0]) => (
        <div className="w-32">
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
      render: (run: (typeof data)['data'][0]) => formatNumber(run.totalRecordsProcessed),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (run: (typeof data)['data'][0]) => formatDuration(run.durationMs),
    },
    {
      key: 'startedAt',
      header: 'Started',
      render: (run: (typeof data)['data'][0]) => formatDateShort(run.startedAt),
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
        {/* Filters */}
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
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
            <p className="text-sm text-stone-500">
              {data?.pagination.total ?? 0} total runs
            </p>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-stone-200 grid grid-cols-1 md:grid-cols-3 gap-4">
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
