import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Diamond,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  PlayCircle,
  ArrowRight,
  AlertTriangle,
  Pencil,
  Bookmark,
  Server,
} from 'lucide-react';
import {
  getDashboardData,
  updateWatermark,
  type RunWithStats,
  type RecentFailedWorker,
  type Watermark,
} from '../api/analytics';
import { getSystemConfig } from '../api/system';
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
  Modal,
  useToast,
} from '../components/ui';
import {
  formatNumber,
  formatRelativeTime,
  formatDuration,
  formatLiveDuration,
  truncateId,
} from '../utils/formatters';

const FEEDS = ['nivoda-natural', 'nivoda-labgrown', 'demo'] as const;
type Feed = typeof FEEDS[number];

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [editWatermark, setEditWatermark] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed>('nivoda-natural');
  const [watermarkDate, setWatermarkDate] = useState('');

  // Single combined query replaces 5 separate API calls
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['dashboard-data'],
    queryFn: getDashboardData,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  // Derive individual pieces from the combined response
  const summary = dashboardData?.summary;
  const recentRuns = dashboardData?.runs;
  const failedWorkers = dashboardData?.failedWorkers;
  const watermarks = useMemo<Record<Feed, Watermark | null | undefined>>(() => ({
    nivoda: dashboardData?.watermarks?.nivoda ?? null,
    demo: dashboardData?.watermarks?.demo ?? null,
  }), [dashboardData?.watermarks]);

  const {
    data: systemConfig,
  } = useQuery({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
    refetchOnMount: true,
    staleTime: Infinity, // Config rarely changes
  });

  const updateWatermarkMutation = useMutation({
    mutationFn: ({ wm, feed }: { wm: Watermark; feed: Feed }) => updateWatermark(wm, feed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      setEditWatermark(false);
      addToast({ variant: 'success', title: 'Watermark updated' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to update watermark',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const handleRefresh = () => {
    refetchDashboard();
  };

  const [watermarkRunId, setWatermarkRunId] = useState('');
  const [watermarkCompletedAt, setWatermarkCompletedAt] = useState('');

  const openWatermarkEdit = (feed: Feed) => {
    const wm = watermarks[feed];
    setEditingFeed(feed);
    if (wm?.lastUpdatedAt) {
      const d = new Date(wm.lastUpdatedAt);
      setWatermarkDate(d.toISOString().slice(0, 16));
    } else {
      setWatermarkDate('');
    }
    setWatermarkRunId(wm?.lastRunId ?? '');
    if (wm?.lastRunCompletedAt) {
      const d = new Date(wm.lastRunCompletedAt);
      setWatermarkCompletedAt(d.toISOString().slice(0, 16));
    } else {
      setWatermarkCompletedAt('');
    }
    setEditWatermark(true);
  };

  const saveWatermark = () => {
    if (!watermarkDate) return;
    const iso = new Date(watermarkDate).toISOString();
    updateWatermarkMutation.mutate({
      wm: {
        lastUpdatedAt: iso,
        lastRunId: watermarkRunId || undefined,
        lastRunCompletedAt: watermarkCompletedAt
          ? new Date(watermarkCompletedAt).toISOString()
          : undefined,
      },
      feed: editingFeed,
    });
  };

  if (dashboardLoading) {
    return <PageLoader />;
  }

  if (dashboardError) {
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

  // Use nivoda watermark for the "Last Sync" stat card
  const primaryWatermark = watermarks.nivoda;

  return (
    <>
      <Header onRefresh={handleRefresh} />
      <PageContainer>
        {/* Watermarks */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
              <Bookmark className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Watermarks (Azure Blob)
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Controls when incremental runs start from, per feed
              </p>
            </div>
          </div>
          {FEEDS.map((feed) => {
            const wm = watermarks[feed];
            const wmDisplay = wm?.lastUpdatedAt
              ? new Date(wm.lastUpdatedAt).toLocaleString()
              : 'Not set';
            return (
              <Card key={feed}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 capitalize">
                    {feed}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openWatermarkEdit(feed)} icon={<Pencil className="w-3.5 h-3.5" />}>
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">Last Updated At</p>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {wmDisplay}
                    </p>
                  </div>
                  <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">Last Run ID</p>
                    <p className="text-sm font-mono text-stone-900 dark:text-stone-100">
                      {wm?.lastRunId ? truncateId(wm.lastRunId, 12) : 'Not set'}
                    </p>
                  </div>
                  <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">Last Run Completed At</p>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {wm?.lastRunCompletedAt
                        ? new Date(wm.lastRunCompletedAt).toLocaleString()
                        : 'Not set'}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Nivoda Configuration */}
        {systemConfig && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                <Server className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  Nivoda API Configuration
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Backend API endpoint and proxy routing status
                </p>
              </div>
            </div>
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-lg">
                  <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">API Endpoint</p>
                  <p className="text-sm font-mono text-stone-900 dark:text-stone-100 break-all">
                    {systemConfig.nivoda.endpoint}
                  </p>
                </div>
                <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-lg">
                  <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">Proxy Status</p>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {systemConfig.nivoda.proxyEnabled ? (
                      <span className="text-success-600 dark:text-success-400">✓ Enabled</span>
                    ) : (
                      <span className="text-stone-500 dark:text-stone-400">Direct</span>
                    )}
                  </p>
                </div>
                {systemConfig.nivoda.proxyEnabled && systemConfig.nivoda.proxyUrl && (
                  <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-lg">
                    <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">Proxy URL</p>
                    <p className="text-sm font-mono text-stone-900 dark:text-stone-100 break-all">
                      {systemConfig.nivoda.proxyUrl}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Diamonds"
            value={formatNumber(summary?.totalActiveDiamonds ?? 0)}
            icon={<Diamond className="w-5 h-5" />}
          />
          <StatCard
            title="Feeds"
            value={formatNumber(summary?.totalFeeds ?? 0)}
            icon={<Building2 className="w-5 h-5" />}
          />
          <StatCard
            title="Last Sync"
            value={
              primaryWatermark?.lastRunCompletedAt
                ? formatRelativeTime(primaryWatermark.lastRunCompletedAt)
                : primaryWatermark?.lastUpdatedAt
                ? formatRelativeTime(primaryWatermark.lastUpdatedAt)
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

        {/* Failed Workers Alert */}
        {failedWorkers && failedWorkers.length > 0 && (
          <div className="mb-8 bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 rounded-xl p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-error-600 dark:text-error-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-error-800 dark:text-error-400">
                  {failedWorkers.length} Failed Worker{failedWorkers.length !== 1 ? 's' : ''}
                </h3>
                <p className="text-xs text-error-600 dark:text-error-500 mt-0.5">
                  Recent worker failures that may need attention. Click a run to retry or force-consolidate.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {failedWorkers.slice(0, 5).map((fw: RecentFailedWorker) => (
                <div
                  key={fw.id}
                  onClick={() => navigate(`/runs/${fw.runId}`)}
                  className="flex items-start sm:items-center justify-between p-3 bg-white dark:bg-stone-800 rounded-lg border border-error-100 dark:border-error-500/20 hover:border-error-300 dark:hover:border-error-500/40 cursor-pointer transition-colors gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5 text-error-500 flex-shrink-0" />
                      <span className="font-mono text-xs text-stone-700 dark:text-stone-300">
                        {truncateId(fw.runId, 8)}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded">
                        {fw.partitionId}
                      </span>
                    </div>
                    {fw.errorMessage && (
                      <p className="text-xs text-error-600 dark:text-error-500 mt-1 truncate max-w-md">
                        {fw.errorMessage}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-stone-500 dark:text-stone-400 flex-shrink-0">
                    {formatRelativeTime(fw.completedAt || fw.startedAt)}
                  </span>
                </div>
              ))}
              {failedWorkers.length > 5 && (
                <button
                  onClick={() => navigate('/runs?status=failed')}
                  className="w-full text-center text-xs text-error-600 dark:text-error-400 hover:text-error-800 dark:hover:text-error-300 py-2 transition-colors"
                >
                  View all {failedWorkers.length} failures
                </button>
              )}
            </div>
          </div>
        )}

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
              {!recentRuns ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-stone-100 dark:bg-stone-700 rounded-lg" />
                  ))}
                </div>
              ) : recentRuns.length === 0 ? (
                <div className="text-center py-8 text-stone-500 dark:text-stone-400">No runs yet</div>
              ) : (
                <div className="space-y-3">
                  {recentRuns.map((run: RunWithStats) => (
                    <div
                      key={run.runId}
                      onClick={() => navigate(`/runs/${run.runId}`)}
                      className="flex items-start sm:items-center justify-between p-3 sm:p-4 bg-stone-50 dark:bg-stone-700/50 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer transition-colors gap-3"
                    >
                      <div className="flex items-start sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                        <div
                          className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${
                            run.status === 'completed'
                              ? 'bg-success-100 text-success-600 dark:bg-success-500/20 dark:text-success-500'
                              : run.status === 'failed'
                              ? 'bg-error-100 text-error-600 dark:bg-error-500/20 dark:text-error-500'
                              : run.status === 'running'
                              ? 'bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-500'
                              : 'bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-500'
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
                            <span className="font-mono text-xs sm:text-sm text-stone-700 dark:text-stone-300 break-all">
                              {truncateId(run.runId, 8)}
                            </span>
                            <RunTypeBadge type={run.runType} />
                            <StatusBadge status={run.status} />
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                            {formatRelativeTime(run.startedAt)}
                            <span className="hidden sm:inline"> &bull; {formatNumber(run.totalRecordsProcessed)} records</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300">
                          {run.status === 'running'
                            ? formatLiveDuration(run.startedAt)
                            : formatDuration(run.durationMs)
                          }
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
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
                <div className="text-center p-3 bg-success-50 dark:bg-success-500/10 rounded-lg">
                  <p className="text-2xl font-semibold text-success-700 dark:text-success-500">
                    {summary?.recentRunsCount.completed ?? 0}
                  </p>
                  <p className="text-xs text-success-600 dark:text-success-500">Completed</p>
                </div>
                <div className="text-center p-3 bg-error-50 dark:bg-error-500/10 rounded-lg">
                  <p className="text-2xl font-semibold text-error-700 dark:text-error-500">
                    {summary?.recentRunsCount.failed ?? 0}
                  </p>
                  <p className="text-xs text-error-600 dark:text-error-500">Failed</p>
                </div>
                <div className="text-center p-3 bg-info-50 dark:bg-info-500/10 rounded-lg">
                  <p className="text-2xl font-semibold text-info-700 dark:text-info-500">
                    {summary?.recentRunsCount.running ?? 0}
                  </p>
                  <p className="text-xs text-info-600 dark:text-info-500">Running</p>
                </div>
                <div className="text-center p-3 bg-stone-100 dark:bg-stone-700 rounded-lg">
                  <p className="text-2xl font-semibold text-stone-700 dark:text-stone-200">
                    {summary?.recentRunsCount.total ?? 0}
                  </p>
                  <p className="text-xs text-stone-600 dark:text-stone-400">Total</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Watermark Edit Modal */}
        <Modal
          isOpen={editWatermark}
          onClose={() => setEditWatermark(false)}
          title={`Edit Watermark — ${editingFeed}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditWatermark(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={saveWatermark}
                loading={updateWatermarkMutation.isPending}
                disabled={!watermarkDate}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Edit the watermark stored in Azure Blob Storage. The{' '}
              <code className="bg-stone-100 dark:bg-stone-700 px-1 rounded">lastUpdatedAt</code> field
              controls when incremental runs start from.
            </p>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Last Updated At
              </label>
              <input
                type="datetime-local"
                className="input"
                value={watermarkDate}
                onChange={(e) => setWatermarkDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Last Run ID (optional)
              </label>
              <input
                type="text"
                className="input font-mono"
                value={watermarkRunId}
                onChange={(e) => setWatermarkRunId(e.target.value)}
                placeholder="UUID of the last run"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Last Run Completed At (optional)
              </label>
              <input
                type="datetime-local"
                className="input"
                value={watermarkCompletedAt}
                onChange={(e) => setWatermarkCompletedAt(e.target.value)}
              />
            </div>
            {updateWatermarkMutation.isError && (
              <Alert variant="error" title="Failed to update watermark">
                {(updateWatermarkMutation.error as Error).message}
              </Alert>
            )}
          </div>
        </Modal>
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
        <span className="text-stone-600 dark:text-stone-400">{label}</span>
        <span className="text-stone-900 dark:text-stone-100 font-medium">{formatNumber(count)}</span>
      </div>
      <div className="w-full h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
