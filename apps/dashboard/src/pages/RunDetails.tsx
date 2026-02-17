import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  PlayCircle,
  RefreshCw,
  Layers,
  Ban,
  Trash2,
} from 'lucide-react';
import { getRunDetails, type WorkerRun } from '../api/analytics';
import { triggerConsolidate, retryWorkers, cancelRun, deleteRun } from '../api/triggers';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  StatusBadge,
  RunTypeBadge,
  WorkerProgress,
  RecordProgress,
  PageLoader,
  Alert,
  ConfirmModal,
  Modal,
  Table,
  useToast,
} from '../components/ui';
import {
  formatDate,
  formatDuration,
  formatLiveDuration,
  formatNumber,
  truncateId,
} from '../utils/formatters';
import { useState, useMemo } from 'react';

export function RunDetails() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { addToast } = useToast();
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [forceConsolidate, setForceConsolidate] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['run-details', runId],
    queryFn: () => getRunDetails(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return (status === 'running' || status === 'stalled') ? 5000 : false;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const consolidateMutation = useMutation({
    mutationFn: () => triggerConsolidate(runId!, forceConsolidate),
    onSuccess: () => {
      setShowConsolidateModal(false);
      queryClient.invalidateQueries({ queryKey: ['run-details', runId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryWorkers(runId!),
    onSuccess: () => {
      setShowRetryModal(false);
      queryClient.invalidateQueries({ queryKey: ['run-details', runId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(runId!, 'Cancelled from dashboard'),
    onSuccess: () => {
      setShowCancelModal(false);
      queryClient.invalidateQueries({ queryKey: ['run-details', runId] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRun(runId!),
    onSuccess: (result) => {
      setShowDeleteModal(false);
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      addToast({
        variant: 'success',
        title: 'Run deleted',
        message: `Deleted ${result.deleted_workers} worker(s) and ${result.deleted_partitions} partition(s)`,
      });
      navigate('/runs');
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to delete run',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  

  const { run, workers } = data;
  const hasFailedWorkers = run.failedWorkers > 0;
  // Can consolidate if the run hasn't been fully consolidated yet (watermark not advanced)
  // and has at least some completed workers
  const canConsolidate = !run.watermarkAfter && run.completedWorkers > 0;
  const canRetry = hasFailedWorkers;
  const isStalled = run.status === 'stalled';
  const canCancel = run.status === 'running' || isStalled;
  const canDelete = run.status === 'failed';

  // Sort workers numerically by partition ID (memoized to avoid re-sorting on every render)
  const sortedWorkers = useMemo(
    () => [...workers].sort((a, b) => parseInt(a.partitionId, 10) - parseInt(b.partitionId, 10)),
    [workers]
  );

  // Calculate heatmap estimate (memoized — only changes when workers change)
  const heatmapEstimate = useMemo(
    () => workers.reduce((sum, worker) => {
      const estimate = (worker.workItemPayload?.estimatedRecords ?? worker.workItemPayload?.totalRecords) as number | undefined;
      return sum + (estimate || 0);
    }, 0),
    [workers]
  );
  const isRunFinished = run.status === 'completed' || run.status === 'failed' ; //|| run.status === 'partial';

  // Calculate live duration for running jobs
  const displayDuration = run.status === 'running'
    ? formatLiveDuration(run.startedAt)
    : formatDuration(run.durationMs);

  // Calculate estimated time remaining for running jobs
  const getEstimatedTimeRemaining = (): string | null => {
    if (run.status !== 'running' || heatmapEstimate === 0 || run.totalRecordsProcessed === 0) {
      return null;
    }

    const elapsedMs = Date.now() - new Date(run.startedAt).getTime();
    const elapsedSeconds = elapsedMs / 1000;
    const processingRate = run.totalRecordsProcessed / elapsedSeconds; // records per second
    const remainingRecords = Math.max(0, heatmapEstimate - run.totalRecordsProcessed);

    if (processingRate === 0 || remainingRecords === 0) {
      return null;
    }

    const estimatedSecondsRemaining = remainingRecords / processingRate;
    const estimatedMs = estimatedSecondsRemaining * 1000;

    return formatDuration(estimatedMs);
  };

  const estimatedTimeRemaining = getEstimatedTimeRemaining();

  const getWorkerProgress = (worker: WorkerRun): number | null => {
    // Completed workers are 100% by definition (they processed all available data)
    if (worker.status === 'completed') return 100;

    const estimate = (worker.workItemPayload?.estimatedRecords ?? worker.workItemPayload?.totalRecords) as number | undefined;
    if (!estimate || estimate === 0) return null;

    // Use max(estimate, actual) as denominator to prevent >100%
    const denominator = Math.max(estimate, worker.recordsProcessed);
    return Math.min(100, (worker.recordsProcessed / denominator) * 100);
  };

  const workerColumns = [
    {
      key: 'partitionId',
      header: 'Partition',
      render: (w: WorkerRun) => (
        <span className="font-mono text-xs">{w.partitionId}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (w: WorkerRun) => <StatusBadge status={w.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (w: WorkerRun) => {
        const progress = getWorkerProgress(w);
        if (progress === null) return '-';

        const isRunning = w.status === 'running';
        const isCompleted = w.status === 'completed';

        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isCompleted
                    ? 'bg-success-500'
                    : isRunning
                    ? 'bg-info-500 animate-pulse'
                    : 'bg-error-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-stone-600 dark:text-stone-300 font-medium min-w-[3ch] text-right">
              {Math.round(progress)}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'recordsProcessed',
      header: 'Records',
      render: (w: WorkerRun) => {
        const estimate = (w.workItemPayload?.estimatedRecords ?? w.workItemPayload?.totalRecords) as number | undefined;
        // Completed workers: show actual count only (estimate is irrelevant)
        if (w.status === 'completed' || !estimate) {
          return formatNumber(w.recordsProcessed);
        }
        // Running/failed: show actual / ~estimate
        return (
          <span className="text-xs">
            {formatNumber(w.recordsProcessed)} / ~{formatNumber(estimate)}
          </span>
        );
      },
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (w: WorkerRun) => {
        if (!w.completedAt) return '-';
        const duration =
          new Date(w.completedAt).getTime() - new Date(w.startedAt).getTime();
        return formatDuration(duration);
      },
    },
    {
      key: 'errorMessage',
      header: 'Error',
      render: (w: WorkerRun) =>
        w.errorMessage ? (
          <span className="text-error-600 text-xs max-w-xs truncate block">
            {w.errorMessage}
          </span>
        ) : (
          '-'
        ),
      className: 'max-w-xs',
    },
  ];

  if (isLoading) {
    return <PageLoader />;
  }

  if (error || !data?.run) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Run not found">
            The requested run could not be found.
          </Alert>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/runs')}>
            Back to Runs
          </Button>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header onRefresh={refetch} isRefreshing={isFetching} />
      <PageContainer>
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-6"
          icon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => navigate('/runs')}
        >
          Back to Runs
        </Button>

        {/* Run Summary */}
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h2 className="text-lg sm:text-xl font-semibold text-stone-900 dark:text-stone-100 font-mono break-all">
                  {truncateId(run.runId, 12)}
                </h2>
                <RunTypeBadge type={run.runType} />
                <StatusBadge status={run.status} />
              </div>
              <p className="text-xs sm:text-sm text-stone-500">
                Started {formatDate(run.startedAt)}
                {run.completedAt && (
                  <span className="hidden sm:inline"> | Completed {formatDate(run.completedAt)}</span>
                )}
              </p>
              {run.completedAt && (
                <p className="text-xs sm:text-sm text-stone-500 sm:hidden">
                  Completed {formatDate(run.completedAt)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canCancel && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Ban className="w-4 h-4" />}
                  onClick={() => setShowCancelModal(true)}
                >
                  <span className="hidden sm:inline">Cancel Run</span>
                  <span className="sm:hidden">Cancel</span>
                </Button>
              )}
              {canRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={() => setShowRetryModal(true)}
                >
                  <span className="hidden sm:inline">Retry Failed</span>
                  <span className="sm:hidden">Retry</span>
                </Button>
              )}
              {canConsolidate && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Layers className="w-4 h-4" />}
                  onClick={() => setShowConsolidateModal(true)}
                >
                  Consolidate
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={() => setShowDeleteModal(true)}
                >
                  <span className="hidden sm:inline">Delete Run</span>
                  <span className="sm:hidden">Delete</span>
                </Button>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mt-6 pt-6 border-t border-stone-200">
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Duration</p>
              <p className="text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100">
                {displayDuration}
              </p>
              {estimatedTimeRemaining && (
                <p className="text-xs text-stone-500 mt-0.5">
                  ~{estimatedTimeRemaining} remaining
                </p>
              )}
            </div>
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Records</p>
              <p className="text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100">
                {isRunFinished || heatmapEstimate === 0
                  ? formatNumber(run.totalRecordsProcessed)
                  : `${formatNumber(run.totalRecordsProcessed)} / ~${formatNumber(heatmapEstimate)}`
                }
              </p>
              {!isRunFinished && heatmapEstimate > 0 && (
                <p className="text-xs text-stone-500 mt-0.5">
                  {Math.round(Math.min(100, (run.totalRecordsProcessed / Math.max(heatmapEstimate, run.totalRecordsProcessed)) * 100))}% complete
                </p>
              )}
            </div>
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Expected</p>
              <p className="text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100">
                {run.expectedWorkers}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Completed</p>
              <p className="text-base sm:text-lg font-semibold text-success-600">
                {run.completedWorkers}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Failed</p>
              <p
                className={`text-base sm:text-lg font-semibold ${
                  run.failedWorkers > 0 ? 'text-error-600 dark:text-error-400' : 'text-stone-900 dark:text-stone-100'
                }`}
              >
                {run.failedWorkers}
              </p>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="mt-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-stone-700 dark:text-stone-300 mb-2">Worker Progress</p>
              <WorkerProgress
                completed={run.completedWorkers}
                failed={run.failedWorkers}
                total={run.expectedWorkers}
              />
            </div>
            {heatmapEstimate > 0 && !isRunFinished && (
              <div>
                <p className="text-xs font-medium text-stone-700 dark:text-stone-300 mb-2">Record Progress</p>
                <RecordProgress
                  processed={run.totalRecordsProcessed}
                  total={Math.max(heatmapEstimate, run.totalRecordsProcessed)}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Alert for stalled run */}
        {isStalled && (
          <Alert variant="error" title="Run appears stalled" className="mb-6">
            No worker activity detected for over 30 minutes. Workers may have died
            or Service Bus messages expired. You can cancel this run to mark it as
            failed, then optionally consolidate the data that was collected.
          </Alert>
        )}

        {/* Alert for failures */}
        {hasFailedWorkers && (
          <Alert variant="warning" title="Some workers failed" className="mb-6">
            {run.failedWorkers} worker(s) failed during this run. You can retry them
            using the button above, or trigger consolidation with the force option to
            process completed data only.
          </Alert>
        )}

        {/* Workers Table */}
        <Card>
          <CardHeader title="Worker Details" subtitle={`${sortedWorkers.length} workers`} />
          <div className="mt-4">
            <Table
              columns={workerColumns}
              data={sortedWorkers}
              keyExtractor={(w) => String(w.id)}
              emptyMessage="No workers for this run"
            />
          </div>
        </Card>

        {/* Worker Grid Visual */}
        <Card className="mt-6">
          <CardHeader
            title="Worker Status Grid"
            subtitle="Visual overview of all workers"
          />
          <div className="mt-4 grid grid-cols-8 sm:grid-cols-12 md:grid-cols-15 lg:grid-cols-20 gap-1">
            {sortedWorkers.map((worker) => (
              <div
                key={worker.id}
                title={`Partition ${worker.partitionId}\nStatus: ${worker.status}${
                  worker.errorMessage ? `\nError: ${worker.errorMessage}` : ''
                }`}
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center cursor-help ${
                  worker.status === 'completed'
                    ? 'bg-success-100 text-success-600'
                    : worker.status === 'failed'
                    ? 'bg-error-100 text-error-600'
                    : 'bg-info-100 text-info-600 animate-pulse'
                }`}
              >
                {worker.status === 'completed' ? (
                  <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                ) : worker.status === 'failed' ? (
                  <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                ) : (
                  <PlayCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-stone-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 sm:w-4 sm:h-4 bg-success-100 rounded" /> Completed
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 sm:w-4 sm:h-4 bg-error-100 rounded" /> Failed
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 sm:w-4 sm:h-4 bg-info-100 rounded" /> Running
            </div>
          </div>
        </Card>

        {/* Consolidate Modal */}
        <Modal
          isOpen={showConsolidateModal}
          onClose={() => {
            setShowConsolidateModal(false);
            setForceConsolidate(false);
          }}
          title="Trigger Consolidation"
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowConsolidateModal(false);
                  setForceConsolidate(false);
                }}
                disabled={consolidateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => consolidateMutation.mutate()}
                loading={consolidateMutation.isPending}
              >
                Consolidate
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-stone-600 dark:text-stone-400">
              {hasFailedWorkers
                ? 'This run has failed workers. You can force consolidation to process only the completed data.'
                : 'This will process all raw diamonds from this run and update the canonical diamonds table.'
              }
            </p>

            {hasFailedWorkers && (
              <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceConsolidate}
                    onChange={(e) => setForceConsolidate(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-primary-600 border-stone-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      Force consolidation
                    </span>
                    <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
                      Process completed workers even though some workers failed. Failed partitions will be skipped.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {hasFailedWorkers && !forceConsolidate && (
              <Alert variant="warning" title="Warning">
                Consolidation will fail without force option when workers have failed.
              </Alert>
            )}
          </div>
        </Modal>

        {/* Retry Modal */}
        <ConfirmModal
          isOpen={showRetryModal}
          onClose={() => setShowRetryModal(false)}
          onConfirm={() => retryMutation.mutate()}
          title="Retry Failed Workers"
          message={`This will re-queue ${run.failedWorkers} failed worker(s) for processing. They will be picked up by available workers.`}
          confirmText="Retry"
          loading={retryMutation.isPending}
        />

        {/* Cancel Run Modal */}
        <ConfirmModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirm={() => cancelMutation.mutate()}
          title="Cancel Run"
          message={`This will mark all ${run.expectedWorkers - run.completedWorkers - run.failedWorkers} incomplete worker(s) as failed and end the run. Completed workers' data will be preserved. You can consolidate the collected data afterwards.`}
          confirmText="Cancel Run"
          loading={cancelMutation.isPending}
        />

        {/* Delete Run Modal */}
        <ConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => deleteMutation.mutate()}
          title="Delete Failed Run"
          message={`This will permanently delete this failed run and all its ${workers.length} worker record(s) and partition data. Raw diamonds are preserved. This action cannot be undone.`}
          confirmText="Delete Run"
          loading={deleteMutation.isPending}
        />
      </PageContainer>
    </>
  );
}
