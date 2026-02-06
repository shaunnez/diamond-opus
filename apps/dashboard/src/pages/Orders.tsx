import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, RefreshCw } from 'lucide-react';
import { getOrders, type PurchaseHistoryItem } from '../api/analytics';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  PageLoader,
  Alert,
  Pagination,
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
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', page],
    queryFn: () => getOrders(page, limit),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

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
        <Button variant="ghost" size="sm" onClick={() => refetch()} icon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
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
    </PageContainer>
  );
}
