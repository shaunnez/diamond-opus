import { useState } from 'react';
import { Shield, ShoppingCart, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Tooltip } from '../ui/Tooltip';
import { useDiamondActions } from '../../hooks/useDiamondActions';
import { formatCarats } from '../../utils/format';
import type { Diamond } from '../../types/diamond';

interface DiamondActionsProps {
  diamond: Diamond;
}

export function DiamondActions({ diamond }: DiamondActionsProps) {
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [cancelHoldModalOpen, setCancelHoldModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);

  const actions = useDiamondActions(diamond.id);
  const isDemo = diamond.feed === 'demo';
  const isNivoda = diamond.feed === 'nivoda';
  const isAvailable = diamond.availability === 'available';
  const isOnHold = diamond.availability === 'on_hold';
  const supportsAvailabilityCheck = isDemo || isNivoda;

  const clearMessages = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setAvailabilityMessage(null);
  };

  const handleHold = async () => {
    clearMessages();
    try {
      const result = await actions.hold.mutateAsync();
      if (result.denied) {
        setErrorMessage('Hold was denied. The diamond may no longer be available.');
      } else {
        setSuccessMessage(
          result.until
            ? `Diamond placed on hold until ${new Date(result.until).toLocaleDateString()}`
            : 'Diamond placed on hold successfully'
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to place hold');
    }
  };

  const handlePurchase = async () => {
    clearMessages();
    setPurchaseModalOpen(false);
    try {
      await actions.purchase.mutateAsync(undefined);
      setSuccessMessage('Purchase order created successfully');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create purchase order');
    }
  };

  const handleCancelHold = async () => {
    clearMessages();
    setCancelHoldModalOpen(false);
    if (!diamond.holdId) return;
    try {
      await actions.cancelHold.mutateAsync(diamond.holdId);
      setSuccessMessage('Hold cancelled successfully');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to cancel hold');
    }
  };

  const handleCheckAvailability = async () => {
    clearMessages();
    try {
      const result = await actions.checkAvailability.mutateAsync();
      if (result.available) {
        setAvailabilityMessage('Diamond is available for purchase');
      } else {
        setAvailabilityMessage(
          result.message || `Diamond is ${result.status.replace('_', ' ')}`
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to check availability');
    }
  };

  const isActing =
    actions.hold.isPending ||
    actions.purchase.isPending ||
    actions.cancelHold.isPending ||
    actions.checkAvailability.isPending;

  return (
    <div className="space-y-3">
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="px-4 py-3 bg-success/10 border border-success/20 text-success text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="px-4 py-3 bg-sold/10 border border-sold/20 text-sold text-sm">
          {errorMessage}
        </div>
      )}
      {availabilityMessage && (
        <div className="px-4 py-3 bg-primary/10 border border-primary/20 text-primary text-sm">
          {availabilityMessage}
        </div>
      )}

      {/* Check Availability Button */}
      {supportsAvailabilityCheck && (
        <Button
          variant="secondary"
          onClick={handleCheckAvailability}
          disabled={isActing}
          className="flex items-center justify-center gap-2 w-full"
        >
          {actions.checkAvailability.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Check Live Availability
        </Button>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Hold Button */}
        {isAvailable && (
          isDemo ? (
            <Button
              variant="secondary"
              onClick={handleHold}
              disabled={isActing}
              className="flex items-center justify-center gap-2 flex-1"
            >
              {actions.hold.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              Place on Hold
            </Button>
          ) : (
            <Tooltip content="Not enabled for this feed">
              <Button
                variant="secondary"
                disabled
                className="flex items-center justify-center gap-2 flex-1 w-full"
              >
                <Shield className="w-4 h-4" />
                Place on Hold
              </Button>
            </Tooltip>
          )
        )}

        {/* Purchase Button */}
        {(isAvailable || isOnHold) && (
          isDemo ? (
            <Button
              variant="primary"
              onClick={() => { clearMessages(); setPurchaseModalOpen(true); }}
              disabled={isActing}
              className="flex items-center justify-center gap-2 flex-1"
            >
              {actions.purchase.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
              Purchase
            </Button>
          ) : (
            <Tooltip content="Not enabled for this feed">
              <Button
                variant="primary"
                disabled
                className="flex items-center justify-center gap-2 flex-1 w-full"
              >
                <ShoppingCart className="w-4 h-4" />
                Purchase
              </Button>
            </Tooltip>
          )
        )}

        {/* Cancel Hold Button */}
        {isOnHold && diamond.holdId && (
          isDemo ? (
            <Button
              variant="danger"
              onClick={() => { clearMessages(); setCancelHoldModalOpen(true); }}
              disabled={isActing}
              className="flex items-center justify-center gap-2 flex-1"
            >
              {actions.cancelHold.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Cancel Hold
            </Button>
          ) : (
            <Tooltip content="Not enabled for this feed">
              <Button
                variant="danger"
                disabled
                className="flex items-center justify-center gap-2 flex-1 w-full"
              >
                <XCircle className="w-4 h-4" />
                Cancel Hold
              </Button>
            </Tooltip>
          )
        )}
      </div>

      {/* Sold / Unavailable state */}
      {diamond.availability === 'sold' && (
        <div className="px-4 py-3 bg-sold/10 border border-sold/20 text-sold text-sm text-center font-medium">
          This diamond has been sold
        </div>
      )}
      {diamond.availability === 'unavailable' && (
        <div className="px-4 py-3 bg-warm-gray-400/10 border border-warm-gray-400/20 text-warm-gray-500 text-sm text-center font-medium">
          This diamond is currently unavailable
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      <Modal
        open={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        title="Confirm Purchase"
      >
        <p className="text-sm text-warm-gray-500 mb-6">
          Are you sure you want to purchase this {diamond.shape} {formatCarats(diamond.carats)} diamond?
          This action will create a purchase order.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setPurchaseModalOpen(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handlePurchase} className="flex-1">
            Confirm Purchase
          </Button>
        </div>
      </Modal>

      {/* Cancel Hold Confirmation Modal */}
      <Modal
        open={cancelHoldModalOpen}
        onClose={() => setCancelHoldModalOpen(false)}
        title="Cancel Hold"
      >
        <p className="text-sm text-warm-gray-500 mb-6">
          Are you sure you want to cancel the hold on this diamond? It will become available for others.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setCancelHoldModalOpen(false)}
            className="flex-1"
          >
            Keep Hold
          </Button>
          <Button variant="danger" onClick={handleCancelHold} className="flex-1">
            Cancel Hold
          </Button>
        </div>
      </Modal>
    </div>
  );
}
