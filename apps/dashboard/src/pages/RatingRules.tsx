import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Star, RefreshCw, RotateCcw } from 'lucide-react';
import {
  getRatingRules,
  createRatingRule,
  updateRatingRule,
  deleteRatingRule,
  getRatingReapplyJobs,
  getRatingReapplyJob,
  revertRatingReapplyJob,
  type RatingRule,
  type CreateRatingRuleInput,
  type UpdateRatingRuleInput,
  type RatingReapplyJob,
} from '../api/rating-rules';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Badge,
  Alert,
  ConfirmModal,
  useToast,
  ProgressBar,
  StatusBadge,
} from '../components/ui';

interface RuleFormData {
  priority: string;
  price_min: string;
  price_max: string;
  shapes: string;
  colors: string;
  clarities: string;
  cuts: string;
  feed: string;
  rating: string;
  recalculate_rating: boolean;
}

const emptyFormData: RuleFormData = {
  priority: '100',
  price_min: '',
  price_max: '',
  shapes: '',
  colors: '',
  clarities: '',
  cuts: '',
  feed: '',
  rating: '5',
  recalculate_rating: false,
};

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

function formatTriggerType(triggerType: string | null): string {
  if (!triggerType) return 'Manual';
  if (triggerType === 'rule_create') return 'Rule Created';
  if (triggerType === 'rule_update') return 'Rule Updated';
  return 'Manual';
}

function formatRuleSnapshot(snapshot: RatingReapplyJob['trigger_rule_snapshot']): string {
  if (!snapshot) return '';
  const parts: string[] = [];

  if (snapshot.shapes && snapshot.shapes.length > 0) {
    parts.push(`Shapes: ${snapshot.shapes.join(', ')}`);
  }
  if (snapshot.colors && snapshot.colors.length > 0) {
    parts.push(`Colors: ${snapshot.colors.join(', ')}`);
  }
  if (snapshot.clarities && snapshot.clarities.length > 0) {
    parts.push(`Clarities: ${snapshot.clarities.join(', ')}`);
  }
  if (snapshot.price_min !== undefined || snapshot.price_max !== undefined) {
    const min = snapshot.price_min !== undefined ? formatPrice(snapshot.price_min) : '$0';
    const max = snapshot.price_max !== undefined ? formatPrice(snapshot.price_max) : 'No limit';
    parts.push(`${min} - ${max}`);
  }
  if (snapshot.feed) {
    parts.push(`Feed: ${snapshot.feed}`);
  }
  if (snapshot.rating !== undefined) {
    parts.push(`Rating: ${snapshot.rating}/10`);
  }

  return parts.join(', ');
}

export function RatingRules() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RatingRule | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(emptyFormData);
  const [revertingJobId, setRevertingJobId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['rating-rules'],
    queryFn: getRatingRules,
  });

  const { data: reapplyJobs } = useQuery({
    queryKey: ['rating-reapply-jobs'],
    queryFn: getRatingReapplyJobs,
    refetchInterval: activeJobId ? 3000 : false,
  });

  const { data: activeJob } = useQuery({
    queryKey: ['rating-reapply-job', activeJobId],
    queryFn: () => getRatingReapplyJob(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    const runningJob = reapplyJobs?.find(
      (j: RatingReapplyJob) => j.status === 'pending' || j.status === 'running'
    );
    if (runningJob && activeJobId !== runningJob.id) {
      setActiveJobId(runningJob.id);
    }
  }, [reapplyJobs, activeJobId]);

  useEffect(() => {
    if (activeJob && activeJob.status !== 'pending' && activeJob.status !== 'running' && activeJobId) {
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ['rating-reapply-jobs'] });
    }
  }, [activeJob, activeJobId, queryClient]);

  const createMutation = useMutation({
    mutationFn: createRatingRule,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rating-rules'] });
      setShowCreateModal(false);
      setFormData(emptyFormData);
      addToast({ variant: 'success', title: 'Rating rule created' });

      if (data.reapply_job_id) {
        setActiveJobId(data.reapply_job_id);
        queryClient.invalidateQueries({ queryKey: ['rating-reapply-jobs'] });
        addToast({ variant: 'info', title: 'Re-rating job started', message: 'Background re-rating has been initiated' });
      }
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to create rule', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateRatingRuleInput }) =>
      updateRatingRule(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rating-rules'] });
      setEditingRule(null);
      setFormData(emptyFormData);
      addToast({ variant: 'success', title: 'Rating rule updated' });

      if (data.reapply_job_id) {
        setActiveJobId(data.reapply_job_id);
        queryClient.invalidateQueries({ queryKey: ['rating-reapply-jobs'] });
        addToast({ variant: 'info', title: 'Re-rating job started', message: 'Background re-rating has been initiated' });
      }
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to update rule', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRatingRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rating-rules'] });
      setDeletingRuleId(null);
      addToast({ variant: 'success', title: 'Rating rule deleted' });
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to delete rule', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const revertMutation = useMutation({
    mutationFn: revertRatingReapplyJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rating-reapply-jobs'] });
      setRevertingJobId(null);
      addToast({ variant: 'success', title: 'Rating reverted successfully' });
    },
    onError: (error) => {
      setRevertingJobId(null);
      addToast({ variant: 'error', title: 'Failed to revert rating', message: error instanceof Error ? error.message : 'An unknown error occurred' });
    },
  });

  const handleOpenCreate = () => {
    setFormData(emptyFormData);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (rule: RatingRule) => {
    setFormData({
      priority: rule.priority.toString(),
      price_min: rule.price_min?.toString() ?? '',
      price_max: rule.price_max?.toString() ?? '',
      shapes: rule.shapes?.join(', ') ?? '',
      colors: rule.colors?.join(', ') ?? '',
      clarities: rule.clarities?.join(', ') ?? '',
      cuts: rule.cuts?.join(', ') ?? '',
      feed: rule.feed ?? '',
      rating: rule.rating.toString(),
      recalculate_rating: false,
    });
    setEditingRule(rule);
  };

  const parseCommaSeparated = (value: string): string[] | undefined => {
    if (!value.trim()) return undefined;
    return value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  };

  const handleSubmit = () => {
    const input: CreateRatingRuleInput = {
      priority: parseInt(formData.priority, 10),
      rating: parseInt(formData.rating, 10),
      recalculate_rating: formData.recalculate_rating,
    };

    if (formData.price_min) input.price_min = parseFloat(formData.price_min);
    if (formData.price_max) input.price_max = parseFloat(formData.price_max);
    if (formData.shapes) input.shapes = parseCommaSeparated(formData.shapes);
    if (formData.colors) input.colors = parseCommaSeparated(formData.colors);
    if (formData.clarities) input.clarities = parseCommaSeparated(formData.clarities);
    if (formData.cuts) input.cuts = parseCommaSeparated(formData.cuts);
    if (formData.feed) input.feed = formData.feed;

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, updates: input });
    } else {
      createMutation.mutate(input);
    }
  };

  const rules = data?.rules ?? [];

  return (
    <>
      <Header />
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Rating Rules</h1>
              <p className="text-stone-600 dark:text-stone-400 mt-1">
                Manage quality rating rules for diamonds based on shape, color, clarity, cut, and price
              </p>
            </div>
            <Button
              variant="primary"
              onClick={handleOpenCreate}
              icon={<Plus className="w-4 h-4" />}
            >
              Add Rule
            </Button>
          </div>

          {/* Active Job Progress */}
          {activeJob && (activeJob.status === 'pending' || activeJob.status === 'running') && (
            <Card>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary-500" />
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      Re-rating in progress
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
                    {activeJob.failed_diamonds} diamonds failed to rerate
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Info */}
          <Alert variant="info" title="How Rating Rules Work">
            Rating rules assign a quality score (1-10) to diamonds based on their properties.
            Rules are evaluated by priority (lower number = higher precedence). The first matching rule determines the diamond's rating.
            Ratings are applied during consolidation and can also be recalculated on demand.
          </Alert>

          {/* Rules Table */}
          <Card>
            <CardHeader
              title="Active Rating Rules"
              subtitle={`${data?.total ?? 0} rules configured`}
            />
            {isLoading ? (
              <div className="p-8 text-center text-stone-500 dark:text-stone-400">Loading...</div>
            ) : error ? (
              <Alert variant="error" className="mt-4">
                Failed to load rating rules
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
                        Rating
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-600">
                    {rules.map((rule) => (
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
                          <div className="flex flex-wrap gap-1">
                            {rule.shapes && rule.shapes.length > 0 && (
                              <Badge variant="info">{rule.shapes.join(', ')}</Badge>
                            )}
                            {rule.colors && rule.colors.length > 0 && (
                              <Badge variant="success">{rule.colors.join(', ')}</Badge>
                            )}
                            {rule.clarities && rule.clarities.length > 0 && (
                              <Badge variant="warning">{rule.clarities.join(', ')}</Badge>
                            )}
                            {rule.cuts && rule.cuts.length > 0 && (
                              <Badge variant="neutral">{rule.cuts.join(', ')}</Badge>
                            )}
                            {(rule.price_min !== undefined || rule.price_max !== undefined) && (
                              <Badge variant="info">
                                {rule.price_min !== undefined ? formatPrice(rule.price_min) : '$0'}
                                {' - '}
                                {rule.price_max !== undefined ? formatPrice(rule.price_max) : 'No limit'}
                              </Badge>
                            )}
                            {!rule.shapes?.length &&
                              !rule.colors?.length &&
                              !rule.clarities?.length &&
                              !rule.cuts?.length &&
                              rule.price_min === undefined &&
                              rule.price_max === undefined && (
                                <span className="text-stone-400 dark:text-stone-500 text-sm italic">
                                  All
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-warning-600">
                            <Star className="w-4 h-4" />
                            {rule.rating}/10
                          </span>
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
                    {rules.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                          No rating rules configured. Add a rule to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Re-rating Job History */}
          {reapplyJobs && reapplyJobs.length > 0 && (
            <Card>
              <CardHeader
                title="Re-rating History"
                subtitle="Recent re-rating job runs"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-600">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Trigger
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
                    {reapplyJobs.map((job: RatingReapplyJob) => (
                      <tr key={job.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/50">
                        <td className="px-4 py-3">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <Badge variant={job.trigger_type === 'manual' ? 'neutral' : 'info'}>
                              {formatTriggerType(job.trigger_type)}
                            </Badge>
                            {job.trigger_rule_snapshot && (
                              <p className="text-xs text-stone-600 dark:text-stone-400 max-w-xs">
                                {formatRuleSnapshot(job.trigger_rule_snapshot)}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-700 dark:text-stone-300">
                          {job.processed_diamonds.toLocaleString()} / {job.total_diamonds.toLocaleString()}
                          {job.updated_diamonds > 0 && (
                            <span className="text-success-600 dark:text-success-400 ml-1">
                              ({job.updated_diamonds} changed)
                            </span>
                          )}
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
                  {editingRule ? 'Edit Rating Rule' : 'Create Rating Rule'}
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
                  />
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Quality rating to assign to matching diamonds
                  </p>
                </div>

                {/* Shape, Color, Clarity, Cut filters */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="Shapes"
                      value={formData.shapes}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, shapes: e.target.value }))
                      }
                      placeholder="e.g. ROUND, OVAL"
                    />
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Comma-separated, leave empty for all
                    </p>
                  </div>
                  <div>
                    <Input
                      label="Colors"
                      value={formData.colors}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, colors: e.target.value }))
                      }
                      placeholder="e.g. D, E, F"
                    />
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Comma-separated, leave empty for all
                    </p>
                  </div>
                  <div>
                    <Input
                      label="Clarities"
                      value={formData.clarities}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, clarities: e.target.value }))
                      }
                      placeholder="e.g. VS1, VS2, VVS1"
                    />
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Comma-separated, leave empty for all
                    </p>
                  </div>
                  <div>
                    <Input
                      label="Cuts"
                      value={formData.cuts}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, cuts: e.target.value }))
                      }
                      placeholder="e.g. EX, VG"
                    />
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Comma-separated, leave empty for all
                    </p>
                  </div>
                </div>

                {/* Price Range */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Min Price (USD)"
                    type="number"
                    step="0.01"
                    value={formData.price_min}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, price_min: e.target.value }))
                    }
                    placeholder="Leave empty for no minimum"
                  />
                  <Input
                    label="Max Price (USD)"
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
                </div>

                {/* Recalculate Rating */}
                <div className="border-t border-stone-200 dark:border-stone-600 pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.recalculate_rating}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, recalculate_rating: e.target.checked }))
                      }
                      className="mt-1 w-4 h-4 rounded border-stone-300 text-primary-600 focus:ring-primary-500"
                      disabled={!!activeJobId || createMutation.isPending || updateMutation.isPending}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-stone-900 dark:text-stone-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        Recalculate ratings now
                      </span>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        Runs a background re-rating job for available diamonds using the latest active rules.
                      </p>
                      {activeJobId && (
                        <p className="mt-1 text-xs text-warning-600 dark:text-warning-400">
                          A re-rating job is already running. Please wait for it to complete.
                        </p>
                      )}
                    </div>
                  </label>
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
          title="Delete Rating Rule"
          message="Are you sure you want to delete this rating rule? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          loading={deleteMutation.isPending}
        />

        {/* Revert Confirmation */}
        <ConfirmModal
          isOpen={!!revertingJobId}
          onClose={() => setRevertingJobId(null)}
          onConfirm={() => revertingJobId && revertMutation.mutate(revertingJobId)}
          title="Revert Rating Changes"
          message="This will restore all diamond ratings to their values before this re-rating job was run. Continue?"
          confirmText="Revert"
          variant="danger"
          loading={revertMutation.isPending}
        />
      </PageContainer>
    </>
  );
}
