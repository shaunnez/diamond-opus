import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { getErrorLogs, getErrorLogServices, type ErrorLogsFilter, type ErrorLog } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  Button,
  Select,
  Table,
  Pagination,
  Badge,
  PageLoader,
  Alert,
} from '../components/ui';
import { formatDateShort } from '../utils/formatters';

function ServiceBadge({ service }: { service: string }) {
  const variantMap: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
    consolidator: 'error',
    worker: 'warning',
    scheduler: 'info',
    api: 'neutral',
  };
  return <Badge variant={variantMap[service] || 'neutral'}>{service}</Badge>;
}

export function ErrorLogs() {
  const [filters, setFilters] = useState<ErrorLogsFilter>({
    page: 1,
    limit: 50,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['error-logs', filters],
    queryFn: () => getErrorLogs(filters),
    refetchInterval: 30000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: services } = useQuery({
    queryKey: ['error-log-services'],
    queryFn: () => getErrorLogServices(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const handleFilterChange = (key: keyof ErrorLogsFilter, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1,
    }));
  };

  const clearFilters = () => {
    setFilters({ page: 1, limit: 50 });
  };

  const hasActiveFilters = !!filters.service;

  const columns = [
    {
      key: 'createdAt',
      header: 'Time',
      render: (log: ErrorLog) => (
        <span className="text-sm whitespace-nowrap">{formatDateShort(log.createdAt)}</span>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      render: (log: ErrorLog) => <ServiceBadge service={log.service} />,
    },
    {
      key: 'errorMessage',
      header: 'Error',
      render: (log: ErrorLog) => (
        <div className="max-w-xl">
          <p className="text-sm text-stone-900 font-mono break-all line-clamp-2">{log.errorMessage}</p>
          {log.context && Object.keys(log.context).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(log.context).map(([key, value]) => (
                <span key={key} className="text-xs text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                  {key}: {String(value).slice(0, 30)}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Failed to load error logs">
            Unable to fetch error logs. Please try again later.
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
              {data?.pagination.total ?? 0} total errors
            </p>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Select
                label="Service"
                value={filters.service || ''}
                onChange={(e) => handleFilterChange('service', e.target.value)}
                options={[
                  { value: '', label: 'All Services' },
                  ...(services ?? ['scheduler', 'worker', 'consolidator', 'api']).map((s) => ({
                    value: s,
                    label: s.charAt(0).toUpperCase() + s.slice(1),
                  })),
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
                keyExtractor={(log) => log.id}
                onRowClick={(log) =>
                  setExpandedRow(expandedRow === log.id ? null : log.id)
                }
                emptyMessage="No error logs found"
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

        {/* Expanded detail */}
        {expandedRow && data?.data && (
          (() => {
            const log = data.data.find((l) => l.id === expandedRow);
            if (!log) return null;
            return (
              <Card className="mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">Error Details</h3>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedRow(null)}>
                      Close
                    </Button>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 mb-1">Service</p>
                    <ServiceBadge service={log.service} />
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 mb-1">Error Message</p>
                    <p className="text-sm font-mono bg-stone-50 p-3 rounded-lg break-all">{log.errorMessage}</p>
                  </div>
                  {log.stackTrace && (
                    <div>
                      <p className="text-xs text-stone-500 mb-1">Stack Trace</p>
                      <pre className="text-xs font-mono bg-stone-50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                        {log.stackTrace}
                      </pre>
                    </div>
                  )}
                  {log.context && Object.keys(log.context).length > 0 && (
                    <div>
                      <p className="text-xs text-stone-500 mb-1">Context</p>
                      <pre className="text-xs font-mono bg-stone-50 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(log.context, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-stone-500 mb-1">Timestamp</p>
                    <p className="text-sm">{formatDateShort(log.createdAt)}</p>
                  </div>
                </div>
              </Card>
            );
          })()
        )}
      </PageContainer>
    </>
  );
}
