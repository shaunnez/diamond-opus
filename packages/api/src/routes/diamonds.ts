import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  searchDiamonds,
  getDiamondById,
  updateDiamondAvailability,
  createHoldHistory,
  createPurchaseHistory,
  getPurchaseByIdempotencyKey,
  updatePurchaseStatus,
} from '@diamond/database';
import { NivodaAdapter } from '@diamond/nivoda';
import { validateQuery, validateParams, validateBody, notFound, badRequest, conflict } from '../middleware/index.js';
import {
  diamondSearchSchema,
  diamondIdSchema,
  purchaseRequestSchema,
  type DiamondSearchQuery,
  type DiamondIdParams,
  type PurchaseRequestBody,
} from '../validators/index.js';

const router = Router();

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * @openapi
 * /api/v2/diamonds:
 *   get:
 *     summary: Search diamonds with filters
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: shape
 *         schema:
 *           type: string
 *       - in: query
 *         name: carat_min
 *         schema:
 *           type: number
 *       - in: query
 *         name: carat_max
 *         schema:
 *           type: number
 *       - in: query
 *         name: color
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: clarity
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: cut
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: lab_grown
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: price_min
 *         schema:
 *           type: integer
 *       - in: query
 *         name: price_max
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [created_at, feed_price_cents, carats, color, clarity]
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: List of diamonds
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  validateQuery(diamondSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as Request & { validatedQuery: DiamondSearchQuery }).validatedQuery;

      const result = await searchDiamonds({
        shape: query.shape,
        caratMin: query.carat_min,
        caratMax: query.carat_max,
        colors: toArray(query.color),
        clarities: toArray(query.clarity),
        cuts: toArray(query.cut),
        labGrown: query.lab_grown,
        priceMin: query.price_min,
        priceMax: query.price_max,
        page: query.page,
        limit: query.limit,
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}:
 *   get:
 *     summary: Get diamond by ID
 *     tags:
 *       - Diamonds
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
  '/:id',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      res.json({ data: diamond });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}/availability:
 *   post:
 *     summary: Check diamond availability
 *     tags:
 *       - Diamonds
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
 *         description: Availability status
 *       404:
 *         description: Diamond not found
 */
router.post(
  '/:id/availability',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      res.json({
        data: {
          id: diamond.id,
          availability: diamond.availability,
          hold_id: diamond.holdId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}/hold:
 *   post:
 *     summary: Create hold on diamond
 *     tags:
 *       - Diamonds
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
 *         description: Hold created
 *       404:
 *         description: Diamond not found
 *       409:
 *         description: Diamond not available for hold
 */
router.post(
  '/:id/hold',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      if (diamond.availability !== 'available') {
        throw conflict('Diamond is not available for hold');
      }

      const adapter = new NivodaAdapter();
      const holdResponse = await adapter.createHold(diamond.offerId);

      await createHoldHistory(
        diamond.id,
        diamond.feed,
        diamond.offerId,
        holdResponse.id,
        holdResponse.denied,
        holdResponse.until ? new Date(holdResponse.until) : undefined
      );

      if (!holdResponse.denied) {
        await updateDiamondAvailability(diamond.id, 'on_hold', holdResponse.id);
      }

      res.json({
        data: {
          id: holdResponse.id,
          denied: holdResponse.denied,
          until: holdResponse.until,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}/purchase:
 *   post:
 *     summary: Purchase diamond
 *     tags:
 *       - Diamonds
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
 *       - in: header
 *         name: X-Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - destination_id
 *             properties:
 *               destination_id:
 *                 type: string
 *               reference:
 *                 type: string
 *               comments:
 *                 type: string
 *               return_option:
 *                 type: string
 *     responses:
 *       200:
 *         description: Purchase created
 *       400:
 *         description: Missing idempotency key
 *       404:
 *         description: Diamond not found
 *       409:
 *         description: Duplicate request or diamond not available
 */
router.post(
  '/:id/purchase',
  validateParams(diamondIdSchema),
  validateBody(purchaseRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;
      const body = req.body as PurchaseRequestBody;
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

      if (!idempotencyKey) {
        throw badRequest('X-Idempotency-Key header is required');
      }

      const existingPurchase = await getPurchaseByIdempotencyKey(idempotencyKey);
      if (existingPurchase) {
        res.json({
          data: {
            id: existingPurchase.feedOrderId,
            status: existingPurchase.status,
          },
        });
        return;
      }

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      if (diamond.availability === 'sold') {
        throw conflict('Diamond is already sold');
      }

      const purchaseRecord = await createPurchaseHistory(
        diamond.id,
        diamond.feed,
        diamond.offerId,
        idempotencyKey,
        'pending',
        undefined,
        body.reference,
        body.comments
      );

      try {
        const adapter = new NivodaAdapter();
        const orderResponse = await adapter.createOrder([
          {
            offerId: diamond.offerId,
            destinationId: body.destination_id,
            customer_comment: body.comments,
            customer_order_number: body.reference,
            return_option: body.return_option,
          }
        ]);
        await updatePurchaseStatus(purchaseRecord.id, 'confirmed', orderResponse);
        await updateDiamondAvailability(diamond.id, 'sold');

        res.json({
          data:  orderResponse
        });
      } catch (error) {
        await updatePurchaseStatus(purchaseRecord.id, 'failed', null);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
