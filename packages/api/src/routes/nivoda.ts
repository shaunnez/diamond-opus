import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { NivodaAdapter } from "@diamond/nivoda";
import { badRequest } from "../middleware/index.js";
import {
  getDiamondByOfferId,
  createHoldHistory,
  updateDiamondAvailability,
  createPurchaseHistory,
  updatePurchaseStatus,
  getHoldById,
  updateHoldStatus,
  insertErrorLog,
} from "@diamond/database";
import { DIAMOND_SHAPES, type Diamond } from "@diamond/shared";

const router = Router();

/**
 * @openapi
 * /api/v2/nivoda/hold:
 *   post:
 *     summary: Place a hold on a diamond
 *     description: |
 *       Places a hold on a diamond using the Nivoda API.
 *       Also records the hold in hold_history and updates diamond availability.
 *     tags:
 *       - Nivoda
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
 *               - offer_id
 *             properties:
 *               offer_id:
 *                 type: string
 *                 description: The Nivoda offer ID for the diamond
 *     responses:
 *       200:
 *         description: Hold placed successfully
 *       400:
 *         description: Invalid request or hold denied
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to place hold
 */
router.post(
  "/hold",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offer_id } = req.body;

      if (!offer_id) {
        throw badRequest("offer_id is required");
      }

      // Track in Supabase - look up diamond by offer_id
      const diamond = (await getDiamondByOfferId(offer_id)) as Diamond | null;

      if (!diamond) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Diamond not found",
          },
        });
        return;
      }

      const adapter = new NivodaAdapter();

      // NOTE: createHold expects diamond.supplierStoneId, NOT diamond.offerId
      // The Nivoda adapter handles the ID mapping internally
      const result = await adapter.createHold(diamond.supplierStoneId);

      await createHoldHistory(
        diamond.id,
        diamond.feed,
        diamond.offerId,
        result.id,
        result.denied,
        result.until ? new Date(result.until) : undefined,
      );

      if (!result.denied) {
        await updateDiamondAvailability(diamond.id, "on_hold", result.id);
        res.json({
          data: {
            hold_id: result.id,
            denied: result.denied,
            until: result.until,
            message: "Hold placed successfully",
          },
        });
      } else {
        res.status(400).json({
          error: {
            code: "HOLD_DENIED",
            message: "Hold request was denied by Nivoda",
          },
          data: {
            hold_id: result.id,
            denied: true,
          },
        });
      }
    } catch (error) {
      insertErrorLog(
        "api",
        `Hold failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        { operation: "hold", offer_id: req.body.offer_id },
      ).catch(() => {});
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/nivoda/cancel-hold:
 *   post:
 *     summary: Cancel/release a hold on a diamond
 *     tags:
 *       - Nivoda
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
 *                 description: The hold history record ID
 *     responses:
 *       200:
 *         description: Hold cancelled successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Hold not found
 */
router.post(
  "/cancel-hold",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { hold_id } = req.body;

      if (!hold_id) {
        throw badRequest("hold_id is required");
      }

      const hold = await getHoldById(hold_id);
      if (!hold) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Hold not found" },
        });
        return;
      }

      if (hold.status !== "active") {
        throw badRequest(`Hold is already ${hold.status}`);
      }

      // Update hold status in DB
      await updateHoldStatus(hold_id, "released");

      // Restore diamond availability if we have the diamond
      if (hold.diamondId) {
        await updateDiamondAvailability(hold.diamondId, "available", undefined);
      }

      res.json({
        data: {
          hold_id: hold_id,
          status: "released",
          message: "Hold cancelled successfully",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/nivoda/order:
 *   post:
 *     summary: Create an order for a diamond
 *     description: |
 *       Creates an order for a diamond using the Nivoda API.
 *       Also records the order in purchase_history.
 *     tags:
 *       - Nivoda
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
 *               - offer_id
 *             properties:
 *               offer_id:
 *                 type: string
 *                 description: The Nivoda offer ID for the diamond
 *               destination_id:
 *                 type: string
 *                 description: The delivery destination ID from your Nivoda account
 *               reference:
 *                 type: string
 *                 description: Your order reference number
 *               comments:
 *                 type: string
 *                 description: Order comments or notes
 *               return_option:
 *                 type: boolean
 *                 description: Return policy option
 *     responses:
 *       200:
 *         description: Order created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create order
 */
router.post(
  "/order",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offer_id, destination_id, reference, comments, return_option } =
        req.body;

      if (!offer_id) {
        throw badRequest("offer_id is required");
      }

      // Look up diamond for tracking
      const diamond = (await getDiamondByOfferId(offer_id)) as Diamond | null;
      const idempotencyKey = `nivoda-order-${offer_id}-${Date.now()}`;

      // Create pending purchase record
      let purchaseId: string | undefined;
      if (diamond) {
        const record = await createPurchaseHistory(
          diamond.id,
          diamond.feed,
          diamond.offerId,
          idempotencyKey,
          "pending",
          undefined,
          reference,
          comments,
        );
        purchaseId = record.id;
      }

      try {
        const adapter = new NivodaAdapter();
        const result = await adapter.createOrder([
          {
            offerId: offer_id,
            destinationId: destination_id,
            customer_comment: comments,
            customer_order_number: reference,
            return_option: return_option || false,
          },
        ]);

        // Update purchase record to confirmed
        if (purchaseId) {
          await updatePurchaseStatus(purchaseId, "confirmed", result);
          if (diamond) {
            await updateDiamondAvailability(diamond.id, "sold");
          }
        }

        res.json({
          data: {
            order_id: result,
            message: "Order created successfully",
          },
        });
      } catch (orderError) {
        // Update purchase record to failed
        if (purchaseId) {
          await updatePurchaseStatus(purchaseId, "failed", null);
        }
        throw orderError;
      }
    } catch (error) {
      insertErrorLog(
        "api",
        `Order failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        { operation: "order", offer_id: req.body.offer_id },
      ).catch(() => {});
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/nivoda/search:
 *   post:
 *     summary: Search diamonds directly from Nivoda
 *     description: |
 *       Search diamonds directly from the Nivoda API.
 *       Useful for getting real-time availability and pricing.
 *     tags:
 *       - Nivoda
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               price_min:
 *                 type: number
 *               price_max:
 *                 type: number
 *               carat_min:
 *                 type: number
 *               carat_max:
 *                 type: number
 *               shapes:
 *                 type: array
 *                 items:
 *                   type: string
 *               lab_grown:
 *                 type: boolean
 *               has_image:
 *                 type: boolean
 *               has_video:
 *                 type: boolean
 *               offset:
 *                 type: integer
 *                 default: 0
 *               limit:
 *                 type: integer
 *                 default: 20
 *                 maximum: 50
 *     responses:
 *       200:
 *         description: Search results
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/search",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        price_min,
        price_max,
        carat_min,
        carat_max,
        shapes,
        lab_grown,
        has_image,
        has_video,
        offset = 0,
        limit = 20,
      } = req.body;

      const adapter = new NivodaAdapter();

      const query: {
        dollar_value?: { from?: number; to?: number };
        sizes?: { from?: number; to?: number };
        shapes?: string[];
        labgrown?: boolean;
        has_image?: boolean;
        has_video?: boolean;
        availability?: string[];
        excludeFairPoorCuts?: boolean;
        hideMemo?: boolean;
      } = {
        shapes: [...DIAMOND_SHAPES],
        sizes: { from: 0.4, to: 15.01 },
        has_image: true,
        has_video: true,
        availability: ['AVAILABLE'],
        excludeFairPoorCuts: true,
        hideMemo: true
      };

      if (price_min !== undefined || price_max !== undefined) {
        query.dollar_value = {};
        if (price_min !== undefined) {
          query.dollar_value.from = price_min;
        }
        if (price_max !== undefined) {
          query.dollar_value.to = price_max;
        }
      }

      if (carat_min !== undefined || carat_max !== undefined) {
        query.sizes = {};
        if (carat_min !== undefined) {
          query.sizes.from = carat_min;
        }
        if (carat_max !== undefined) {
          query.sizes.to = carat_max;
        }
      }

      if (shapes) {
        query.shapes = shapes;
      }

      if (lab_grown !== undefined) {
        query.labgrown = lab_grown;
      }

      if (has_image !== undefined) {
        query.has_image = has_image;
      }

      if (has_video !== undefined) {
        query.has_video = has_video;
      }

      const result = await adapter.searchDiamonds(query, {
        offset,
        limit: Math.min(limit, 50), // Nivoda max is 50
      });

      res.json({
        data: {
          total_count: result.total_count,
          items: result.items.map((item) => ({
            offer_id: item.id,
            price: item.price,
            discount: item.discount,
            diamond: {
              id: item.diamond.id,
              availability: item.diamond.availability,
              hold_id: item.diamond.HoldId,
              stock_id: item.diamond.NivodaStockId,
              supplier_stock_id: item.diamond.supplierStockId,
              image: item.diamond.image,
              video: item.diamond.video,
              certificate: {
                lab: item.diamond.certificate.lab,
                number: item.diamond.certificate.certNumber,
                shape: item.diamond.certificate.shape,
                carats: item.diamond.certificate.carats,
                color: item.diamond.certificate.color,
                clarity: item.diamond.certificate.clarity,
                cut: item.diamond.certificate.cut,
                polish: item.diamond.certificate.polish,
                symmetry: item.diamond.certificate.symmetry,
                fluorescence: item.diamond.certificate.floInt,
                lab_grown: item.diamond.certificate.labgrown,
              },
              supplier: item.diamond.supplier
                ? {
                    id: item.diamond.supplier.id,
                    name: item.diamond.supplier.name,
                  }
                : null,
            },
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/nivoda/count:
 *   post:
 *     summary: Get count of diamonds matching query
 *     description: |
 *       Get accurate count of diamonds matching query from Nivoda.
 *       Uses diamonds_by_query_count for reliable results.
 *     tags:
 *       - Nivoda
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               price_min:
 *                 type: number
 *               price_max:
 *                 type: number
 *               carat_min:
 *                 type: number
 *               carat_max:
 *                 type: number
 *               shapes:
 *                 type: array
 *                 items:
 *                   type: string
 *               lab_grown:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Diamond count
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/count",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { price_min, price_max, carat_min, carat_max, shapes, lab_grown } =
        req.body;

      const adapter = new NivodaAdapter();

     const query: {
        dollar_value?: { from?: number; to?: number };
        sizes?: { from?: number; to?: number };
        shapes?: string[];
        labgrown?: boolean;
        has_image?: boolean;
        has_video?: boolean;
        availability?: string[];
        excludeFairPoorCuts?: boolean;
        hideMemo?: boolean;
      } = {
        shapes: [...DIAMOND_SHAPES],
        sizes: { from: 0.4, to: 15.01 },
        has_image: true,
        has_video: true,
        availability: ['AVAILABLE'],
        excludeFairPoorCuts: true,
        hideMemo: true
      };

      if (price_min !== undefined || price_max !== undefined) {
        query.dollar_value = {};
        if (price_min !== undefined) {
          query.dollar_value.from = price_min;
        }
        if (price_max !== undefined) {
          query.dollar_value.to = price_max;
        }
      }

      if (carat_min !== undefined || carat_max !== undefined) {
        query.sizes = {};
        if (carat_min !== undefined) {
          query.sizes.from = carat_min;
        }
        if (carat_max !== undefined) {
          query.sizes.to = carat_max;
        }
      }

      if (shapes) {
        query.shapes = shapes;
      }

      if (lab_grown !== undefined) {
        query.labgrown = lab_grown;
      }

      const count = await adapter.getDiamondsCount(query);

      res.json({
        data: {
          count,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/v2/nivoda/diamond/{offerId}:
 *   get:
 *     summary: Get diamond details by offer ID
 *     description: |
 *       Get full details for a specific diamond from our database,
 *       including the offer_id needed for holds/orders.
 *     tags:
 *       - Nivoda
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Diamond details
 *       404:
 *         description: Diamond not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/diamond/:offerId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offerId } = req.params;

      if (!offerId) {
        throw badRequest("offerId is required");
      }

      const diamond = await getDiamondByOfferId(offerId);

      if (!diamond) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Diamond not found",
          },
        });
        return;
      }

      res.json({
        data: diamond,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
