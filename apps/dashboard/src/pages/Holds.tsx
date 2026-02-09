import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hand, XCircle, RefreshCw, Plus, Search } from 'lucide-react';
import { getHolds, type HoldHistoryItem } from '../api/analytics';
import { cancelHold, placeHold, getDiamondByOfferId } from '../api/nivoda';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  PageLoader,
  Alert,
  Pagination,
  ConfirmModal,
  Modal,
  Input,
  useToast,
} from '../components/ui';
import { formatRelativeTime, truncateId } from '../utils/formatters';

function HoldStatusBadge({ status, denied }: { status: string; denied: boolean }) {
  if (denied) {
    return <span className="badge-error">Denied</span>;
  }
  switch (status) {
    case 'active':
      return <span className="badge-success">Active</span>;
    case 'released':
      return <span className="badge-neutral">Released</span>;
    case 'expired':
      return <span className="badge-warning">Expired</span>;
    default:
      return <span className="badge-neutral">{status}</span>;
  }
}

export function Holds() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [cancellingHold, setCancellingHold] = useState<HoldHistoryItem | null>(null);
  const limit = 20;

  // Create hold modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [offerId, setOfferId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDiamond, setSelectedDiamond] = useState<any>(null);
  const [searchError, setSearchError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holds', page],
    queryFn: () => getHolds(page, limit),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const cancelMutation = useMutation({
    mutationFn: (holdId: string) => cancelHold(holdId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holds'] });
      setCancellingHold(null);
      addToast({ variant: 'success', title: 'Hold cancelled successfully' });
    },
    onError: (error: Error) => {
      addToast({
        variant: 'error',
        title: 'Failed to cancel hold',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  // Search diamond mutation
  const searchDiamondMutation = useMutation({
    mutationFn: async (id: string) => {
      return await getDiamondByOfferId(id);
    },
    onSuccess: (diamond: any) => {
      setSelectedDiamond(diamond);
      setSearchError('');
    },
    onError: (error: Error) => {
      setSearchError(error instanceof Error ? error.message : 'Diamond not found');
      setSelectedDiamond(null);
    },
  });

  // Create hold mutation
  const createHoldMutation = useMutation({
    mutationFn: async () => {
      if (!offerId.trim()) throw new Error('Offer ID is required');
      return await placeHold(offerId.trim());
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['holds'] });
      if (result.denied) {
        addToast({
          variant: 'warning',
          title: 'Hold was denied',
          message: result.message || 'The hold request was denied by Nivoda',
        });
      } else {
        addToast({
          variant: 'success',
          title: 'Hold created successfully',
          message: result.hold_id ? `Hold ID: ${result.hold_id}` : undefined,
        });
      }
      resetCreateForm();
      setIsCreateModalOpen(false);
    },
    onError: (error: Error) => {
      addToast({
        variant: 'error',
        title: 'Failed to create hold',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const handleSearchDiamond = () => {
    if (!offerId.trim()) {
      setSearchError('Please enter an Offer ID');
      return;
    }
    searchDiamondMutation.mutate(offerId.trim());
  };

  const handleCreateHold = () => {
    createHoldMutation.mutate();
  };

  const resetCreateForm = () => {
    setOfferId('');
    setReference('');
    setNotes('');
    setSelectedDiamond(null);
    setSearchError('');
  };

  if (isLoading) return <PageLoader />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Holds</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Diamond hold history tracked in Supabase
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} icon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
            Create Hold
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Failed to load holds" className="mb-6">
          {(error as Error).message}
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Hold History (${data?.pagination.total ?? 0} total)`}
          subtitle="Holds placed via Nivoda API"
        />

        {!data?.data.length ? (
          <div className="text-center py-12">
            <Hand className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
            <p className="text-stone-500 dark:text-stone-400">No holds recorded yet</p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Place a hold on the Nivoda page to see it here
            </p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hold ID</th>
                    <th>Diamond</th>
                    <th>Offer ID</th>
                    <th>Status</th>
                    <th>Nivoda Hold ID</th>
                    <th>Hold Until</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((hold: HoldHistoryItem) => (
                    <tr key={hold.id}>
                      <td className="font-mono text-xs">{truncateId(hold.id, 8)}</td>
                      <td className="font-mono text-xs">{truncateId(hold.diamondId, 8)}</td>
                      <td className="font-mono text-xs">{truncateId(hold.offerId, 12)}</td>
                      <td>
                        <HoldStatusBadge status={hold.status} denied={hold.denied} />
                      </td>
                      <td className="font-mono text-xs">
                        {hold.feedHoldId ? truncateId(hold.feedHoldId, 12) : '-'}
                      </td>
                      <td className="text-xs">
                        {hold.holdUntil ? new Date(hold.holdUntil).toLocaleString() : '-'}
                      </td>
                      <td className="text-xs">{formatRelativeTime(hold.createdAt)}</td>
                      <td>
                        {hold.status === 'active' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setCancellingHold(hold)}
                            icon={<XCircle className="w-3.5 h-3.5" />}
                          >
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pagination.totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={data.pagination.totalPages}
                total={data.pagination.total}
                limit={limit}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <ConfirmModal
        isOpen={!!cancellingHold}
        onClose={() => setCancellingHold(null)}
        onConfirm={() => cancellingHold && cancelMutation.mutate(cancellingHold.id)}
        title="Cancel Hold"
        message={`Are you sure you want to cancel this hold? The diamond will be released back to available.`}
        confirmText="Cancel Hold"
        variant="danger"
        loading={cancelMutation.isPending}
      />

      {cancelMutation.isError && (
        <Alert variant="error" title="Failed to cancel hold" className="mt-4">
          {(cancelMutation.error as Error).message}
        </Alert>
      )}

      {/* Create Hold Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          resetCreateForm();
        }}
        title="Create Hold"
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateModalOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateHold}
              loading={createHoldMutation.isPending}
              disabled={!offerId.trim()}
            >
              Create Hold
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert variant="info" title="Create a hold on Nivoda">
            Enter an Offer ID to place a hold on a diamond. You can optionally search for the
            diamond details first to verify it's the correct one.
          </Alert>

          {/* Offer ID Input with Search */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
              Offer ID *
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter Nivoda Offer ID"
                value={offerId}
                onChange={(e) => {
                  setOfferId(e.target.value);
                  setSearchError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchDiamond();
                  }
                }}
              />
              <Button
                variant="secondary"
                onClick={handleSearchDiamond}
                loading={searchDiamondMutation.isPending}
                icon={<Search className="w-4 h-4" />}
              >
                Verify
              </Button>
            </div>
            {searchError && (
              <p className="mt-1 text-sm text-error-600 dark:text-error-400">{searchError}</p>
            )}
          </div>

          {/* Selected Diamond Display */}
          {selectedDiamond && (
            <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Hand className="w-5 h-5 text-success-600 dark:text-success-400" />
                <h3 className="font-semibold text-success-900 dark:text-success-300">
                  Diamond Found
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-success-700 dark:text-success-400 font-medium">
                    Offer ID:
                  </span>
                  <p className="font-mono text-success-900 dark:text-success-200">
                    {selectedDiamond.id}
                  </p>
                </div>
                {selectedDiamond.supplierStoneId && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Supplier Stone ID:
                    </span>
                    <p className="font-mono text-success-900 dark:text-success-200">
                      {selectedDiamond.supplierStoneId}
                    </p>
                  </div>
                )}
                {selectedDiamond.shape && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Shape:
                    </span>
                    <p className="text-success-900 dark:text-success-200">
                      {selectedDiamond.shape}
                    </p>
                  </div>
                )}
                {selectedDiamond.carat && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Carat:
                    </span>
                    <p className="text-success-900 dark:text-success-200">
                      {selectedDiamond.carat}
                    </p>
                  </div>
                )}
                {selectedDiamond.color && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Color:
                    </span>
                    <p className="text-success-900 dark:text-success-200">
                      {selectedDiamond.color}
                    </p>
                  </div>
                )}
                {selectedDiamond.clarity && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Clarity:
                    </span>
                    <p className="text-success-900 dark:text-success-200">
                      {selectedDiamond.clarity}
                    </p>
                  </div>
                )}
                {selectedDiamond.availability && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Availability:
                    </span>
                    <p className="text-success-900 dark:text-success-200">
                      {selectedDiamond.availability}
                    </p>
                  </div>
                )}
                {selectedDiamond.price && (
                  <div>
                    <span className="text-success-700 dark:text-success-400 font-medium">
                      Price:
                    </span>
                    <p className="text-success-900 dark:text-success-200">
                      ${selectedDiamond.price.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reference */}
          <Input
            label="Reference (optional)"
            placeholder="e.g., Client-123, Quote-456"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Add any additional notes about this hold..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {createHoldMutation.isError && (
            <Alert variant="error" title="Failed to create hold">
              {(createHoldMutation.error as Error).message}
            </Alert>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
}
