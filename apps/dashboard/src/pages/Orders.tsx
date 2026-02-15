import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, RefreshCw, Plus, ShoppingCart, XCircle, Search } from 'lucide-react';
import { getOrders, type PurchaseHistoryItem } from '../api/analytics';
import { createOrder, cancelOrder, searchDiamonds, type DiamondSummary } from '../api/trading';
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

function OrderStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'confirmed':
      return <span className="badge-success">Confirmed</span>;
    case 'pending':
      return <span className="badge-warning">Pending</span>;
    case 'failed':
      return <span className="badge-error">Failed</span>;
    case 'cancelled':
      return <span className="badge-neutral">Cancelled</span>;
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

export function Orders() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<PurchaseHistoryItem | null>(null);
  const limit = 20;

  // Create order modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DiamondSummary[]>([]);
  const [selectedDiamond, setSelectedDiamond] = useState<DiamondSummary | null>(null);
  const [searchError, setSearchError] = useState('');
  const [reference, setReference] = useState('');
  const [comments, setComments] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', page],
    queryFn: () => getOrders(page, limit),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
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

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDiamond) throw new Error('Please select a diamond');
      return createOrder({
        diamond_id: selectedDiamond.id,
        reference: reference || undefined,
        comments: comments || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      closeCreateModal();
      addToast({ variant: 'success', title: 'Order created successfully' });
    },
    onError: (err) => {
      addToast({
        variant: 'error',
        title: 'Failed to create order',
        message: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCancellingOrder(null);
      addToast({ variant: 'success', title: 'Order cancelled successfully' });
    },
    onError: (err: Error) => {
      addToast({
        variant: 'error',
        title: 'Failed to cancel order',
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

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedDiamond(null);
    setSearchError('');
    setReference('');
    setComments('');
    createOrderMutation.reset();
  };

  if (isLoading) return <PageLoader />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Orders</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Purchase history across all feeds
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} icon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
            Create Order
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Failed to load orders" className="mb-6">
          {(error as Error).message}
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Purchase History (${data?.pagination.total ?? 0} total)`}
          subtitle="Orders placed across all feeds"
        />

        {!data?.data.length ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
            <p className="text-stone-500 dark:text-stone-400">No orders recorded yet</p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Create an order to see it here
            </p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Feed</th>
                    <th>Diamond</th>
                    <th>Offer ID</th>
                    <th>Status</th>
                    <th>Feed Order ID</th>
                    <th>Reference</th>
                    <th>Comments</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((order: PurchaseHistoryItem) => (
                    <tr key={order.id}>
                      <td className="font-mono text-xs">{truncateId(order.id, 8)}</td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                          {order.feed}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{truncateId(order.diamondId, 8)}</td>
                      <td className="font-mono text-xs">{truncateId(order.offerId, 12)}</td>
                      <td>
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="font-mono text-xs">
                        {order.feedOrderId ? truncateId(order.feedOrderId, 12) : '-'}
                      </td>
                      <td className="text-xs">{order.reference || '-'}</td>
                      <td className="text-xs max-w-[200px] truncate">{order.comments || '-'}</td>
                      <td className="text-xs">{formatRelativeTime(order.createdAt)}</td>
                      <td>
                        {(order.status === 'pending' || order.status === 'confirmed') && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setCancellingOrder(order)}
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
        isOpen={!!cancellingOrder}
        onClose={() => setCancellingOrder(null)}
        onConfirm={() => cancellingOrder && cancelOrderMutation.mutate(cancellingOrder.id)}
        title="Cancel Order"
        message="Are you sure you want to cancel this order? The diamond will be restored to available."
        confirmText="Cancel Order"
        variant="danger"
        loading={cancelOrderMutation.isPending}
      />

      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title="Create Order"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => createOrderMutation.mutate()}
              loading={createOrderMutation.isPending}
              disabled={!selectedDiamond}
              icon={<ShoppingCart className="w-4 h-4" />}
            >
              Create Order
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert variant="info" title="Find a diamond to order">
            Search by stock ID, certificate number, or offer ID to find the diamond you want to order.
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

          {/* Selected Diamond */}
          {selectedDiamond && (
            <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-5 h-5 text-success-600 dark:text-success-400" />
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
              </div>
            </div>
          )}

          <Input
            label="Reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Your internal order reference"
          />
          <Input
            label="Comments (optional)"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Order notes or comments"
          />
          {createOrderMutation.isError && (
            <Alert variant="error" title="Failed to create order">
              {createOrderMutation.error instanceof Error
                ? createOrderMutation.error.message
                : 'An unknown error occurred'}
            </Alert>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
}
