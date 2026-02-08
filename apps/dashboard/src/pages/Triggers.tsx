import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Play, RefreshCw, Layers, CheckCircle, Zap, Terminal, Copy, Database } from 'lucide-react';
import { getRuns } from '../api/analytics';
import { triggerScheduler, triggerConsolidate, retryWorkers, getFailedWorkers, triggerDemoSeed, SchedulerTriggerError } from '../api/triggers';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Select,
  Alert,
  Checkbox,
  Badge,
  ConfirmModal,
  useToast,
} from '../components/ui';
import { truncateId, formatRelativeTime } from '../utils/formatters';

export function Triggers() {
  const { addToast } = useToast();

  // Scheduler state
  const [schedulerRunType, setSchedulerRunType] = useState<'full' | 'incremental'>('incremental');
  const [schedulerFeed, setSchedulerFeed] = useState<string>('nivoda');
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);

  // Consolidation state
  const [selectedRunForConsolidate, setSelectedRunForConsolidate] = useState('');
  const [forceConsolidate, setForceConsolidate] = useState(false);
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);

  // Demo seed state
  const [seedMode, setSeedMode] = useState<'full' | 'incremental'>('full');
  const [seedCount, setSeedCount] = useState('');
  const [showSeedModal, setShowSeedModal] = useState(false);

  // Retry state
  const [selectedRunForRetry, setSelectedRunForRetry] = useState('');
  const [showRetryModal, setShowRetryModal] = useState(false);

  // Fetch recent runs for dropdowns
  const { data: runsData } = useQuery({
    queryKey: ['runs-for-triggers'],
    queryFn: () => getRuns({ limit: 20 }),
  });

  // Fetch failed workers for selected retry run
  const { data: failedWorkersData } = useQuery({
    queryKey: ['failed-workers', selectedRunForRetry],
    queryFn: () => getFailedWorkers(selectedRunForRetry),
    enabled: !!selectedRunForRetry,
  });

  // Mutations
  const schedulerMutation = useMutation({
    mutationFn: () => triggerScheduler(schedulerRunType, schedulerFeed),
    onSuccess: () => {
      setShowSchedulerModal(false);
      addToast({ variant: 'success', title: `${schedulerRunType === 'full' ? 'Full' : 'Incremental'} run triggered for ${schedulerFeed}` });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to trigger scheduler',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const consolidateMutation = useMutation({
    mutationFn: () => triggerConsolidate(selectedRunForConsolidate, forceConsolidate),
    onSuccess: () => {
      setShowConsolidateModal(false);
      setSelectedRunForConsolidate('');
      setForceConsolidate(false);
      addToast({ variant: 'success', title: 'Consolidation triggered' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to trigger consolidation',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryWorkers(selectedRunForRetry),
    onSuccess: () => {
      setShowRetryModal(false);
      setSelectedRunForRetry('');
      addToast({ variant: 'success', title: 'Failed workers retried' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to retry workers',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => triggerDemoSeed(seedMode, seedCount ? parseInt(seedCount, 10) : undefined),
    onSuccess: (data) => {
      setShowSeedModal(false);
      addToast({
        variant: 'success',
        title: `Demo seed completed: ${data.inserted.toLocaleString()} diamonds ${seedMode === 'full' ? 'generated' : 'appended'}`,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to seed demo feed',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  // Get runs that can be consolidated (haven't been fully consolidated yet)
  // A run can be consolidated if it has completed workers and hasn't advanced the watermark yet
  const consolidatableRuns = runsData?.data.filter(
    (r) => !r.watermarkAfter && r.completedWorkers > 0
  ) ?? [];

  // Get runs that have failed workers
  const retryableRuns = runsData?.data.filter((r) => r.failedWorkers > 0) ?? [];

  const selectedConsolidateRun = consolidatableRuns.find(
    (r) => r.runId === selectedRunForConsolidate
  );

  return (
    <>
      <Header />
      <PageContainer>
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Info Banner */}
          <Alert variant="info" title="Manual Triggers">
            Use these controls to manually trigger pipeline operations. Normal operations
            run automatically, but these can be useful for testing, recovery, or forcing
            specific actions.
          </Alert>

          {/* Scheduler Trigger */}
          <Card>
            <CardHeader
              title="Trigger Scheduler"
              subtitle="Start a new pipeline run to fetch diamonds from a feed source"
            />
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary-50 rounded-xl">
                  <Play className="w-6 h-6 text-primary-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    The scheduler will partition the workload and queue work items for
                    workers to process.
                  </p>
                  <ul className="mt-2 text-sm text-stone-500 list-disc list-inside">
                    <li>
                      <strong>Incremental:</strong> Only fetch diamonds updated since the
                      last watermark
                    </li>
                    <li>
                      <strong>Full:</strong> Fetch all diamonds (takes longer, use
                      sparingly)
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <Select
                    label="Feed"
                    value={schedulerFeed}
                    onChange={(e) => setSchedulerFeed(e.target.value)}
                    options={[
                      { value: 'nivoda', label: 'Nivoda' },
                      { value: 'demo', label: 'Demo Feed' },
                    ]}
                  />
                </div>
                <div className="flex-1 max-w-xs">
                  <Select
                    label="Run Type"
                    value={schedulerRunType}
                    onChange={(e) =>
                      setSchedulerRunType(e.target.value as 'full' | 'incremental')
                    }
                    options={[
                      { value: 'incremental', label: 'Incremental (recommended)' },
                      { value: 'full', label: 'Full Scan' },
                    ]}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => setShowSchedulerModal(true)}
                  icon={<Zap className="w-4 h-4" />}
                >
                  Start Run
                </Button>
              </div>

              {schedulerRunType === 'full' && (
                <Alert variant="warning">
                  A full scan will fetch all diamonds and may take significantly longer
                  than an incremental run. Only use this if you need to rebuild the
                  entire dataset.
                </Alert>
              )}

              {schedulerMutation.error && (
                <div className="space-y-3">
                  <Alert variant="error" title="Failed to trigger scheduler">
                    {schedulerMutation.error instanceof SchedulerTriggerError
                      ? schedulerMutation.error.message
                      : schedulerMutation.error instanceof Error
                      ? schedulerMutation.error.message
                      : 'An unknown error occurred'}
                  </Alert>
                  {schedulerMutation.error instanceof SchedulerTriggerError && (
                    <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-600">
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                        <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                          Run manually instead:
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-stone-800 text-stone-100 rounded text-sm font-mono">
                          {schedulerMutation.error.manualCommand}
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(schedulerMutation.error instanceof SchedulerTriggerError ? schedulerMutation.error.manualCommand : '')}
                          className="p-2 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300 transition-colors"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {schedulerMutation.error.help && (
                        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                          {schedulerMutation.error.help}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Seed Demo Feed */}
          <Card>
            <CardHeader
              title="Seed Demo Feed"
              subtitle="Generate test diamond data for the demo feed"
            />
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-violet-50 rounded-xl">
                  <Database className="w-6 h-6 text-violet-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Populate the demo_feed_inventory table with deterministic test diamonds
                    using a seeded PRNG. Data is reproducible across runs.
                  </p>
                  <ul className="mt-2 text-sm text-stone-500 list-disc list-inside">
                    <li>
                      <strong>Full:</strong> Truncates existing data and generates fresh
                      (default: 100,000 diamonds)
                    </li>
                    <li>
                      <strong>Incremental:</strong> Appends new diamonds to existing data
                      (default: 5,000 diamonds)
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <Select
                    label="Mode"
                    value={seedMode}
                    onChange={(e) => setSeedMode(e.target.value as 'full' | 'incremental')}
                    options={[
                      { value: 'full', label: 'Full (truncate + insert)' },
                      { value: 'incremental', label: 'Incremental (append)' },
                    ]}
                  />
                </div>
                <div className="flex-1 max-w-xs">
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Count (optional)
                  </label>
                  <input
                    type="number"
                    value={seedCount}
                    onChange={(e) => setSeedCount(e.target.value)}
                    placeholder={seedMode === 'full' ? '100000' : '5000'}
                    min="1"
                    max="500000"
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => setShowSeedModal(true)}
                  icon={<Database className="w-4 h-4" />}
                  disabled={seedMutation.isPending}
                >
                  Seed Data
                </Button>
              </div>

              {seedMode === 'full' && (
                <Alert variant="warning">
                  Full mode will truncate all existing demo feed inventory data before
                  generating new records.
                </Alert>
              )}
            </div>
          </Card>

          {/* Consolidation Trigger */}
          <Card>
            <CardHeader
              title="Trigger Consolidation"
              subtitle="Process raw diamonds from a completed run"
            />
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-success-50 rounded-xl">
                  <Layers className="w-6 h-6 text-success-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Consolidation processes raw diamonds and updates the canonical
                    diamonds table with pricing rules applied.
                  </p>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Select
                    label="Select Run"
                    value={selectedRunForConsolidate}
                    onChange={(e) => setSelectedRunForConsolidate(e.target.value)}
                    options={[
                      { value: '', label: 'Select a run...' },
                      ...consolidatableRuns.map((r) => ({
                        value: r.runId,
                        label: `${truncateId(r.runId)} - ${r.runType} - ${formatRelativeTime(
                          r.startedAt
                        )}${r.failedWorkers > 0 ? ` (${r.failedWorkers} failed)` : ''}`,
                      })),
                    ]}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => setShowConsolidateModal(true)}
                  disabled={!selectedRunForConsolidate}
                  icon={<Layers className="w-4 h-4" />}
                >
                  Consolidate
                </Button>
              </div>

              {selectedConsolidateRun?.failedWorkers ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    label="Force consolidation (ignore failed workers)"
                    checked={forceConsolidate}
                    onChange={(e) => setForceConsolidate(e.target.checked)}
                  />
                  <Badge variant="warning">
                    {selectedConsolidateRun.failedWorkers} failed workers
                  </Badge>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Retry Workers */}
          <Card>
            <CardHeader
              title="Retry Failed Workers"
              subtitle="Re-queue failed workers for reprocessing"
            />
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-warning-50 rounded-xl">
                  <RefreshCw className="w-6 h-6 text-warning-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Failed workers can be retried using their stored work item payload.
                    They will be re-queued and picked up by available workers.
                  </p>
                </div>
              </div>

              {retryableRuns.length === 0 ? (
                <Alert variant="success" title="No failed workers">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    All recent runs completed successfully without failures.
                  </div>
                </Alert>
              ) : (
                <>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <Select
                        label="Select Run with Failures"
                        value={selectedRunForRetry}
                        onChange={(e) => setSelectedRunForRetry(e.target.value)}
                        options={[
                          { value: '', label: 'Select a run...' },
                          ...retryableRuns.map((r) => ({
                            value: r.runId,
                            label: `${truncateId(r.runId)} - ${r.failedWorkers} failed - ${formatRelativeTime(
                              r.startedAt
                            )}`,
                          })),
                        ]}
                      />
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => setShowRetryModal(true)}
                      disabled={!selectedRunForRetry}
                      icon={<RefreshCw className="w-4 h-4" />}
                    >
                      Retry All
                    </Button>
                  </div>

                  {failedWorkersData && failedWorkersData.workers.length > 0 && (
                    <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
                      <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                        Failed Workers ({failedWorkersData.total_failed}):
                      </p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {failedWorkersData.workers.map((w) => (
                          <div
                            key={w.partition_id}
                            className="text-xs p-2 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-600"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono">{w.partition_id}</span>
                              <Badge variant={w.has_payload ? 'success' : 'error'}>
                                {w.has_payload ? 'Can retry' : 'No payload'}
                              </Badge>
                            </div>
                            {w.error_message && (
                              <p className="text-error-600 mt-1 truncate">
                                {w.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* CLI Commands Reference */}
          <Card>
            <CardHeader
              title="CLI Commands"
              subtitle="Alternative commands for terminal use"
            />
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Seed Demo Feed:</p>
                <code className="block p-2 bg-stone-800 text-stone-100 rounded text-sm font-mono">
                  npm run seed -w @diamond/demo-feed-seed -- [full|incremental]
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Run Scheduler:</p>
                <code className="block p-2 bg-stone-800 text-stone-100 rounded text-sm font-mono">
                  npm run dev:scheduler
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Trigger Consolidation:
                </p>
                <code className="block p-2 bg-stone-800 text-stone-100 rounded text-sm font-mono">
                  npm run consolidator:trigger -- {'<runId>'} [--force]
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Retry Failed Workers:
                </p>
                <code className="block p-2 bg-stone-800 text-stone-100 rounded text-sm font-mono">
                  npm run worker:retry -- retry {'<runId>'} [partitionId]
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  List Failed Workers:
                </p>
                <code className="block p-2 bg-stone-800 text-stone-100 rounded text-sm font-mono">
                  npm run worker:retry -- list {'<runId>'}
                </code>
              </div>
            </div>
          </Card>
        </div>

        {/* Modals */}
        <ConfirmModal
          isOpen={showSeedModal}
          onClose={() => setShowSeedModal(false)}
          onConfirm={() => seedMutation.mutate()}
          title={`Seed Demo Feed — ${seedMode === 'full' ? 'Full' : 'Incremental'}`}
          message={
            seedMode === 'full'
              ? `This will truncate all existing demo feed data and generate ${seedCount ? parseInt(seedCount, 10).toLocaleString() : '100,000'} new diamonds. This may take a moment.`
              : `This will append ${seedCount ? parseInt(seedCount, 10).toLocaleString() : '5,000'} new diamonds to the existing demo feed data.`
          }
          confirmText="Seed Data"
          loading={seedMutation.isPending}
          variant={seedMode === 'full' ? 'danger' : 'primary'}
        />

        <ConfirmModal
          isOpen={showSchedulerModal}
          onClose={() => setShowSchedulerModal(false)}
          onConfirm={() => schedulerMutation.mutate()}
          title={`Start ${schedulerRunType === 'full' ? 'Full' : 'Incremental'} Run — ${schedulerFeed}`}
          message={
            schedulerRunType === 'full'
              ? `This will trigger a full scan of all diamonds from the ${schedulerFeed} feed. This operation may take a long time.`
              : `This will trigger an incremental sync for the ${schedulerFeed} feed to fetch diamonds updated since the last run.`
          }
          confirmText="Start Run"
          loading={schedulerMutation.isPending}
          variant={schedulerRunType === 'full' ? 'danger' : 'primary'}
        />

        <ConfirmModal
          isOpen={showConsolidateModal}
          onClose={() => setShowConsolidateModal(false)}
          onConfirm={() => consolidateMutation.mutate()}
          title="Trigger Consolidation"
          message={
            forceConsolidate
              ? 'This will force consolidation, ignoring any failed workers. Only completed data will be processed.'
              : 'This will process all raw diamonds from this run and update the canonical diamonds table.'
          }
          confirmText="Consolidate"
          loading={consolidateMutation.isPending}
        />

        <ConfirmModal
          isOpen={showRetryModal}
          onClose={() => setShowRetryModal(false)}
          onConfirm={() => retryMutation.mutate()}
          title="Retry Failed Workers"
          message={`This will re-queue ${failedWorkersData?.total_failed ?? 0} failed worker(s) for processing.`}
          confirmText="Retry All"
          loading={retryMutation.isPending}
        />
      </PageContainer>
    </>
  );
}
