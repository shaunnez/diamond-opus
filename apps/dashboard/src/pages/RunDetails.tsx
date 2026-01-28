import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  PlayCircle,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { getRunDetails, type WorkerRun } from '../api/analytics';
import { triggerConsolidate, retryWorkers } from '../api/triggers';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  StatusBadge,
  RunTypeBadge,
  WorkerProgress,
  PageLoader,
  Alert,
  ConfirmModal,
  Table,
} from '../components/ui';
import {
  formatDate,
  formatDuration,
  formatNumber,
  truncateId,
} from '../utils/formatters';
import { useState } from 'react';

export function RunDetails() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [forceConsolidate, setForceConsolidate] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['run-details', runId],
    queryFn: () => getRunDetails(runId!),
    enabled: !!runId,
    refetchInterval: (query) =>
      query.state.data?.run?.status === 'running' ? 5000 : false,
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

  const { run, workers } = data;
  const hasFailedWorkers = run.failedWorkers > 0;
  const canConsolidate =
    run.status !== 'running' && run.completedWorkers > 0;
  const canRetry = hasFailedWorkers;

  const getWorkerProgress = (worker: WorkerRun): number | null => {
    if (!worker.workItemPayload || typeof worker.workItemPayload.totalRecords !== 'number') {
      return null;
    }
    const totalRecords = worker.workItemPayload.totalRecords as number;
    if (totalRecords === 0) return 100;
    return Math.min(100, (worker.recordsProcessed / totalRecords) * 100);
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
            <span className="text-xs text-stone-600 font-medium min-w-[3ch] text-right">
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
        const totalRecords = w.workItemPayload?.totalRecords as number | undefined;
        if (totalRecords) {
          return (
            <span className="text-xs">
              {formatNumber(w.recordsProcessed)} / {formatNumber(totalRecords)}
            </span>
          );
        }
        return formatNumber(w.recordsProcessed);
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
                <h2 className="text-lg sm:text-xl font-semibold text-stone-900 font-mono break-all">
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
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mt-6 pt-6 border-t border-stone-200">
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Duration</p>
              <p className="text-base sm:text-lg font-semibold text-stone-900">
                {formatDuration(run.durationMs)}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Records</p>
              <p className="text-base sm:text-lg font-semibold text-stone-900">
                {formatNumber(run.totalRecordsProcessed)}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-stone-500">Expected</p>
              <p className="text-base sm:text-lg font-semibold text-stone-900">
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
                  run.failedWorkers > 0 ? 'text-error-600' : 'text-stone-900'
                }`}
              >
                {run.failedWorkers}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <WorkerProgress
              completed={run.completedWorkers}
              failed={run.failedWorkers}
              total={run.expectedWorkers}
            />
          </div>
        </Card>

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
          <CardHeader title="Worker Details" subtitle={`${workers.length} workers`} />
          <div className="mt-4">
            <Table
              columns={workerColumns}
              data={workers}
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
            {workers.map((worker) => (
              <div
                key={worker.id}
                title={`${worker.partitionId}: ${worker.status}${
                  worker.errorMessage ? ` - ${worker.errorMessage}` : ''
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
        <ConfirmModal
          isOpen={showConsolidateModal}
          onClose={() => {
            setShowConsolidateModal(false);
            setForceConsolidate(false);
          }}
          onConfirm={() => consolidateMutation.mutate()}
          title="Trigger Consolidation"
          message={
            hasFailedWorkers
              ? 'This run has failed workers. Do you want to force consolidation with only the completed data?'
              : 'This will process all raw diamonds from this run and update the canonical diamonds table.'
          }
          confirmText="Consolidate"
          loading={consolidateMutation.isPending}
        />

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
      </PageContainer>
    </>
  );
}
