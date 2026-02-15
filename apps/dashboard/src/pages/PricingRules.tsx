import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, DollarSign, Star, RefreshCw, RotateCcw } from 'lucide-react';
import {
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  triggerReapplyPricing,
  getReapplyJobs,
  getReapplyJob,
  revertReapplyJob,
  type PricingRule,
  type CreatePricingRuleInput,
  type UpdatePricingRuleInput,
  type StoneType,
  type ReapplyJob,
} from '../api/pricing-rules';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Badge,
  Alert,
  ConfirmModal,
  useToast,
  ProgressBar,
  StatusBadge,
} from '../components/ui';

const BASE_MARGINS: Record<StoneType, number> = {
  natural: 40,
  lab: 79,
  fancy: 40,
};

interface RuleFormData {
  priority: string;
  stone_type: 'any' | StoneType;
  price_min: string;
  price_max: string;
  feed: string;
  margin_modifier: string;
  rating: string;
}

const emptyFormData: RuleFormData = {
  priority: '100',
  stone_type: 'any',
  price_min: '',
  price_max: '',
  feed: '',
  margin_modifier: '0',
  rating: '',
};

function formatModifier(modifier: number): string {
  return `${modifier >= 0 ? '+' : ''}${modifier}%`;
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString()}`;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

export function PricingRules() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(emptyFormData);
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const [showReapplyConfirm, setShowReapplyConfirm] = useState(false);
  const [revertingJobId, setRevertingJobId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pricing-rules'],
    queryFn: getPricingRules,
  });

  // Reapply job history
  const { data: reapplyJobs } = useQuery({
    queryKey: ['reapply-jobs'],
    queryFn: getReapplyJobs,
    refetchInterval: activeJobId ? 3000 : false,
  });

  // Active job polling
  const { data: activeJob } = useQuery({
    queryKey: ['reapply-job', activeJobId],
    queryFn: () => getReapplyJob(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: 3000,
  });

  // Detect active job from job list and stop polling when done
  const runningJob = reapplyJobs?.find(
    (j: ReapplyJob) => j.status === 'pending' || j.status === 'running'
  );
  if (runningJob && activeJobId !== runningJob.id) {
    setActiveJobId(runningJob.id);
  }
  if (activeJob && activeJob.status !== 'pending' && activeJob.status !== 'running' && activeJobId) {
    setActiveJobId(null);
    queryClient.invalidateQueries({ queryKey: ['reapply-jobs'] });
  }

  const createMutation = useMutation({
    mutationFn: createPricingRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-rules'] });
      setShowCreateModal(false);
      setFormData(emptyFormData);
      addToast({ variant: 'success', title: 'Pricing rule created' });
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to create rule', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdatePricingRuleInput }) =>
      updatePricingRule(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-rules'] });
      setEditingRule(null);
      setFormData(emptyFormData);
      addToast({ variant: 'success', title: 'Pricing rule updated' });
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to update rule', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePricingRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-rules'] });
      setDeletingRuleId(null);
      addToast({ variant: 'success', title: 'Pricing rule deleted' });
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to delete rule', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const reapplyMutation = useMutation({
    mutationFn: triggerReapplyPricing,
    onSuccess: (data) => {
      setActiveJobId(data.id);
      queryClient.invalidateQueries({ queryKey: ['reapply-jobs'] });
      setShowReapplyConfirm(false);
      addToast({ variant: 'success', title: 'Repricing job started', message: `Processing ${data.total_diamonds.toLocaleString()} diamonds` });
    },
    onError: (error) => {
      setShowReapplyConfirm(false);
      addToast({ variant: 'error', title: 'Failed to start repricing', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const revertMutation = useMutation({
    mutationFn: revertReapplyJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reapply-jobs'] });
      setRevertingJobId(null);
      addToast({ variant: 'success', title: 'Pricing reverted successfully' });
    },
    onError: (error) => {
      setRevertingJobId(null);
      addToast({ variant: 'error', title: 'Failed to revert pricing', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const handleOpenCreate = () => {
    setFormData(emptyFormData);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (rule: PricingRule) => {
    setFormData({
      priority: rule.priority.toString(),
      stone_type: rule.stone_type ?? 'any',
      price_min: rule.price_min?.toString() ?? '',
      price_max: rule.price_max?.toString() ?? '',
      feed: rule.feed ?? '',
      margin_modifier: rule.margin_modifier.toString(),
      rating: rule.rating?.toString() ?? '',
    });
    setEditingRule(rule);
  };

  const handleSubmit = () => {
    const input: CreatePricingRuleInput = {
      priority: parseInt(formData.priority, 10),
      margin_modifier: parseFloat(formData.margin_modifier),
    };

    if (formData.stone_type !== 'any') input.stone_type = formData.stone_type;
    if (formData.price_min) input.price_min = parseFloat(formData.price_min);
    if (formData.price_max) input.price_max = parseFloat(formData.price_max);
    if (formData.feed) input.feed = formData.feed;
    if (formData.rating) input.rating = parseInt(formData.rating, 10);

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, updates: input });
    } else {
      createMutation.mutate(input);
    }
  };

  // Get unique feeds for filter
  const uniqueFeeds = Array.from(
    new Set(data?.rules.map((r) => r.feed).filter((f): f is string => !!f))
  ).sort();

  // Apply feed filter
  const filteredRules = data?.rules.filter((rule) => {
    if (feedFilter === 'all') return true;
    if (feedFilter === 'none') return !rule.feed;
    return rule.feed === feedFilter;
  }) ?? [];

  const isJobActive = !!runningJob || !!activeJobId;

  return (
    <>
      <Header />
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Price Models</h1>
              <p className="text-stone-600 dark:text-stone-400 mt-1">
                Manage pricing rules for diamond margin modifiers by stone type and cost
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowReapplyConfirm(true)}
                disabled={isJobActive || reapplyMutation.isPending}
                icon={<RefreshCw className={`w-4 h-4 ${isJobActive ? 'animate-spin' : ''}`} />}
              >
                {isJobActive ? 'Repricing...' : 'Reapply Pricing'}
              </Button>
              <Button
                variant="primary"
                onClick={handleOpenCreate}
                icon={<Plus className="w-4 h-4" />}
              >
                Add Rule
              </Button>
            </div>
          </div>

          {/* Active Job Progress */}
          {activeJob && (activeJob.status === 'pending' || activeJob.status === 'running') && (
            <Card>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary-500" />
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      Repricing in progress
                    </span>
                  </div>
                  <span className="text-sm text-stone-500 dark:text-stone-400">
                    {activeJob.processed_diamonds.toLocaleString()} / {activeJob.total_diamonds.toLocaleString()} diamonds
                  </span>
                </div>
                <ProgressBar
                  value={activeJob.processed_diamonds}
                  max={activeJob.total_diamonds}
                  showLabel
                  variant="primary"
                />
                {activeJob.failed_diamonds > 0 && (
                  <p className="text-xs text-error-600 dark:text-error-400">
                    {activeJob.failed_diamonds} diamonds failed to reprice
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Info */}
          <Alert variant="info" title="How Dynamic Pricing Works">
            Each diamond is classified as Natural (base: {BASE_MARGINS.natural}%), Lab (base: {BASE_MARGINS.lab}%), or Fancy (base: {BASE_MARGINS.fancy}%).
            Rules match by stone type and cost range, applying a margin modifier to the base margin.
            Effective margin = base margin + modifier. If no rule matches, the base margin is used with no modifier.
          </Alert>

          {/* Feed Filter */}
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Filter by Feed:
                </label>
                <Select
                  value={feedFilter}
                  onChange={(e) => setFeedFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Feeds' },
                    { value: 'none', label: 'No Feed (default)' },
                    ...uniqueFeeds.map((feed) => ({ value: feed, label: feed })),
                  ]}
                />
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  Showing {filteredRules.length} of {data?.total ?? 0} rules
                </span>
              </div>
            </div>
          </Card>

          {/* Rules Table */}
          <Card>
            <CardHeader
              title="Active Pricing Rules"
              subtitle={`${data?.total ?? 0} rules configured`}
            />
            {isLoading ? (
              <div className="p-8 text-center text-stone-500 dark:text-stone-400">Loading...</div>
            ) : error ? (
              <Alert variant="error" className="mt-4">
                Failed to load pricing rules
              </Alert>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-600">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Priority
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Feed
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Criteria
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Modifier
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Rating
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-600">
                    {filteredRules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/50">
                        <td className="px-4 py-3">
                          <Badge variant="neutral">{rule.priority}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {rule.feed ? (
                            <Badge variant="info">{rule.feed}</Badge>
                          ) : (
                            <span className="text-stone-400 dark:text-stone-500 text-sm">All</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {rule.stone_type ? (
                              <Badge variant={
                                rule.stone_type === 'lab' ? 'success' :
                                rule.stone_type === 'fancy' ? 'warning' : 'info'
                              }>
                                {rule.stone_type === 'natural' ? 'Natural' :
                                 rule.stone_type === 'lab' ? 'Lab Grown' : 'Fancy'}
                              </Badge>
                            ) : null}
                            {rule.price_min !== undefined || rule.price_max !== undefined ? (
                              <Badge variant="info">
                                {rule.price_min !== undefined ? formatPrice(rule.price_min) : '$0'}
                                {' - '}
                                {rule.price_max !== undefined ? formatPrice(rule.price_max) : 'No limit'}
                              </Badge>
                            ) : null}
                            {!rule.stone_type &&
                              rule.price_min === undefined &&
                              rule.price_max === undefined && (
                                <span className="text-stone-400 dark:text-stone-500 text-sm italic">
                                  All
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-stone-900 dark:text-stone-100">
                            <DollarSign className="w-4 h-4 text-success-500" />
                            {formatModifier(rule.margin_modifier)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rule.rating ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-warning-600">
                              <Star className="w-4 h-4" />
                              {rule.rating}/10
                            </span>
                          ) : (
                            <span className="text-stone-400 dark:text-stone-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEdit(rule)}
                              className="p-1 text-stone-400 dark:text-stone-500 hover:text-primary-600 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingRuleId(rule.id)}
                              className="p-1 text-stone-400 dark:text-stone-500 hover:text-error-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredRules.length === 0 && data?.rules && data.rules.length > 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                          No rules match the selected feed filter.
                        </td>
                      </tr>
                    )}
                    {data?.rules.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                          No pricing rules configured. Add a rule to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Repricing Job History */}
          {reapplyJobs && reapplyJobs.length > 0 && (
            <Card>
              <CardHeader
                title="Repricing History"
                subtitle="Recent repricing job runs"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-600">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Diamonds
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Feeds
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Duration
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Started
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-600">
                    {reapplyJobs.map((job: ReapplyJob) => (
                      <tr key={job.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/50">
                        <td className="px-4 py-3">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-700 dark:text-stone-300">
                          {job.processed_diamonds.toLocaleString()} / {job.total_diamonds.toLocaleString()}
                          {job.failed_diamonds > 0 && (
                            <span className="text-error-600 dark:text-error-400 ml-1">
                              ({job.failed_diamonds} failed)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {job.feeds_affected.length > 0
                              ? job.feeds_affected.map((feed) => (
                                  <Badge key={feed} variant="info">{feed}</Badge>
                                ))
                              : <span className="text-stone-400 dark:text-stone-500 text-sm">-</span>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-700 dark:text-stone-300">
                          {formatDuration(job.started_at, job.completed_at)}
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-700 dark:text-stone-300">
                          {formatDate(job.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {job.status === 'completed' && (
                            <button
                              onClick={() => setRevertingJobId(job.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-warning-700 dark:text-warning-400 bg-warning-50 dark:bg-warning-900/20 rounded hover:bg-warning-100 dark:hover:bg-warning-900/40 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Revert
                            </button>
                          )}
                          {job.status === 'failed' && job.error && (
                            <span className="text-xs text-error-600 dark:text-error-400 max-w-[200px] truncate block">
                              {job.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || editingRule) && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-stone-200 dark:border-stone-600">
                <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
                  {editingRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
                </h2>
              </div>
              <div className="p-6 space-y-6">
                {/* Priority */}
                <div>
                  <Input
                    label="Priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, priority: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Lower number = higher priority. Rules are evaluated in order.
                  </p>
                </div>

                {/* Stone Type */}
                <div>
                  <Select
                    label="Stone Type"
                    value={formData.stone_type}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        stone_type: e.target.value as 'any' | StoneType,
                      }))
                    }
                    options={[
                      { value: 'any', label: 'Any (matches all)' },
                      { value: 'natural', label: `Natural (base: ${BASE_MARGINS.natural}%)` },
                      { value: 'lab', label: `Lab Grown (base: ${BASE_MARGINS.lab}%)` },
                      { value: 'fancy', label: `Fancy Color (base: ${BASE_MARGINS.fancy}%)` },
                    ]}
                  />
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Fancy = has a fancy color. Lab = lab grown. Natural = everything else.
                  </p>
                </div>

                {/* Cost Range */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Min Cost (USD)"
                    type="number"
                    step="0.01"
                    value={formData.price_min}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, price_min: e.target.value }))
                    }
                    placeholder="Leave empty for no minimum"
                  />
                  <Input
                    label="Max Cost (USD)"
                    type="number"
                    step="0.01"
                    value={formData.price_max}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, price_max: e.target.value }))
                    }
                    placeholder="Leave empty for no maximum"
                  />
                </div>

                {/* Feed */}
                <div>
                  <Input
                    label="Feed"
                    value={formData.feed}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, feed: e.target.value }))
                    }
                    placeholder="Leave empty to match all feeds"
                  />
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Specific feed/supplier name to match
                  </p>
                </div>

                {/* Margin Modifier */}
                <div>
                  <Input
                    label="Margin Modifier (%)"
                    type="number"
                    step="0.01"
                    value={formData.margin_modifier}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, margin_modifier: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Percentage points added to base margin. e.g., 6 = +6%, -4 = -4%.
                    {formData.stone_type !== 'any' && (
                      <>
                        {' '}Effective margin: {BASE_MARGINS[formData.stone_type] + (parseFloat(formData.margin_modifier) || 0)}%
                      </>
                    )}
                  </p>
                </div>

                {/* Rating */}
                <div>
                  <Input
                    label="Rating (1-10)"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.rating}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, rating: e.target.value }))
                    }
                    placeholder="Optional quality rating"
                  />
                </div>

                {(createMutation.error || updateMutation.error) && (
                  <Alert variant="error">
                    {(createMutation.error || updateMutation.error) instanceof Error
                      ? (createMutation.error || updateMutation.error)?.message
                      : 'An error occurred'}
                  </Alert>
                )}
              </div>
              <div className="p-6 border-t border-stone-200 dark:border-stone-600 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingRule(null);
                    setFormData(emptyFormData);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingRule
                    ? 'Update Rule'
                    : 'Create Rule'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        <ConfirmModal
          isOpen={!!deletingRuleId}
          onClose={() => setDeletingRuleId(null)}
          onConfirm={() => deletingRuleId && deleteMutation.mutate(deletingRuleId)}
          title="Delete Pricing Rule"
          message="Are you sure you want to delete this pricing rule? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          loading={deleteMutation.isPending}
        />

        {/* Reapply Confirmation */}
        <ConfirmModal
          isOpen={showReapplyConfirm}
          onClose={() => setShowReapplyConfirm(false)}
          onConfirm={() => reapplyMutation.mutate()}
          title="Reapply Pricing Model"
          message="This will recalculate prices for all available diamonds using the current pricing rules. The operation runs in the background and can be reverted afterwards. Continue?"
          confirmText="Reapply"
          variant="danger"
          loading={reapplyMutation.isPending}
        />

        {/* Revert Confirmation */}
        <ConfirmModal
          isOpen={!!revertingJobId}
          onClose={() => setRevertingJobId(null)}
          onConfirm={() => revertingJobId && revertMutation.mutate(revertingJobId)}
          title="Revert Pricing Changes"
          message="This will restore all diamond prices to their values before this repricing job was run. Continue?"
          confirmText="Revert"
          variant="danger"
          loading={revertMutation.isPending}
        />
      </PageContainer>
    </>
  );
}
