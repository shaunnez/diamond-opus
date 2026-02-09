import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hand, XCircle, RefreshCw, Plus } from 'lucide-react';
import { getHolds, type HoldHistoryItem } from '../api/analytics';
import { cancelHold, placeHold } from '../api/nivoda';
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

export function Holds() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [cancellingHold, setCancellingHold] = useState<HoldHistoryItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [holdOfferId, setHoldOfferId] = useState('');
  const limit = 20;

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
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to cancel hold',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const createHoldMutation = useMutation({
    mutationFn: (offerId: string) => placeHold(offerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holds'] });
      setShowCreateModal(false);
      setHoldOfferId('');
      addToast({ variant: 'success', title: 'Hold placed successfully' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to place hold',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

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
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} icon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
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

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setHoldOfferId('');
          createHoldMutation.reset();
        }}
        title="Create Hold"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setHoldOfferId('');
                createHoldMutation.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => createHoldMutation.mutate(holdOfferId)}
              loading={createHoldMutation.isPending}
              disabled={!holdOfferId.trim()}
              icon={<Hand className="w-4 h-4" />}
            >
              Place Hold
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Place a hold on a diamond using its Nivoda offer ID. The diamond must exist in the local database.
          </p>
          <Input
            label="Offer ID"
            value={holdOfferId}
            onChange={(e) => setHoldOfferId(e.target.value)}
            placeholder="Enter the Nivoda offer ID"
          />
          {createHoldMutation.isError && (
            <Alert variant="error" title="Failed to place hold">
              {createHoldMutation.error instanceof Error
                ? createHoldMutation.error.message
                : 'An unknown error occurred'}
            </Alert>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
}
