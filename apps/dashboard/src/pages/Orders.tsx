import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, RefreshCw, Plus, ShoppingCart } from 'lucide-react';
import { getOrders, type PurchaseHistoryItem } from '../api/analytics';
import { createOrder, type CreateOrderOptions } from '../api/nivoda';
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
    default:
      return <span className="badge-neutral">{status}</span>;
  }
}

export function Orders() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orderForm, setOrderForm] = useState<CreateOrderOptions>({
    offer_id: '',
    destination_id: '',
    reference: '',
    comments: '',
  });
  const limit = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', page],
    queryFn: () => getOrders(page, limit),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const createOrderMutation = useMutation({
    mutationFn: (options: CreateOrderOptions) => createOrder(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShowCreateModal(false);
      setOrderForm({ offer_id: '', destination_id: '', reference: '', comments: '' });
      addToast({ variant: 'success', title: 'Order created successfully' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to create order',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const handleCreateOrder = () => {
    createOrderMutation.mutate({
      offer_id: orderForm.offer_id,
      destination_id: orderForm.destination_id || undefined,
      reference: orderForm.reference || undefined,
      comments: orderForm.comments || undefined,
    });
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setOrderForm({ offer_id: '', destination_id: '', reference: '', comments: '' });
    createOrderMutation.reset();
  };

  if (isLoading) return <PageLoader />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Orders</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Purchase history tracked in Supabase
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
          subtitle="Orders placed via Nivoda API"
        />

        {!data?.data.length ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
            <p className="text-stone-500 dark:text-stone-400">No orders recorded yet</p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Create an order on the Nivoda page to see it here
            </p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Diamond</th>
                    <th>Offer ID</th>
                    <th>Status</th>
                    <th>Nivoda Order ID</th>
                    <th>Reference</th>
                    <th>Comments</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((order: PurchaseHistoryItem) => (
                    <tr key={order.id}>
                      <td className="font-mono text-xs">{truncateId(order.id, 8)}</td>
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

      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title="Create Order"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateOrder}
              loading={createOrderMutation.isPending}
              disabled={!orderForm.offer_id.trim()}
              icon={<ShoppingCart className="w-4 h-4" />}
            >
              Create Order
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Create a purchase order for a diamond using its Nivoda offer ID. The diamond must exist in the local database.
          </p>
          <Input
            label="Offer ID"
            value={orderForm.offer_id}
            onChange={(e) => setOrderForm((prev) => ({ ...prev, offer_id: e.target.value }))}
            placeholder="Enter the Nivoda offer ID"
          />
          <Input
            label="Destination ID (optional)"
            value={orderForm.destination_id ?? ''}
            onChange={(e) => setOrderForm((prev) => ({ ...prev, destination_id: e.target.value }))}
            placeholder="Your Nivoda destination ID"
          />
          <Input
            label="Reference (optional)"
            value={orderForm.reference ?? ''}
            onChange={(e) => setOrderForm((prev) => ({ ...prev, reference: e.target.value }))}
            placeholder="Your internal order reference"
          />
          <Input
            label="Comments (optional)"
            value={orderForm.comments ?? ''}
            onChange={(e) => setOrderForm((prev) => ({ ...prev, comments: e.target.value }))}
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
