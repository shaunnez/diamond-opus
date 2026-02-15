import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  XCircle,
  Play,
} from 'lucide-react';
import {
  getConsolidationStats,
  getConsolidationStatus,
  type RunConsolidationStatus,
  type AnalyticsFeed,
} from '../api/analytics';
import { resumeConsolidation } from '../api/triggers';
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
  Button,
  ConfirmModal,
} from '../components/ui';
import {
  formatNumber,
  formatRelativeTime,
  truncateId,
} from '../utils/formatters';

type ConsolidationOutcome = 'success' | 'partial' | 'running' | 'not_started' | 'failed';

function getConsolidationOutcome(run: RunConsolidationStatus): ConsolidationOutcome {
  if (!run.consolidationStartedAt) {
    return 'not_started';
  }
  if (!run.consolidationCompletedAt) {
    return 'running';
  }
  if (run.consolidationErrors > 0) {
    if (run.consolidationProcessed === 0 && run.consolidationTotal > 0) {
      return 'failed';
    }
    return 'partial';
  }
  return 'success';
}

function getOutcomeBadge(outcome: ConsolidationOutcome) {
  switch (outcome) {
    case 'success':
      return <Badge variant="success">Completed</Badge>;
    case 'partial':
      return <Badge variant="warning">Partial</Badge>;
    case 'running':
      return <Badge variant="info">Running</Badge>;
    case 'failed':
      return <Badge variant="error">Failed</Badge>;
    case 'not_started':
      return <Badge variant="neutral">Not Started</Badge>;
  }
}

function canResume(run: RunConsolidationStatus): boolean {
  if (!run.liveProgress) return false;
  const { pendingCount, failedCount } = run.liveProgress;
  return pendingCount > 0 || failedCount > 0;
}

const FEED_OPTIONS: { value: AnalyticsFeed; label: string }[] = [
  { value: 'nivoda', label: 'Nivoda' },
  { value: 'demo', label: 'Demo' },
];

export function Consolidation() {
  const queryClient = useQueryClient();
  const [resumeRunId, setResumeRunId] = useState<string | null>(null);
  const [feed, setFeed] = useState<AnalyticsFeed>('nivoda');

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
    isFetching: statsFetching,
  } = useQuery({
    queryKey: ['consolidation-stats', feed],
    queryFn: () => getConsolidationStats(feed),
    refetchInterval: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const {
    data: runStatuses,
    isLoading: statusLoading,
  } = useQuery({
    queryKey: ['consolidation-status', feed],
    queryFn: () => getConsolidationStatus(10, feed),
    refetchInterval: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const resumeMutation = useMutation({
    mutationFn: (runId: string) => resumeConsolidation(runId),
    onSuccess: () => {
      setResumeRunId(null);
      queryClient.invalidateQueries({ queryKey: ['consolidation-stats'] });
      queryClient.invalidateQueries({ queryKey: ['consolidation-status'] });
    },
  });

  if (statsLoading || statusLoading) {
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

  const resumeTarget = runStatuses?.find((r) => r.runId === resumeRunId);

  return (
    <>
      <Header onRefresh={refetchStats} isRefreshing={statsFetching} />
      <PageContainer>
        {/* Feed Selector */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium text-stone-600 dark:text-stone-400">Feed:</label>
          <div className="flex rounded-lg border border-stone-300 dark:border-stone-600 overflow-hidden">
            {FEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFeed(opt.value)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  feed === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

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
                  : (stats?.progressPercent ?? 0) > 80
                  ? 'primary'
                  : 'warning'
              }
            />
            <p className="text-lg font-semibold text-stone-900 dark:text-stone-100 mt-4">
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
              subtitle={`In raw_diamonds_${feed} table`}
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

        {/* Per-Run Consolidation Status */}
        <Card className="mt-6">
          <CardHeader
            title="Consolidation Status by Run"
            subtitle="Shows consolidation outcome per run with resume capability"
          />
          <div className="mt-4 space-y-3">
            {runStatuses && runStatuses.length > 0 ? (
              runStatuses.map((run) => {
                const outcome = getConsolidationOutcome(run);
                const progress = run.liveProgress;
                const resumable = canResume(run);
                const progressPercent = progress?.progressPercent ?? 0;

                return (
                  <div
                    key={run.runId}
                    className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            outcome === 'success'
                              ? 'bg-success-100 text-success-600'
                              : outcome === 'partial'
                              ? 'bg-warning-100 text-warning-600'
                              : outcome === 'failed'
                              ? 'bg-error-100 text-error-600'
                              : outcome === 'running'
                              ? 'bg-info-100 text-info-600'
                              : 'bg-stone-200 text-stone-500'
                          }`}
                        >
                          {outcome === 'success' ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : outcome === 'partial' ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : outcome === 'failed' ? (
                            <XCircle className="w-4 h-4" />
                          ) : outcome === 'running' ? (
                            <Play className="w-4 h-4" />
                          ) : (
                            <Clock className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm text-stone-700 dark:text-stone-300">
                              {truncateId(run.runId)}
                            </span>
                            <Badge variant={run.runType === 'full' ? 'info' : 'neutral'}>
                              {run.runType}
                            </Badge>
                            {getOutcomeBadge(outcome)}
                          </div>
                          <p className="text-xs text-stone-500 mt-1">
                            Started {formatRelativeTime(run.startedAt)}
                            {' | '}
                            {run.completedWorkers}/{run.expectedWorkers} workers
                            {run.failedWorkers > 0 && (
                              <span className="text-error-600 font-medium">
                                {' '}({run.failedWorkers} failed)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {resumable && outcome !== 'running' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<RotateCcw className="w-3.5 h-3.5" />}
                          onClick={() => setResumeRunId(run.runId)}
                        >
                          Resume
                        </Button>
                      )}
                    </div>

                    {progress && progress.totalRawDiamonds > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                progressPercent === 100
                                  ? 'bg-success-500'
                                  : outcome === 'running'
                                  ? 'bg-info-500 animate-pulse'
                                  : progressPercent > 0
                                  ? 'bg-warning-500'
                                  : 'bg-stone-300'
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-stone-700 dark:text-stone-300 min-w-[4ch] text-right">
                            {progressPercent}%
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-500">
                          <span>
                            {formatNumber(progress.consolidatedCount)} consolidated
                          </span>
                          {progress.pendingCount > 0 && (
                            <span>
                              {formatNumber(progress.pendingCount)} pending
                            </span>
                          )}
                          {progress.failedCount > 0 && (
                            <span className="text-error-600">
                              {formatNumber(progress.failedCount)} failed
                            </span>
                          )}
                          {run.consolidationErrors > 0 && (
                            <span className="text-error-600">
                              {formatNumber(run.consolidationErrors)} errors during consolidation
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {(!progress || progress.totalRawDiamonds === 0) && (
                      <p className="mt-2 text-xs text-stone-400">
                        No raw diamonds found for this run
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
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
              <code className="bg-info-100 dark:bg-info-900/30 px-1 rounded">raw_diamonds_{feed}</code>
            </li>
            <li>
              The consolidator maps raw data to the canonical{' '}
              <code className="bg-info-100 dark:bg-info-900/30 px-1 rounded">diamonds</code> table
            </li>
            <li>Pricing rules are applied during consolidation</li>
            <li>
              After consolidation, the watermark is advanced to prevent re-processing
            </li>
            <li>
              If consolidation completes partially, use the <strong>Resume</strong> button
              to retry failed diamonds
            </li>
          </ul>
        </Alert>

        {/* Resume Confirmation Modal */}
        <ConfirmModal
          isOpen={!!resumeRunId}
          onClose={() => {
            setResumeRunId(null);
            resumeMutation.reset();
          }}
          onConfirm={() => {
            if (resumeRunId) {
              resumeMutation.mutate(resumeRunId);
            }
          }}
          title="Resume Consolidation"
          message={
            resumeTarget
              ? `This will reset ${formatNumber(
                  (resumeTarget.liveProgress?.failedCount ?? 0) +
                  (resumeTarget.liveProgress?.pendingCount ?? 0)
                )} failed/pending diamonds back to pending and re-trigger consolidation for run ${truncateId(
                  resumeTarget.runId
                )}.`
              : 'Resume consolidation for this run?'
          }
          confirmText="Resume"
          loading={resumeMutation.isPending}
        />

        {resumeMutation.isError && (
          <Alert variant="error" className="mt-4" title="Resume failed">
            {resumeMutation.error instanceof Error
              ? resumeMutation.error.message
              : 'An error occurred while resuming consolidation.'}
          </Alert>
        )}

        {resumeMutation.isSuccess && (
          <Alert variant="success" className="mt-4" title="Resume triggered">
            Consolidation has been re-triggered. The consolidator will process the
            remaining diamonds. Check back in a few minutes for updated progress.
          </Alert>
        )}
      </PageContainer>
    </>
  );
}
