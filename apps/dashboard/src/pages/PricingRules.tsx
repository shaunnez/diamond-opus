import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, DollarSign, Star } from 'lucide-react';
import {
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  type PricingRule,
  type CreatePricingRuleInput,
  type UpdatePricingRuleInput,
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
} from '../components/ui';

const DIAMOND_SHAPES = [
  'Round', 'Princess', 'Cushion', 'Oval', 'Emerald', 'Pear',
  'Marquise', 'Radiant', 'Asscher', 'Heart'
];

interface RuleFormData {
  priority: string;
  carat_min: string;
  carat_max: string;
  shapes: string[];
  lab_grown: 'any' | 'true' | 'false';
  feed: string;
  markup_ratio: string;
  rating: string;
}

const emptyFormData: RuleFormData = {
  priority: '100',
  carat_min: '',
  carat_max: '',
  shapes: [],
  lab_grown: 'any',
  feed: '',
  markup_ratio: '1.15',
  rating: '',
};

export function PricingRules() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(emptyFormData);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pricing-rules'],
    queryFn: getPricingRules,
  });

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

  const handleOpenCreate = () => {
    setFormData(emptyFormData);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (rule: PricingRule) => {
    setFormData({
      priority: rule.priority.toString(),
      carat_min: rule.carat_min?.toString() ?? '',
      carat_max: rule.carat_max?.toString() ?? '',
      shapes: rule.shapes ?? [],
      lab_grown: rule.lab_grown === undefined ? 'any' : rule.lab_grown ? 'true' : 'false',
      feed: rule.feed ?? '',
      markup_ratio: rule.markup_ratio.toString(),
      rating: rule.rating?.toString() ?? '',
    });
    setEditingRule(rule);
  };

  const handleSubmit = () => {
    const input: CreatePricingRuleInput = {
      priority: parseInt(formData.priority, 10),
      markup_ratio: parseFloat(formData.markup_ratio),
    };

    if (formData.carat_min) input.carat_min = parseFloat(formData.carat_min);
    if (formData.carat_max) input.carat_max = parseFloat(formData.carat_max);
    if (formData.shapes.length > 0) input.shapes = formData.shapes;
    if (formData.lab_grown !== 'any') input.lab_grown = formData.lab_grown === 'true';
    if (formData.feed) input.feed = formData.feed;
    if (formData.rating) input.rating = parseInt(formData.rating, 10);

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, updates: input });
    } else {
      createMutation.mutate(input);
    }
  };

  const handleShapeToggle = (shape: string) => {
    setFormData((prev) => ({
      ...prev,
      shapes: prev.shapes.includes(shape)
        ? prev.shapes.filter((s) => s !== shape)
        : [...prev.shapes, shape],
    }));
  };

  const formatMarkup = (ratio: number) => {
    const percentage = (ratio - 1) * 100;
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`;
  };

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
                Manage pricing rules for diamond markup and rating
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

          {/* Info */}
          <Alert variant="info" title="How Pricing Rules Work">
            Rules are matched in order of priority (lower number = higher priority).
            The first matching rule is applied. If no rule matches, a default 15% markup is used.
          </Alert>

          {/* Rules Table */}
          <Card>
            <CardHeader
              title="Active Pricing Rules"
              subtitle={`${data?.total ?? 0} rules configured`}
            />
            {isLoading ? (
              <div className="p-8 text-center text-stone-500">Loading...</div>
            ) : error ? (
              <Alert variant="error" className="mt-4">
                Failed to load pricing rules
              </Alert>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">
                        Priority
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase">
                        Criteria
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase">
                        Markup
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase">
                        Rating
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {data?.rules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-stone-50">
                        <td className="px-4 py-3">
                          <Badge variant="neutral">{rule.priority}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {rule.carat_min !== undefined || rule.carat_max !== undefined ? (
                              <Badge variant="info">
                                {rule.carat_min ?? '0'} - {rule.carat_max ?? '∞'} ct
                              </Badge>
                            ) : null}
                            {rule.shapes && rule.shapes.length > 0 ? (
                              <Badge variant="info">
                                {rule.shapes.length === 1
                                  ? rule.shapes[0]
                                  : `${rule.shapes.length} shapes`}
                              </Badge>
                            ) : null}
                            {rule.lab_grown !== undefined ? (
                              <Badge variant={rule.lab_grown ? 'success' : 'warning'}>
                                {rule.lab_grown ? 'Lab Grown' : 'Natural'}
                              </Badge>
                            ) : null}
                            {rule.feed ? (
                              <Badge variant="neutral">{rule.feed}</Badge>
                            ) : null}
                            {rule.carat_min === undefined &&
                              rule.carat_max === undefined &&
                              !rule.shapes?.length &&
                              rule.lab_grown === undefined &&
                              !rule.feed && (
                                <span className="text-stone-400 text-sm italic">
                                  Matches all diamonds
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-stone-900 dark:text-stone-100">
                            <DollarSign className="w-4 h-4 text-success-500" />
                            {formatMarkup(rule.markup_ratio)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rule.rating ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-warning-600">
                              <Star className="w-4 h-4" />
                              {rule.rating}/10
                            </span>
                          ) : (
                            <span className="text-stone-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEdit(rule)}
                              className="p-1 text-stone-400 hover:text-primary-600 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingRuleId(rule.id)}
                              className="p-1 text-stone-400 hover:text-error-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {data?.rules.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                          No pricing rules configured. Add a rule to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || editingRule) && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-stone-200">
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
                  <p className="mt-1 text-xs text-stone-500">
                    Lower number = higher priority. Rules are evaluated in order.
                  </p>
                </div>

                {/* Carat Range */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Min Carats"
                    type="number"
                    step="0.01"
                    value={formData.carat_min}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, carat_min: e.target.value }))
                    }
                    placeholder="Leave empty for no minimum"
                  />
                  <Input
                    label="Max Carats"
                    type="number"
                    step="0.01"
                    value={formData.carat_max}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, carat_max: e.target.value }))
                    }
                    placeholder="Leave empty for no maximum"
                  />
                </div>

                {/* Shapes */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                    Shapes (leave empty to match all)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DIAMOND_SHAPES.map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => handleShapeToggle(shape)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          formData.shapes.includes(shape)
                            ? 'bg-primary-100 border-primary-300 text-primary-700'
                            : 'bg-white border-stone-200 text-stone-600 dark:text-stone-400 hover:border-primary-300'
                        }`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lab Grown */}
                <div>
                  <Select
                    label="Diamond Type"
                    value={formData.lab_grown}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        lab_grown: e.target.value as 'any' | 'true' | 'false',
                      }))
                    }
                    options={[
                      { value: 'any', label: 'Any (matches all)' },
                      { value: 'false', label: 'Natural only' },
                      { value: 'true', label: 'Lab Grown only' },
                    ]}
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
                  <p className="mt-1 text-xs text-stone-500">
                    Specific feed/supplier name to match
                  </p>
                </div>

                {/* Markup Ratio */}
                <div>
                  <Input
                    label="Markup Ratio"
                    type="number"
                    step="0.01"
                    value={formData.markup_ratio}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, markup_ratio: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    1.15 = 15% markup, 1.25 = 25% markup, etc.
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
              <div className="p-6 border-t border-stone-200 flex justify-end gap-3">
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
      </PageContainer>
    </>
  );
}
