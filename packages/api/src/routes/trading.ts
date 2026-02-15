import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { TradingAdapter } from '@diamond/feed-registry';
import { NivodaFeedAdapter } from '@diamond/nivoda';
import { DemoFeedAdapter } from '@diamond/demo-feed';
import { badRequest } from '../middleware/index.js';
import {
  getDiamondById,
  quickSearchDiamonds,
  createHoldHistory,
  updateDiamondAvailability,
  createPurchaseHistory,
  updatePurchaseStatus,
  getHoldById,
  updateHoldStatus,
  getPurchaseById,
  insertErrorLog,
} from '@diamond/database';
import type { Diamond } from '@diamond/shared';

const router = Router();

/**
 * Returns a TradingAdapter for the given feed.
 */
function getTradingAdapter(feedId: string): TradingAdapter {
  switch (feedId) {
    case 'nivoda':
      return new NivodaFeedAdapter();
    case 'demo':
      return new DemoFeedAdapter();
    default:
      throw badRequest(`Trading is not supported for feed: ${feedId}`);
  }
}

// ============================================================================
// Diamond lookup
// ============================================================================

/**
 * @openapi
 * /api/v2/trading/diamonds/{id}/check-availability:
 *   get:
 *     summary: Check live availability of a diamond from the feed source
 *     description: |
 *       Queries the upstream feed (Nivoda, demo, etc.) to get the current real-time
 *       availability status of a diamond. This checks the actual feed source,
 *       not just our cached database state.
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Internal diamond ID
 *     responses:
 *       200:
 *         description: Availability check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       enum: [available, on_hold, sold, unavailable]
 *                     message:
 *                       type: string
 *       404:
 *         description: Diamond not found
 *       500:
 *         description: Failed to check availability with feed
 */
router.get(
  '/diamonds/:id/check-availability',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const diamond = await getDiamondById(req.params.id) as Diamond | null;
      if (!diamond) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Diamond not found' } });
        return;
      }

      const adapter = getTradingAdapter(diamond.feed);
      const result = await adapter.checkAvailability(diamond);

      res.json({ data: result });
    } catch (error) {
      insertErrorLog(
        'api',
        `Availability check failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        { operation: 'trading_check_availability', diamond_id: req.params.id },
      ).catch(() => {});
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/trading/diamonds/search:
 *   get:
 *     summary: Quick search for diamonds by stock ID, offer ID, or cert number
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: feed
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Matching diamonds
 */
router.get(
  '/diamonds/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) {
        throw badRequest('q query parameter is required');
      }
      const feed = req.query.feed ? String(req.query.feed) : undefined;
      const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50);
      const diamonds = await quickSearchDiamonds(q, limit, feed);
      res.json({ data: diamonds });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/trading/diamonds/{id}:
 *   get:
 *     summary: Get diamond by internal ID
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Diamond details
 *       404:
 *         description: Diamond not found
 */
router.get(
  '/diamonds/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const diamond = await getDiamondById(req.params.id);
      if (!diamond) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Diamond not found' } });
        return;
      }
      res.json({ data: diamond });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Holds
// ============================================================================

/**
 * @openapi
 * /api/v2/trading/hold:
 *   post:
 *     summary: Place a hold on a diamond
 *     description: |
 *       Takes our internal diamond ID, looks up the diamond, determines the feed,
 *       and places a hold using the appropriate feed adapter.
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - diamond_id
 *             properties:
 *               diamond_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Hold placed successfully
 *       400:
 *         description: Invalid request or hold denied
 *       404:
 *         description: Diamond not found
 */
router.post(
  '/hold',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { diamond_id } = req.body;
      if (!diamond_id) {
        throw badRequest('diamond_id is required');
      }

      const diamond = await getDiamondById(diamond_id) as Diamond | null;
      if (!diamond) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Diamond not found' } });
        return;
      }

      // Check if diamond is already held or sold
      if (diamond.availability === 'on_hold') {
        res.status(400).json({
          error: { code: 'ALREADY_ON_HOLD', message: 'Diamond is already on hold' },
        });
        return;
      }
      if (diamond.availability === 'sold') {
        res.status(400).json({
          error: { code: 'ALREADY_SOLD', message: 'Diamond has already been purchased' },
        });
        return;
      }

      const adapter = getTradingAdapter(diamond.feed);
      const result = await adapter.createHold(diamond);

      await createHoldHistory(
        diamond.id,
        diamond.feed,
        diamond.offerId,
        result.id,
        result.denied,
        result.until ? new Date(result.until) : undefined,
      );

      if (!result.denied) {
        await updateDiamondAvailability(diamond.id, 'on_hold', result.id);
        res.json({
          data: {
            hold_id: result.id,
            denied: result.denied,
            until: result.until,
            message: 'Hold placed successfully',
          },
        });
      } else {
        res.status(400).json({
          error: { code: 'HOLD_DENIED', message: 'Hold request was denied' },
          data: { hold_id: result.id, denied: true },
        });
      }
    } catch (error) {
      insertErrorLog(
        'api',
        `Hold failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        { operation: 'trading_hold', diamond_id: req.body.diamond_id },
      ).catch(() => {});
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/trading/cancel-hold:
 *   post:
 *     summary: Cancel/release a hold on a diamond
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hold_id
 *             properties:
 *               hold_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hold cancelled successfully
 *       404:
 *         description: Hold not found
 */
router.post(
  '/cancel-hold',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { hold_id } = req.body;
      if (!hold_id) {
        throw badRequest('hold_id is required');
      }

      const hold = await getHoldById(hold_id);
      if (!hold) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hold not found' } });
        return;
      }

      if (hold.status !== 'active') {
        throw badRequest(`Hold is already ${hold.status}`);
      }

      // Call feed adapter to cancel upstream if there's a feed hold ID
      if (hold.feedHoldId) {
        try {
          const adapter = getTradingAdapter(hold.feed);
          await adapter.cancelHold(hold.feedHoldId);
        } catch (err) {
          // Log but don't fail — still release locally
          insertErrorLog(
            'api',
            `Upstream cancel-hold failed: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
            { operation: 'trading_cancel_hold', hold_id },
          ).catch(() => {});
        }
      }

      await updateHoldStatus(hold_id, 'released');

      if (hold.diamondId) {
        await updateDiamondAvailability(hold.diamondId, 'available', undefined);
      }

      res.json({
        data: { hold_id, status: 'released', message: 'Hold cancelled successfully' },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Orders
// ============================================================================

/**
 * @openapi
 * /api/v2/trading/order:
 *   post:
 *     summary: Create an order for a diamond
 *     description: |
 *       Takes our internal diamond ID, looks up the diamond, determines the feed,
 *       and places an order using the appropriate feed adapter.
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - diamond_id
 *             properties:
 *               diamond_id:
 *                 type: string
 *                 format: uuid
 *               destination_id:
 *                 type: string
 *               reference:
 *                 type: string
 *               comments:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order created successfully
 *       404:
 *         description: Diamond not found
 */
router.post(
  '/order',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { diamond_id, destination_id, reference, comments } = req.body;
      if (!diamond_id) {
        throw badRequest('diamond_id is required');
      }

      const diamond = await getDiamondById(diamond_id) as Diamond | null;
      if (!diamond) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Diamond not found' } });
        return;
      }

      // Check if diamond is already held or sold
      if (diamond.availability === 'on_hold') {
        res.status(400).json({
          error: { code: 'ALREADY_ON_HOLD', message: 'Diamond is already on hold. Please release the hold before purchasing.' },
        });
        return;
      }
      if (diamond.availability === 'sold') {
        res.status(400).json({
          error: { code: 'ALREADY_SOLD', message: 'Diamond has already been purchased' },
        });
        return;
      }

      const idempotencyKey = `${diamond.feed}-order-${diamond.id}-${Date.now()}`;

      const record = await createPurchaseHistory(
        diamond.id,
        diamond.feed,
        diamond.offerId,
        idempotencyKey,
        'pending',
        undefined,
        reference,
        comments,
      );

      try {
        const adapter = getTradingAdapter(diamond.feed);
        const result = await adapter.createOrder(diamond, {
          destinationId: destination_id,
          reference,
          comments,
        });

        await updatePurchaseStatus(record.id, 'confirmed', result.id);
        await updateDiamondAvailability(diamond.id, 'sold');

        res.json({
          data: { order_id: result.id, purchase_id: record.id, message: 'Order created successfully' },
        });
      } catch (orderError) {
        await updatePurchaseStatus(record.id, 'failed', null);
        throw orderError;
      }
    } catch (error) {
      insertErrorLog(
        'api',
        `Order failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        { operation: 'trading_order', diamond_id: req.body.diamond_id },
      ).catch(() => {});
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/trading/cancel-order:
 *   post:
 *     summary: Cancel an order
 *     tags:
 *       - Trading
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *             properties:
 *               order_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order cannot be cancelled
 */
router.post(
  '/cancel-order',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { order_id } = req.body;
      if (!order_id) {
        throw badRequest('order_id is required');
      }

      const purchase = await getPurchaseById(order_id);
      if (!purchase) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
        return;
      }

      if (purchase.status === 'cancelled') {
        throw badRequest('Order is already cancelled');
      }
      if (purchase.status === 'failed') {
        throw badRequest('Cannot cancel a failed order');
      }

      // Attempt upstream cancellation if there's a feed order ID
      if (purchase.feedOrderId) {
        try {
          const adapter = getTradingAdapter(purchase.feed);
          await adapter.cancelOrder(purchase.feedOrderId);
        } catch (err) {
          // For feeds that don't support cancellation, log and continue locally
          insertErrorLog(
            'api',
            `Upstream cancel-order failed: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
            { operation: 'trading_cancel_order', order_id },
          ).catch(() => {});
        }
      }

      await updatePurchaseStatus(order_id, 'cancelled', null);

      // Restore diamond availability
      if (purchase.diamondId) {
        await updateDiamondAvailability(purchase.diamondId, 'available', undefined);
      }

      res.json({
        data: { order_id, status: 'cancelled', message: 'Order cancelled successfully' },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
