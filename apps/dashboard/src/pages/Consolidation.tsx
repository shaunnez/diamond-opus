import { useQuery } from '@tanstack/react-query';
import { Layers, Database, Clock, CheckCircle } from 'lucide-react';
import { getConsolidationStats, getRuns } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  StatCard,
  ProgressRing,
  PageLoader,
  Alert,
  Badge,
  StatusBadge,
} from '../components/ui';
import { formatNumber, formatRelativeTime, truncateId } from '../utils/formatters';

export function Consolidation() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
    isFetching: statsFetching,
  } = useQuery({
    queryKey: ['consolidation-stats'],
    queryFn: getConsolidationStats,
    refetchInterval: 10000,
  });

  const { data: recentRuns } = useQuery({
    queryKey: ['consolidation-runs'],
    queryFn: () => getRuns({ limit: 10 }),
    refetchInterval: 30000,
  });

  if (statsLoading) {
    return <PageLoader />;
  }

  if (statsError) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Failed to load consolidation data">
            Unable to fetch consolidation statistics. Please try again later.
          </Alert>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header onRefresh={refetchStats} isRefreshing={statsFetching} />
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Progress Ring */}
          <Card className="flex flex-col items-center justify-center py-8">
            <ProgressRing
              value={stats?.progressPercent ?? 0}
              size={160}
              strokeWidth={12}
              variant={
                stats?.progressPercent === 100
                  ? 'success'
                  : stats?.progressPercent ?? 0 > 80
                  ? 'primary'
                  : 'warning'
              }
            />
            <p className="text-lg font-semibold text-stone-900 mt-4">
              Consolidation Progress
            </p>
            <p className="text-sm text-stone-500">
              {formatNumber(stats?.totalConsolidated ?? 0)} of{' '}
              {formatNumber(stats?.totalRaw ?? 0)} raw diamonds
            </p>
          </Card>

          {/* Stats Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatCard
              title="Total Raw Diamonds"
              value={formatNumber(stats?.totalRaw ?? 0)}
              subtitle="In raw_diamonds_nivoda table"
              icon={<Database className="w-5 h-5" />}
            />
            <StatCard
              title="Consolidated"
              value={formatNumber(stats?.totalConsolidated ?? 0)}
              subtitle="Processed to diamonds table"
              icon={<CheckCircle className="w-5 h-5" />}
            />
            <StatCard
              title="Pending"
              value={formatNumber(stats?.totalPending ?? 0)}
              subtitle="Awaiting consolidation"
              icon={<Clock className="w-5 h-5" />}
            />
            <StatCard
              title="Progress"
              value={`${stats?.progressPercent ?? 0}%`}
              subtitle="Overall completion"
              icon={<Layers className="w-5 h-5" />}
            />
          </div>
        </div>

        {/* Recent Runs that may need consolidation */}
        <Card className="mt-6">
          <CardHeader
            title="Recent Runs"
            subtitle="Runs that may need consolidation attention"
          />
          <div className="mt-4 space-y-3">
            {recentRuns?.data
              .filter(
                (run) =>
                  run.status === 'completed' ||
                  run.status === 'failed' ||
                  run.status === 'partial'
              )
              .slice(0, 5)
              .map((run) => (
                <div
                  key={run.runId}
                  className="flex items-center justify-between p-4 bg-stone-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        run.status === 'completed'
                          ? 'bg-success-100 text-success-600'
                          : run.status === 'failed'
                          ? 'bg-error-100 text-error-600'
                          : 'bg-warning-100 text-warning-600'
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-stone-700">
                          {truncateId(run.runId)}
                        </span>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {formatNumber(run.totalRecordsProcessed)} records &bull;{' '}
                        {formatRelativeTime(run.startedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-stone-600">
                      {run.completedWorkers}/{run.expectedWorkers} workers
                    </p>
                    {run.failedWorkers > 0 && (
                      <Badge variant="error" className="mt-1">
                        {run.failedWorkers} failed
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            {(!recentRuns?.data ||
              recentRuns.data.filter(
                (r) =>
                  r.status === 'completed' ||
                  r.status === 'failed' ||
                  r.status === 'partial'
              ).length === 0) && (
              <div className="text-center py-8 text-stone-500">
                No recent runs to display
              </div>
            )}
          </div>
        </Card>

        {/* Info Card */}
        <Alert variant="info" className="mt-6">
          <strong>How Consolidation Works:</strong>
          <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
            <li>
              Raw diamonds are fetched by workers and stored in{' '}
              <code className="bg-info-100 px-1 rounded">raw_diamonds_nivoda</code>
            </li>
            <li>
              The consolidator maps raw data to the canonical{' '}
              <code className="bg-info-100 px-1 rounded">diamonds</code> table
            </li>
            <li>Pricing rules are applied during consolidation</li>
            <li>
              After successful consolidation, the watermark is advanced to prevent
              re-processing
            </li>
            <li>
              If workers fail, consolidation is skipped unless forced (to preserve
              data integrity)
            </li>
          </ul>
        </Alert>
      </PageContainer>
    </>
  );
}
