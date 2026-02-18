import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hand,  RefreshCw} from 'lucide-react';
import { getHolds, type HoldHistoryItem } from '../api/analytics';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  PageLoader,
  Alert,
  Pagination
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
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holds', page],
    queryFn: () => getHolds(page, limit),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });


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
