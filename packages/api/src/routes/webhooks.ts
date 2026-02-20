import { Router } from 'express';
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import {
  getDiamondById,
  getPurchaseByStripeSessionId,
  updatePurchasePaymentCompleted,
  updatePurchaseFeedOrderSuccess,
  updatePurchaseFeedOrderFailed,
  updatePurchaseExpired,
  updateDiamondAvailability,
} from '@diamond/database';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';
import type { TradingAdapter } from '@diamond/feed-registry';
import { constructWebhookEvent } from '../services/stripe.js';
import { notify, NotifyCategory } from '@diamond/shared';

const router = Router();

function getTradingAdapter(feedId: string): TradingAdapter {
  switch (feedId) {
    case 'nivoda-natural':
    case 'nivoda-labgrown':
      return new NivodaFeedAdapter({ feedVariant: feedId === 'nivoda-labgrown' ? 'labgrown' : 'natural' });
    case 'demo':
      return new DemoFeedAdapter();
    default:
      throw new Error(`Trading is not supported for feed: ${feedId}`);
  }
}

/**
 * POST /api/v2/webhooks/stripe
 * Stripe webhook — no API key auth, uses Stripe signature verification.
 * Always returns 200 so Stripe doesn't retry unnecessarily.
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];

  if (!signature || !req.rawBody) {
    res.status(400).json({ error: 'Missing stripe-signature header or raw body' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(req.rawBody, signature as string);
  } catch (err) {
    console.error('[webhooks] Invalid Stripe signature', err instanceof Error ? err.message : err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const purchase = await getPurchaseByStripeSessionId(session.id);
        if (!purchase || purchase.status === 'confirmed') {
          // Already processed or unknown session — idempotent success
          break;
        }

        await updatePurchasePaymentCompleted(
          purchase.id,
          (session.payment_intent as string) ?? ''
        );

        const diamond = await getDiamondById(purchase.diamondId);
        if (!diamond) {
          await notify({
            category: NotifyCategory.ORDER_FEED_FAILURE,
            title: 'Feed Order Failed After Payment',
            message: `Payment succeeded for ${purchase.orderNumber} but diamond not found. Manual intervention required.`,
            context: {
              orderNumber: purchase.orderNumber ?? purchase.id,
              diamondId: purchase.diamondId,
              feed: purchase.feed,
            },
          });
          break;
        }

        try {
          const adapter = getTradingAdapter(diamond.feed);
          const result = await adapter.createOrder(diamond, {
            reference: purchase.orderNumber,
            comments: purchase.comments,
          });
          await updatePurchaseFeedOrderSuccess(purchase.id, result.id);
          await updateDiamondAvailability(diamond.id, 'sold');
          await notify({
            category: NotifyCategory.ORDER_COMPLETED,
            title: 'Order Completed',
            message: `Order ${purchase.orderNumber} confirmed.`,
            context: {
              orderNumber: purchase.orderNumber ?? purchase.id,
              feed: diamond.feed,
            },
          });
        } catch (feedError) {
          await updatePurchaseFeedOrderFailed(
            purchase.id,
            feedError instanceof Error ? feedError.message : String(feedError)
          );
          await notify({
            category: NotifyCategory.ORDER_FEED_FAILURE,
            title: 'Feed Order Failed After Payment',
            message: `Payment succeeded for ${purchase.orderNumber} but feed order failed. Manual intervention required.`,
            context: {
              orderNumber: purchase.orderNumber ?? purchase.id,
              diamondId: purchase.diamondId,
              feed: purchase.feed,
              offerId: purchase.offerId,
            },
            error: feedError,
          });
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const purchase = await getPurchaseByStripeSessionId(session.id);
        if (purchase) {
          await updatePurchaseExpired(purchase.id);
        }
        break;
      }

      default:
        // Unhandled event type — return 200 and ignore
        break;
    }
  } catch (err) {
    // Log but still return 200 — Stripe should not retry on internal errors
    console.error('[webhooks] Error processing Stripe webhook', err);
  }

  res.status(200).json({ received: true });
});

export default router;
