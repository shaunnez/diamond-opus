import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Star, RefreshCw, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getRatingRules,
  createRatingRule,
  updateRatingRule,
  deleteRatingRule,
  getRatingReapplyJobs,
  getRatingReapplyJob,
  revertRatingReapplyJob,
  startBulkRatingReapply,
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
  // Tier 1
  polishes: string;
  symmetries: string;
  fluorescences: string;
  certificate_labs: string;
  lab_grown: string; // '', 'true', 'false'
  carat_min: string;
  carat_max: string;
  // Tier 2
  table_min: string;
  table_max: string;
  depth_min: string;
  depth_max: string;
  crown_angle_min: string;
  crown_angle_max: string;
  crown_height_min: string;
  crown_height_max: string;
  pavilion_angle_min: string;
  pavilion_angle_max: string;
  pavilion_depth_min: string;
  pavilion_depth_max: string;
  girdles: string;
  culet_sizes: string;
  ratio_min: string;
  ratio_max: string;
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
  polishes: '',
  symmetries: '',
  fluorescences: '',
  certificate_labs: '',
  lab_grown: '',
  carat_min: '',
  carat_max: '',
  table_min: '',
  table_max: '',
  depth_min: '',
  depth_max: '',
  crown_angle_min: '',
  crown_angle_max: '',
  crown_height_min: '',
  crown_height_max: '',
  pavilion_angle_min: '',
  pavilion_angle_max: '',
  pavilion_depth_min: '',
  pavilion_depth_max: '',
  girdles: '',
  culet_sizes: '',
  ratio_min: '',
  ratio_max: '',
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
  const s = snapshot as Record<string, unknown>;

  const arr = (key: string) => {
    const v = s[key];
    return Array.isArray(v) && v.length > 0 ? v : null;
  };

  const shapes = arr('shapes');
  if (shapes) parts.push(`Shapes: ${shapes.join(', ')}`);
  const colors = arr('colors');
  if (colors) parts.push(`Colors: ${colors.join(', ')}`);
  const clarities = arr('clarities');
  if (clarities) parts.push(`Clarities: ${clarities.join(', ')}`);
  const polishes = arr('polishes');
  if (polishes) parts.push(`Polish: ${polishes.join(', ')}`);
  const symmetries = arr('symmetries');
  if (symmetries) parts.push(`Symmetry: ${symmetries.join(', ')}`);
  const fluorescences = arr('fluorescences');
  if (fluorescences) parts.push(`Fluorescence: ${fluorescences.join(', ')}`);
  const certificateLabs = arr('certificate_labs');
  if (certificateLabs) parts.push(`Lab: ${certificateLabs.join(', ')}`);

  if (s.price_min !== undefined || s.price_max !== undefined) {
    const min = s.price_min !== undefined ? formatPrice(s.price_min as number) : '$0';
    const max = s.price_max !== undefined ? formatPrice(s.price_max as number) : 'No limit';
    parts.push(`${min} - ${max}`);
  }
  if (s.feed) parts.push(`Feed: ${s.feed}`);
  if (s.rating !== undefined) parts.push(`Rating: ${s.rating}/10`);
  if (s.lab_grown !== undefined) parts.push(`Lab-grown: ${s.lab_grown ? 'Yes' : 'No'}`);

  return parts.join(', ');
}

function FilterSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-stone-200 dark:border-stone-600 rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors rounded-lg"
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

function hasExtendedFilters(rule: RatingRule): boolean {
  return !!(
    rule.polishes?.length ||
    rule.symmetries?.length ||
    rule.fluorescences?.length ||
    rule.certificate_labs?.length ||
    rule.lab_grown !== undefined ||
    rule.carat_min !== undefined ||
    rule.carat_max !== undefined ||
    rule.table_min !== undefined ||
    rule.table_max !== undefined ||
    rule.depth_min !== undefined ||
    rule.depth_max !== undefined ||
    rule.crown_angle_min !== undefined ||
    rule.crown_angle_max !== undefined ||
    rule.crown_height_min !== undefined ||
    rule.crown_height_max !== undefined ||
    rule.pavilion_angle_min !== undefined ||
    rule.pavilion_angle_max !== undefined ||
    rule.pavilion_depth_min !== undefined ||
    rule.pavilion_depth_max !== undefined ||
    rule.girdles?.length ||
    rule.culet_sizes?.length ||
    rule.ratio_min !== undefined ||
    rule.ratio_max !== undefined
  );
}

function formatRange(label: string, min?: number, max?: number): string | null {
  if (min === undefined && max === undefined) return null;
  const minStr = min !== undefined ? String(min) : '0';
  const maxStr = max !== undefined ? String(max) : '\u221e';
  return `${label}: ${minStr}-${maxStr}`;
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

  const bulkRerateMutation = useMutation({
    mutationFn: startBulkRatingReapply,
    onSuccess: (data) => {
      setActiveJobId(data.id);
      queryClient.invalidateQueries({ queryKey: ['rating-reapply-jobs'] });
      addToast({ variant: 'info', title: 'Bulk re-rating started', message: `Processing ${data.total_diamonds.toLocaleString()} diamonds` });
    },
    onError: (error) => {
      addToast({ variant: 'error', title: 'Failed to start re-rating', message: error instanceof Error ? error.message : 'An unknown error occurred' });
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
      polishes: rule.polishes?.join(', ') ?? '',
      symmetries: rule.symmetries?.join(', ') ?? '',
      fluorescences: rule.fluorescences?.join(', ') ?? '',
      certificate_labs: rule.certificate_labs?.join(', ') ?? '',
      lab_grown: rule.lab_grown === undefined ? '' : String(rule.lab_grown),
      carat_min: rule.carat_min?.toString() ?? '',
      carat_max: rule.carat_max?.toString() ?? '',
      table_min: rule.table_min?.toString() ?? '',
      table_max: rule.table_max?.toString() ?? '',
      depth_min: rule.depth_min?.toString() ?? '',
      depth_max: rule.depth_max?.toString() ?? '',
      crown_angle_min: rule.crown_angle_min?.toString() ?? '',
      crown_angle_max: rule.crown_angle_max?.toString() ?? '',
      crown_height_min: rule.crown_height_min?.toString() ?? '',
      crown_height_max: rule.crown_height_max?.toString() ?? '',
      pavilion_angle_min: rule.pavilion_angle_min?.toString() ?? '',
      pavilion_angle_max: rule.pavilion_angle_max?.toString() ?? '',
      pavilion_depth_min: rule.pavilion_depth_min?.toString() ?? '',
      pavilion_depth_max: rule.pavilion_depth_max?.toString() ?? '',
      girdles: rule.girdles?.join(', ') ?? '',
      culet_sizes: rule.culet_sizes?.join(', ') ?? '',
      ratio_min: rule.ratio_min?.toString() ?? '',
      ratio_max: rule.ratio_max?.toString() ?? '',
    });
    setEditingRule(rule);
  };

  const parseCommaSeparated = (value: string): string[] | undefined => {
    if (!value.trim()) return undefined;
    return value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  };

  const optFloat = (value: string): number | undefined => {
    if (!value.trim()) return undefined;
    return parseFloat(value);
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

    // Tier 1
    if (formData.polishes) input.polishes = parseCommaSeparated(formData.polishes);
    if (formData.symmetries) input.symmetries = parseCommaSeparated(formData.symmetries);
    if (formData.fluorescences) input.fluorescences = parseCommaSeparated(formData.fluorescences);
    if (formData.certificate_labs) input.certificate_labs = parseCommaSeparated(formData.certificate_labs);
    if (formData.lab_grown === 'true') input.lab_grown = true;
    if (formData.lab_grown === 'false') input.lab_grown = false;
    input.carat_min = optFloat(formData.carat_min);
    input.carat_max = optFloat(formData.carat_max);

    // Tier 2
    input.table_min = optFloat(formData.table_min);
    input.table_max = optFloat(formData.table_max);
    input.depth_min = optFloat(formData.depth_min);
    input.depth_max = optFloat(formData.depth_max);
    input.crown_angle_min = optFloat(formData.crown_angle_min);
    input.crown_angle_max = optFloat(formData.crown_angle_max);
    input.crown_height_min = optFloat(formData.crown_height_min);
    input.crown_height_max = optFloat(formData.crown_height_max);
    input.pavilion_angle_min = optFloat(formData.pavilion_angle_min);
    input.pavilion_angle_max = optFloat(formData.pavilion_angle_max);
    input.pavilion_depth_min = optFloat(formData.pavilion_depth_min);
    input.pavilion_depth_max = optFloat(formData.pavilion_depth_max);
    if (formData.girdles) input.girdles = parseCommaSeparated(formData.girdles);
    if (formData.culet_sizes) input.culet_sizes = parseCommaSeparated(formData.culet_sizes);
    input.ratio_min = optFloat(formData.ratio_min);
    input.ratio_max = optFloat(formData.ratio_max);

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, updates: input });
    } else {
      createMutation.mutate(input);
    }
  };

  const setField = (field: keyof RuleFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
                Manage quality rating rules for diamonds. Configure filters across grading, measurements, and attributes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => bulkRerateMutation.mutate()}
                icon={<RefreshCw className={`w-4 h-4 ${bulkRerateMutation.isPending ? 'animate-spin' : ''}`} />}
                disabled={!!activeJobId || bulkRerateMutation.isPending}
              >
                {bulkRerateMutation.isPending ? 'Starting...' : 'Re-rate All'}
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
                            {/* Extended filter badges */}
                            {rule.polishes && rule.polishes.length > 0 && (
                              <Badge variant="success">Polish: {rule.polishes.join(', ')}</Badge>
                            )}
                            {rule.symmetries && rule.symmetries.length > 0 && (
                              <Badge variant="success">Sym: {rule.symmetries.join(', ')}</Badge>
                            )}
                            {rule.fluorescences && rule.fluorescences.length > 0 && (
                              <Badge variant="warning">Fluor: {rule.fluorescences.join(', ')}</Badge>
                            )}
                            {rule.certificate_labs && rule.certificate_labs.length > 0 && (
                              <Badge variant="info">Lab: {rule.certificate_labs.join(', ')}</Badge>
                            )}
                            {rule.lab_grown !== undefined && (
                              <Badge variant={rule.lab_grown ? 'info' : 'neutral'}>
                                {rule.lab_grown ? 'Lab-grown' : 'Natural'}
                              </Badge>
                            )}
                            {(rule.carat_min !== undefined || rule.carat_max !== undefined) && (
                              <Badge variant="neutral">
                                {formatRange('Ct', rule.carat_min, rule.carat_max)}
                              </Badge>
                            )}
                            {(rule.table_min !== undefined || rule.table_max !== undefined) && (
                              <Badge variant="neutral">
                                {formatRange('Table%', rule.table_min, rule.table_max)}
                              </Badge>
                            )}
                            {(rule.depth_min !== undefined || rule.depth_max !== undefined) && (
                              <Badge variant="neutral">
                                {formatRange('Depth%', rule.depth_min, rule.depth_max)}
                              </Badge>
                            )}
                            {rule.girdles && rule.girdles.length > 0 && (
                              <Badge variant="neutral">Girdle: {rule.girdles.join(', ')}</Badge>
                            )}
                            {rule.culet_sizes && rule.culet_sizes.length > 0 && (
                              <Badge variant="neutral">Culet: {rule.culet_sizes.join(', ')}</Badge>
                            )}
                            {(rule.ratio_min !== undefined || rule.ratio_max !== undefined) && (
                              <Badge variant="neutral">
                                {formatRange('Ratio', rule.ratio_min, rule.ratio_max)}
                              </Badge>
                            )}
                            {/* Show "All" only when no filters at all */}
                            {!rule.shapes?.length &&
                              !rule.colors?.length &&
                              !rule.clarities?.length &&
                              !rule.cuts?.length &&
                              rule.price_min === undefined &&
                              rule.price_max === undefined &&
                              !hasExtendedFilters(rule) && (
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
              <div className="p-6 space-y-4">
                {/* Priority & Rating */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="Priority"
                      type="number"
                      value={formData.priority}
                      onChange={(e) => setField('priority', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Lower = higher precedence
                    </p>
                  </div>
                  <div>
                    <Input
                      label="Rating (1-10)"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.rating}
                      onChange={(e) => setField('rating', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Quality score to assign
                    </p>
                  </div>
                </div>

                {/* Basic 4Cs + Price (always visible) */}
                <FilterSection title="Basic Filters (4Cs, Price, Feed)" defaultOpen>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input
                        label="Shapes"
                        value={formData.shapes}
                        onChange={(e) => setField('shapes', e.target.value)}
                        placeholder="e.g. ROUND, OVAL"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Colors"
                        value={formData.colors}
                        onChange={(e) => setField('colors', e.target.value)}
                        placeholder="e.g. D, E, F"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Clarities"
                        value={formData.clarities}
                        onChange={(e) => setField('clarities', e.target.value)}
                        placeholder="e.g. VS1, VS2, VVS1"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Cuts"
                        value={formData.cuts}
                        onChange={(e) => setField('cuts', e.target.value)}
                        placeholder="e.g. EX, VG"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Min Price (USD)"
                      type="number"
                      step="0.01"
                      value={formData.price_min}
                      onChange={(e) => setField('price_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Price (USD)"
                      type="number"
                      step="0.01"
                      value={formData.price_max}
                      onChange={(e) => setField('price_max', e.target.value)}
                      placeholder="No maximum"
                    />
                  </div>
                  <Input
                    label="Feed"
                    value={formData.feed}
                    onChange={(e) => setField('feed', e.target.value)}
                    placeholder="Leave empty to match all feeds"
                  />
                </FilterSection>

                {/* Grading */}
                <FilterSection title="Grading (Polish, Symmetry, Fluorescence, Lab)">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input
                        label="Polish"
                        value={formData.polishes}
                        onChange={(e) => setField('polishes', e.target.value)}
                        placeholder="e.g. EX, VG"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Symmetry"
                        value={formData.symmetries}
                        onChange={(e) => setField('symmetries', e.target.value)}
                        placeholder="e.g. EX, VG"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Fluorescence"
                        value={formData.fluorescences}
                        onChange={(e) => setField('fluorescences', e.target.value)}
                        placeholder="e.g. NONE, FAINT"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Certificate Lab"
                        value={formData.certificate_labs}
                        onChange={(e) => setField('certificate_labs', e.target.value)}
                        placeholder="e.g. GIA, IGI"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                      Lab-Grown
                    </label>
                    <select
                      value={formData.lab_grown}
                      onChange={(e) => setField('lab_grown', e.target.value)}
                      className="w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">Any (no filter)</option>
                      <option value="true">Lab-grown only</option>
                      <option value="false">Natural only</option>
                    </select>
                  </div>
                </FilterSection>

                {/* Carat & Measurements */}
                <FilterSection title="Carat & Measurements (Table%, Depth%, Ratio)">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Min Carat"
                      type="number"
                      step="0.01"
                      value={formData.carat_min}
                      onChange={(e) => setField('carat_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Carat"
                      type="number"
                      step="0.01"
                      value={formData.carat_max}
                      onChange={(e) => setField('carat_max', e.target.value)}
                      placeholder="No maximum"
                    />
                    <Input
                      label="Min Table %"
                      type="number"
                      step="0.1"
                      value={formData.table_min}
                      onChange={(e) => setField('table_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Table %"
                      type="number"
                      step="0.1"
                      value={formData.table_max}
                      onChange={(e) => setField('table_max', e.target.value)}
                      placeholder="No maximum"
                    />
                    <Input
                      label="Min Depth %"
                      type="number"
                      step="0.1"
                      value={formData.depth_min}
                      onChange={(e) => setField('depth_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Depth %"
                      type="number"
                      step="0.1"
                      value={formData.depth_max}
                      onChange={(e) => setField('depth_max', e.target.value)}
                      placeholder="No maximum"
                    />
                    <Input
                      label="Min Ratio (L/W)"
                      type="number"
                      step="0.01"
                      value={formData.ratio_min}
                      onChange={(e) => setField('ratio_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Ratio (L/W)"
                      type="number"
                      step="0.01"
                      value={formData.ratio_max}
                      onChange={(e) => setField('ratio_max', e.target.value)}
                      placeholder="No maximum"
                    />
                  </div>
                </FilterSection>

                {/* Crown, Pavilion, Girdle, Culet */}
                <FilterSection title="Crown & Pavilion (Angles, Heights, Girdle, Culet)">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Min Crown Angle"
                      type="number"
                      step="0.1"
                      value={formData.crown_angle_min}
                      onChange={(e) => setField('crown_angle_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Crown Angle"
                      type="number"
                      step="0.1"
                      value={formData.crown_angle_max}
                      onChange={(e) => setField('crown_angle_max', e.target.value)}
                      placeholder="No maximum"
                    />
                    <Input
                      label="Min Crown Height"
                      type="number"
                      step="0.1"
                      value={formData.crown_height_min}
                      onChange={(e) => setField('crown_height_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Crown Height"
                      type="number"
                      step="0.1"
                      value={formData.crown_height_max}
                      onChange={(e) => setField('crown_height_max', e.target.value)}
                      placeholder="No maximum"
                    />
                    <Input
                      label="Min Pavilion Angle"
                      type="number"
                      step="0.1"
                      value={formData.pavilion_angle_min}
                      onChange={(e) => setField('pavilion_angle_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Pavilion Angle"
                      type="number"
                      step="0.1"
                      value={formData.pavilion_angle_max}
                      onChange={(e) => setField('pavilion_angle_max', e.target.value)}
                      placeholder="No maximum"
                    />
                    <Input
                      label="Min Pavilion Depth"
                      type="number"
                      step="0.1"
                      value={formData.pavilion_depth_min}
                      onChange={(e) => setField('pavilion_depth_min', e.target.value)}
                      placeholder="No minimum"
                    />
                    <Input
                      label="Max Pavilion Depth"
                      type="number"
                      step="0.1"
                      value={formData.pavilion_depth_max}
                      onChange={(e) => setField('pavilion_depth_max', e.target.value)}
                      placeholder="No maximum"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input
                        label="Girdle"
                        value={formData.girdles}
                        onChange={(e) => setField('girdles', e.target.value)}
                        placeholder="e.g. THIN, MEDIUM"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                    <div>
                      <Input
                        label="Culet Size"
                        value={formData.culet_sizes}
                        onChange={(e) => setField('culet_sizes', e.target.value)}
                        placeholder="e.g. NONE, SMALL"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Comma-separated</p>
                    </div>
                  </div>
                </FilterSection>

                {/* Recalculate Rating */}
                <div className="border-t border-stone-200 dark:border-stone-600 pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.recalculate_rating}
                      onChange={(e) => setField('recalculate_rating', e.target.checked)}
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
