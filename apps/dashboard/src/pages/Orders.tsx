import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, RefreshCw} from 'lucide-react';
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
    case 'paid':
      return <span className="badge-success">Paid</span>;
    case 'pending_payment':
      return <span className="badge-warning">Pending Payment</span>;
    case 'pending':
      return <span className="badge-warning">Pending</span>;
    case 'expired':
      return <span className="badge-neutral">Expired</span>;
    case 'failed':
      return <span className="badge-error">Failed</span>;
    case 'cancelled':
      return <span className="badge-neutral">Cancelled</span>;
    default:
      return <span className="badge-neutral">{status}</span>;
  }
}

function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'paid':
      return <span className="badge-success">Paid</span>;
    case 'pending':
      return <span className="badge-warning">Pending</span>;
    case 'expired':
    case 'failed':
      return <span className="badge-error">{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
    case 'refunded':
      return <span className="badge-neutral">Refunded</span>;
    default:
      return <span className="badge-neutral">{status}</span>;
  }
}

function FeedOrderStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <span className="badge-success">Success</span>;
    case 'pending':
      return <span className="badge-warning">Pending</span>;
    case 'failed':
      return <span className="badge-error">Failed</span>;
    case 'not_attempted':
      return <span className="badge-neutral">N/A</span>;
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
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });


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
                    <th>Order #</th>
                    <th>Feed</th>
                    <th>Diamond</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Feed Order</th>
                    <th>Status</th>
                    <th>Feed Order ID</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((order: PurchaseHistoryItem) => (
                    <tr
                      key={order.id}
                      className={
                        order.paymentStatus === 'paid' && order.feedOrderStatus === 'failed'
                          ? 'bg-red-50 dark:bg-red-950/20 border-l-4 border-l-red-400'
                          : ''
                      }
                    >
                      <td className="font-mono text-xs">
                        {order.orderNumber ?? truncateId(order.id, 8)}
                      </td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                          {order.feed}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{truncateId(order.diamondId, 8)}</td>
                      <td className="text-xs">
                        {order.amountCents != null
                          ? `$${(order.amountCents / 100).toLocaleString()} ${(order.currency ?? 'NZD').toUpperCase()}`
                          : '-'}
                      </td>
                      <td>
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </td>
                      <td>
                        <FeedOrderStatusBadge status={order.feedOrderStatus} />
                      </td>
                      <td>
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="font-mono text-xs">
                        {order.feedOrderId ? truncateId(order.feedOrderId, 12) : '-'}
                      </td>
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
