import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hand, XCircle, RefreshCw, Plus, Search } from 'lucide-react';
import { getHolds, type HoldHistoryItem } from '../api/analytics';
import { placeHold, cancelHold, searchDiamonds, type DiamondSummary } from '../api/trading';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Input,
  PageLoader,
  Alert,
  Pagination,
  Modal,
  ConfirmModal,
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

function DiamondSearchResult({ diamond, selected, onSelect }: {
  diamond: DiamondSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-stone-200 dark:border-stone-700 hover:border-primary-300 dark:hover:border-primary-600'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
            {diamond.feed}
          </span>
          <span className="font-medium text-stone-900 dark:text-stone-100">
            {diamond.shape} {diamond.carats?.toFixed(2)}ct
          </span>
          <span className="text-stone-600 dark:text-stone-400">
            {diamond.color} {diamond.clarity}
          </span>
          {diamond.cut && <span className="text-stone-500 dark:text-stone-500 text-sm">{diamond.cut}</span>}
        </div>
        <span className="font-semibold text-stone-900 dark:text-stone-100">
          ${diamond.feedPrice?.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-stone-500 dark:text-stone-400">
        <span>ID: {truncateId(diamond.supplierStoneId, 16)}</span>
        {diamond.certificateNumber && <span>Cert: {diamond.certificateNumber}</span>}
        {diamond.supplierName && <span>{diamond.supplierName}</span>}
        <span className={diamond.availability === 'available' ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'}>
          {diamond.availability}
        </span>
      </div>
    </button>
  );
}

export function Holds() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [cancellingHold, setCancellingHold] = useState<HoldHistoryItem | null>(null);
  const limit = 20;

  // Create hold modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DiamondSummary[]>([]);
  const [selectedDiamond, setSelectedDiamond] = useState<DiamondSummary | null>(null);
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
    onError: (err: Error) => {
      addToast({
        variant: 'error',
        title: 'Failed to cancel hold',
        message: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    },
  });

  // Search diamonds mutation
  const searchMutation = useMutation({
    mutationFn: async (q: string) => searchDiamonds(q, 8),
    onSuccess: (results) => {
      setSearchResults(results);
      setSearchError(results.length === 0 ? 'No diamonds found' : '');
    },
    onError: (err: Error) => {
      setSearchError(err.message || 'Search failed');
      setSearchResults([]);
    },
  });

  // Create hold mutation
  const createHoldMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDiamond) throw new Error('Please select a diamond');
      return await placeHold(selectedDiamond.id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['holds'] });
      if (result.denied) {
        addToast({
          variant: 'warning',
          title: 'Hold was denied',
          message: result.message || 'The hold request was denied',
        });
      } else {
        addToast({
          variant: 'success',
          title: 'Hold created successfully',
          message: result.hold_id ? `Hold ID: ${truncateId(result.hold_id, 12)}` : undefined,
        });
      }
      resetCreateForm();
      setIsCreateModalOpen(false);
    },
    onError: (err: Error) => {
      addToast({
        variant: 'error',
        title: 'Failed to create hold',
        message: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    },
  });

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setSearchError('Please enter a stock ID, cert number, or offer ID');
      return;
    }
    searchMutation.mutate(searchQuery.trim());
  }, [searchQuery, searchMutation]);

  const resetCreateForm = () => {
    setSearchQuery('');
    setSearchResults([]);
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
            Diamond hold history across all feeds
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
          subtitle="Holds placed across all feeds"
        />

        {!data?.data.length ? (
          <div className="text-center py-12">
            <Hand className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
            <p className="text-stone-500 dark:text-stone-400">No holds recorded yet</p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Place a hold on a diamond to see it here
            </p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hold ID</th>
                    <th>Feed</th>
                    <th>Diamond</th>
                    <th>Offer ID</th>
                    <th>Status</th>
                    <th>Feed Hold ID</th>
                    <th>Hold Until</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((hold: HoldHistoryItem) => (
                    <tr key={hold.id}>
                      <td className="font-mono text-xs">{truncateId(hold.id, 8)}</td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                          {hold.feed}
                        </span>
                      </td>
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
        message="Are you sure you want to cancel this hold? The diamond will be released back to available."
        confirmText="Cancel Hold"
        variant="danger"
        loading={cancelMutation.isPending}
      />

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
              onClick={() => createHoldMutation.mutate()}
              loading={createHoldMutation.isPending}
              disabled={!selectedDiamond}
            >
              Create Hold
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert variant="info" title="Find a diamond to hold">
            Search by stock ID, certificate number, or offer ID to find the diamond you want to place a hold on.
          </Alert>

          {/* Diamond Search */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
              Search Diamond
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="Stock ID, cert number, or offer ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
              />
              <Button
                variant="secondary"
                onClick={handleSearch}
                loading={searchMutation.isPending}
                icon={<Search className="w-4 h-4" />}
              >
                Search
              </Button>
            </div>
            {searchError && (
              <p className="mt-1 text-sm text-error-600 dark:text-error-400">{searchError}</p>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {searchResults.map((diamond) => (
                <DiamondSearchResult
                  key={diamond.id}
                  diamond={diamond}
                  selected={selectedDiamond?.id === diamond.id}
                  onSelect={() => setSelectedDiamond(diamond)}
                />
              ))}
            </div>
          )}

          {/* Selected Diamond Detail */}
          {selectedDiamond && (
            <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Hand className="w-5 h-5 text-success-600 dark:text-success-400" />
                <h3 className="font-semibold text-success-900 dark:text-success-300">
                  Selected: {selectedDiamond.shape} {selectedDiamond.carats?.toFixed(2)}ct {selectedDiamond.color} {selectedDiamond.clarity}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-success-700 dark:text-success-400 font-medium">Feed:</span>{' '}
                  <span className="text-success-900 dark:text-success-200">{selectedDiamond.feed}</span>
                </div>
                <div>
                  <span className="text-success-700 dark:text-success-400 font-medium">Price:</span>{' '}
                  <span className="text-success-900 dark:text-success-200">${selectedDiamond.feedPrice?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-success-700 dark:text-success-400 font-medium">Stock ID:</span>{' '}
                  <span className="font-mono text-success-900 dark:text-success-200">{selectedDiamond.supplierStoneId}</span>
                </div>
                <div>
                  <span className="text-success-700 dark:text-success-400 font-medium">Status:</span>{' '}
                  <span className="text-success-900 dark:text-success-200">{selectedDiamond.availability}</span>
                </div>
              </div>
            </div>
          )}

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
