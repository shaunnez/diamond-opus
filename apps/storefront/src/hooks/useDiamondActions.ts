import { useMutation, useQueryClient } from '@tanstack/react-query';
import { placeDiamondHold, purchaseDiamond, cancelDiamondHold, checkAvailability } from '../api/diamonds';

export function useDiamondActions(diamondId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['diamond', diamondId] });
    queryClient.invalidateQueries({ queryKey: ['diamonds'] });
  };

  const holdMutation = useMutation({
    mutationFn: () => placeDiamondHold(diamondId),
    onSuccess: invalidate,
  });

  const purchaseMutation = useMutation({
    mutationFn: (options?: { reference?: string; comments?: string, destination_id: string }) => {
      const idempotencyKey = `purchase-${diamondId}-${Date.now()}`;
      return purchaseDiamond(idempotencyKey, options);
    },
    onSuccess: invalidate,
  });

  const cancelHoldMutation = useMutation({
    mutationFn: () => cancelDiamondHold(diamondId),
    onSuccess: invalidate,
  });

  const availabilityMutation = useMutation({
    mutationFn: () => checkAvailability(diamondId),
  });

  return {
    hold: holdMutation,
    purchase: purchaseMutation,
    cancelHold: cancelHoldMutation,
    checkAvailability: availabilityMutation,
  };
}
