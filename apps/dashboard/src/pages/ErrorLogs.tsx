import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Filter, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getErrorLogs, getErrorLogServices, clearErrorLogs, type ErrorLogsFilter, type ErrorLog } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  Button,
  Select,
  Input,
  Table,
  Pagination,
  Badge,
  PageLoader,
  Alert,
  ConfirmModal,
  useToast,
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

function ContextJsonView({ context }: { context: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(context);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {entries.length} field{entries.length !== 1 ? 's' : ''}
      </button>
      {expanded ? (
        <pre className="mt-1 text-xs font-mono bg-stone-100 dark:bg-stone-800 p-2 rounded overflow-x-auto max-h-48">
          {JSON.stringify(context, null, 2)}
        </pre>
      ) : (
        <div className="flex flex-wrap gap-1 mt-1">
          {entries.slice(0, 4).map(([key, value]) => (
            <span key={key} className="text-xs text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
              {key}: {String(value).slice(0, 30)}
            </span>
          ))}
          {entries.length > 4 && (
            <span className="text-xs text-stone-400">+{entries.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorLogs() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [filters, setFilters] = useState<ErrorLogsFilter>({
    page: 1,
    limit: 50,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['error-logs', filters],
    queryFn: () => getErrorLogs(filters),
    refetchInterval: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const { data: services } = useQuery({
    queryKey: ['error-log-services'],
    queryFn: () => getErrorLogServices(),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const clearMutation = useMutation({
    mutationFn: () => clearErrorLogs(filters.service),
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: ['error-logs'] });
      queryClient.invalidateQueries({ queryKey: ['error-log-services'] });
      setShowClearModal(false);
      addToast({
        variant: 'success',
        title: 'Error logs cleared',
        message: `${deleted} log${deleted !== 1 ? 's' : ''} deleted`,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to clear error logs',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
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

  const hasActiveFilters = !!(filters.service || filters.runId || filters.from || filters.to);

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
          <p className="text-sm text-stone-900 dark:text-stone-100 font-mono break-all line-clamp-2">{log.errorMessage}</p>
          {log.context && Object.keys(log.context).length > 0 && (
            <ContextJsonView context={log.context} />
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
            <div className="flex items-center gap-3">
              <p className="text-xs sm:text-sm text-stone-500">
                {data?.pagination.total ?? 0} total errors
              </p>
              {(data?.pagination.total ?? 0) > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={() => setShowClearModal(true)}
                >
                  {filters.service ? `Clear ${filters.service}` : 'Clear All'}
                </Button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <Input
                label="Run ID"
                placeholder="Filter by runId..."
                value={filters.runId || ''}
                onChange={(e) => handleFilterChange('runId', e.target.value)}
              />
              <Input
                label="From"
                type="datetime-local"
                value={filters.from ? filters.from.slice(0, 16) : ''}
                onChange={(e) =>
                  handleFilterChange('from', e.target.value ? new Date(e.target.value).toISOString() : undefined)
                }
              />
              <Input
                label="To"
                type="datetime-local"
                value={filters.to ? filters.to.slice(0, 16) : ''}
                onChange={(e) =>
                  handleFilterChange('to', e.target.value ? new Date(e.target.value).toISOString() : undefined)
                }
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
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Error Details</h3>
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
                    <p className="text-sm font-mono bg-stone-50 dark:bg-stone-800 p-3 rounded-lg break-all">{log.errorMessage}</p>
                  </div>
                  {log.stackTrace && (
                    <div>
                      <p className="text-xs text-stone-500 mb-1">Stack Trace</p>
                      <pre className="text-xs font-mono bg-stone-50 dark:bg-stone-800 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                        {log.stackTrace}
                      </pre>
                    </div>
                  )}
                  {log.context && Object.keys(log.context).length > 0 && (
                    <div>
                      <p className="text-xs text-stone-500 mb-1">Context</p>
                      <pre className="text-xs font-mono bg-stone-50 dark:bg-stone-800 p-3 rounded-lg overflow-x-auto">
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

        {/* Clear Confirmation Modal */}
        <ConfirmModal
          isOpen={showClearModal}
          onClose={() => setShowClearModal(false)}
          onConfirm={() => clearMutation.mutate()}
          title="Clear Error Logs"
          message={
            filters.service
              ? `Are you sure you want to delete all "${filters.service}" error logs? This cannot be undone.`
              : 'Are you sure you want to delete all error logs? This cannot be undone.'
          }
          confirmText="Clear Logs"
          variant="danger"
          loading={clearMutation.isPending}
        />
      </PageContainer>
    </>
  );
}
