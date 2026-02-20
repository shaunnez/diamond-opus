import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  getDiamondById,
  createCheckoutPurchase,
  updatePurchaseStripeSessionId,
} from '@diamond/database';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';
import type { TradingAdapter } from '@diamond/feed-registry';
import { validateBody, badRequest, notFound } from '../middleware/index.js';
import { createCheckoutSchema, type CreateCheckoutBody } from '../validators/index.js';
import { createCheckoutSession } from '../services/stripe.js';
import { getNzdRate } from '../services/currency.js';

const router = Router();

function getTradingAdapter(feedId: string): TradingAdapter {
  switch (feedId) {
    case 'nivoda-natural':
    case 'nivoda-labgrown':
      return new NivodaFeedAdapter({ feedVariant: feedId === 'nivoda-labgrown' ? 'labgrown' : 'natural' });
    case 'demo':
      return new DemoFeedAdapter();
    default:
      throw badRequest(`Trading is not supported for feed: ${feedId}`);
  }
}

/**
 * POST /api/v2/checkout/create
 * Creates a Stripe Checkout session for a diamond purchase.
 * Returns { checkoutUrl, orderNumber }.
 */
router.post(
  '/create',
  validateBody(createCheckoutSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateCheckoutBody;

      const diamond = await getDiamondById(body.diamond_id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      if (diamond.availability !== 'available') {
        throw badRequest('Diamond is not available for purchase');
      }

      const adapter = getTradingAdapter(diamond.feed);
      const availability = await adapter.checkAvailability(diamond);
      if (!availability?.available) {
        throw badRequest('Diamond is not available for purchase');
      }

      // Compute NZD amount server-side — client never sends price
      const rate = getNzdRate();
      const priceUsd = diamond.priceModelPrice ?? diamond.feedPrice;
      const priceNzd = rate !== null ? Math.round(priceUsd * rate * 100) / 100 : null;

      if (!priceNzd) {
        throw badRequest('NZD pricing is not available for this diamond');
      }

      const amountCents = Math.round(priceNzd * 100);
      const idempotencyKey = `stripe-${diamond.id}-${Date.now()}`;

      // Step 1: Create purchase record — this generates the order number via DB sequence
      const purchase = await createCheckoutPurchase({
        diamondId: diamond.id,
        feed: diamond.feed,
        offerId: diamond.offerId,
        idempotencyKey,
        amountCents,
        currency: 'nzd',
        reference: body.reference,
        comments: body.comments,
      });

      const storefrontUrl = process.env.STOREFRONT_URL ?? 'http://localhost:5174';
      const description = `${diamond.shape} ${diamond.carats}ct Diamond`;

      // Step 2: Create Stripe Checkout Session using the generated order number
      const session = await createCheckoutSession({
        orderNumber: purchase.orderNumber!,
        purchaseId: purchase.id,
        diamondId: diamond.id,
        description,
        amountCents,
        currency: 'nzd',
        successUrl: `${storefrontUrl}/checkout/success?order=${purchase.orderNumber}`,
        cancelUrl: `${storefrontUrl}/diamonds/${diamond.id}`,
      });

      // Step 3: Update purchase with the Stripe session ID
      await updatePurchaseStripeSessionId(purchase.id, session.id);

      res.json({
        data: {
          checkoutUrl: session.url,
          orderNumber: purchase.orderNumber,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
