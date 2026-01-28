import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Diamond,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  PlayCircle,
  ArrowRight,
} from 'lucide-react';
import { getDashboardSummary, getRuns, type RunWithStats } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  StatCard,
  StatusBadge,
  RunTypeBadge,
  Button,
  PageLoader,
  Alert,
} from '../components/ui';
import {
  formatNumber,
  formatRelativeTime,
  formatDuration,
  truncateId,
} from '../utils/formatters';

export function Dashboard() {
  const navigate = useNavigate();

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 30000,
  });

  const {
    data: recentRuns,
    isLoading: runsLoading,
    refetch: refetchRuns,
  } = useQuery({
    queryKey: ['recent-runs'],
    queryFn: () => getRuns({ limit: 5 }),
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchRuns();
  };

  if (summaryLoading) {
    return <PageLoader />;
  }

  if (summaryError) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Failed to load dashboard">
            Unable to fetch dashboard data. Please try again later.
          </Alert>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header onRefresh={handleRefresh} />
      <PageContainer>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Diamonds"
            value={formatNumber(summary?.totalActiveDiamonds ?? 0)}
            icon={<Diamond className="w-5 h-5" />}
          />
          <StatCard
            title="Suppliers"
            value={formatNumber(summary?.totalSuppliers ?? 0)}
            icon={<Building2 className="w-5 h-5" />}
          />
          <StatCard
            title="Last Sync"
            value={
              summary?.lastSuccessfulRun
                ? formatRelativeTime(summary.lastSuccessfulRun.completedAt)
                : 'Never'
            }
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            title="Runs (7 days)"
            value={formatNumber(summary?.recentRunsCount.total ?? 0)}
            subtitle={
              summary?.recentRunsCount.failed
                ? `${summary.recentRunsCount.failed} failed`
                : 'All successful'
            }
            icon={<CheckCircle className="w-5 h-5" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Runs */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader
                title="Recent Runs"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/runs')}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    View All
                  </Button>
                }
              />
              {runsLoading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-stone-100 rounded-lg" />
                  ))}
                </div>
              ) : recentRuns?.data.length === 0 ? (
                <div className="text-center py-8 text-stone-500">No runs yet</div>
              ) : (
                <div className="space-y-3">
                  {recentRuns?.data.map((run: RunWithStats) => (
                    <div
                      key={run.runId}
                      onClick={() => navigate(`/runs/${run.runId}`)}
                      className="flex items-start sm:items-center justify-between p-3 sm:p-4 bg-stone-50 rounded-lg hover:bg-stone-100 cursor-pointer transition-colors gap-3"
                    >
                      <div className="flex items-start sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                        <div
                          className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${
                            run.status === 'completed'
                              ? 'bg-success-100 text-success-600'
                              : run.status === 'failed'
                              ? 'bg-error-100 text-error-600'
                              : run.status === 'running'
                              ? 'bg-info-100 text-info-600'
                              : 'bg-warning-100 text-warning-600'
                          }`}
                        >
                          {run.status === 'completed' ? (
                            <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                          ) : run.status === 'failed' ? (
                            <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                          ) : (
                            <PlayCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="font-mono text-xs sm:text-sm text-stone-700 break-all">
                              {truncateId(run.runId, 8)}
                            </span>
                            <RunTypeBadge type={run.runType} />
                            <StatusBadge status={run.status} />
                          </div>
                          <p className="text-xs text-stone-500 mt-1">
                            {formatRelativeTime(run.startedAt)}
                            <span className="hidden sm:inline"> &bull; {formatNumber(run.totalRecordsProcessed)} records</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs sm:text-sm text-stone-600">
                          {formatDuration(run.durationMs)}
                        </p>
                        <p className="text-xs text-stone-500">
                          {run.completedWorkers}/{run.expectedWorkers}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Availability Breakdown */}
          <div>
            <Card>
              <CardHeader title="Diamond Availability" />
              <div className="space-y-4">
                <AvailabilityRow
                  label="Available"
                  count={summary?.diamondsByAvailability.available ?? 0}
                  total={summary?.totalActiveDiamonds ?? 0}
                  color="bg-success-500"
                />
                <AvailabilityRow
                  label="On Hold"
                  count={summary?.diamondsByAvailability.onHold ?? 0}
                  total={summary?.totalActiveDiamonds ?? 0}
                  color="bg-warning-500"
                />
                <AvailabilityRow
                  label="Sold"
                  count={summary?.diamondsByAvailability.sold ?? 0}
                  total={summary?.totalActiveDiamonds ?? 0}
                  color="bg-stone-400"
                />
                <AvailabilityRow
                  label="Unavailable"
                  count={summary?.diamondsByAvailability.unavailable ?? 0}
                  total={summary?.totalActiveDiamonds ?? 0}
                  color="bg-error-400"
                />
              </div>
            </Card>

            {/* Run Stats */}
            <Card className="mt-6">
              <CardHeader title="Run Summary (7 days)" />
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-success-50 rounded-lg">
                  <p className="text-2xl font-semibold text-success-700">
                    {summary?.recentRunsCount.completed ?? 0}
                  </p>
                  <p className="text-xs text-success-600">Completed</p>
                </div>
                <div className="text-center p-3 bg-error-50 rounded-lg">
                  <p className="text-2xl font-semibold text-error-700">
                    {summary?.recentRunsCount.failed ?? 0}
                  </p>
                  <p className="text-xs text-error-600">Failed</p>
                </div>
                <div className="text-center p-3 bg-info-50 rounded-lg">
                  <p className="text-2xl font-semibold text-info-700">
                    {summary?.recentRunsCount.running ?? 0}
                  </p>
                  <p className="text-xs text-info-600">Running</p>
                </div>
                <div className="text-center p-3 bg-stone-100 rounded-lg">
                  <p className="text-2xl font-semibold text-stone-700">
                    {summary?.recentRunsCount.total ?? 0}
                  </p>
                  <p className="text-xs text-stone-600">Total</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function AvailabilityRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-stone-600">{label}</span>
        <span className="text-stone-900 font-medium">{formatNumber(count)}</span>
      </div>
      <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
