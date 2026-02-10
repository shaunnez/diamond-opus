import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getActivePricingRules,
  createPricingRule,
  updatePricingRule,
  deactivatePricingRule,
} from "@diamond/database";
import type { StoneType } from "@diamond/shared";
import { badRequest } from "../middleware/index.js";

const router = Router();

const VALID_STONE_TYPES: StoneType[] = ['natural', 'lab', 'fancy'];

/**
 * @openapi
 * /api/v2/pricing-rules:
 *   get:
 *     summary: List all active pricing rules
 *     tags:
 *       - Pricing Rules
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       200:
 *         description: List of pricing rules
 *       401:
 *         description: Unauthorized
 */
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await getActivePricingRules();

    res.json({
      data: {
        rules: rules.map((rule) => ({
          id: rule.id,
          priority: rule.priority,
          stone_type: rule.stoneType,
          price_min: rule.priceMin,
          price_max: rule.priceMax,
          feed: rule.feed,
          margin_modifier: rule.marginModifier,
          rating: rule.rating,
          active: rule.active,
          created_at: rule.createdAt,
          updated_at: rule.updatedAt,
        })),
        total: rules.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules:
 *   post:
 *     summary: Create a new pricing rule
 *     tags:
 *       - Pricing Rules
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
 *               - priority
 *               - margin_modifier
 *             properties:
 *               priority:
 *                 type: integer
 *                 description: Rule priority (lower = higher precedence)
 *               stone_type:
 *                 type: string
 *                 enum: [natural, lab, fancy]
 *                 description: Stone type to match
 *               price_min:
 *                 type: number
 *                 description: Minimum cost (USD) to match
 *               price_max:
 *                 type: number
 *                 description: Maximum cost (USD) to match
 *               feed:
 *                 type: string
 *               margin_modifier:
 *                 type: number
 *                 description: Margin modifier in percentage points (e.g., 6 for +6%, -4 for -4%)
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *     responses:
 *       201:
 *         description: Rule created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;

    // Validate required fields
    if (body.priority === undefined) {
      throw badRequest("priority is required");
    }
    if (body.margin_modifier === undefined) {
      throw badRequest("margin_modifier is required");
    }

    // Validate margin_modifier is a valid number
    const marginModifier = parseFloat(body.margin_modifier);
    if (isNaN(marginModifier)) {
      throw badRequest("margin_modifier must be a number");
    }

    // Validate stone_type if provided
    if (body.stone_type !== undefined && !VALID_STONE_TYPES.includes(body.stone_type)) {
      throw badRequest("stone_type must be one of: natural, lab, fancy");
    }

    // Validate rating if provided
    if (body.rating !== undefined) {
      const rating = parseInt(body.rating, 10);
      if (isNaN(rating) || rating < 1 || rating > 10) {
        throw badRequest("rating must be between 1 and 10");
      }
    }

    const rule = await createPricingRule({
      priority: parseInt(body.priority, 10),
      stoneType: body.stone_type,
      priceMin: body.price_min !== undefined ? parseFloat(body.price_min) : undefined,
      priceMax: body.price_max !== undefined ? parseFloat(body.price_max) : undefined,
      feed: body.feed,
      marginModifier,
      rating: body.rating !== undefined ? parseInt(body.rating, 10) : undefined,
    });

    res.status(201).json({
      data: {
        id: rule.id,
        priority: rule.priority,
        stone_type: rule.stoneType,
        price_min: rule.priceMin,
        price_max: rule.priceMax,
        feed: rule.feed,
        margin_modifier: rule.marginModifier,
        rating: rule.rating,
        active: rule.active,
        created_at: rule.createdAt,
        updated_at: rule.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules/{id}:
 *   put:
 *     summary: Update a pricing rule
 *     tags:
 *       - Pricing Rules
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priority:
 *                 type: integer
 *               stone_type:
 *                 type: string
 *                 enum: [natural, lab, fancy]
 *               price_min:
 *                 type: number
 *               price_max:
 *                 type: number
 *               feed:
 *                 type: string
 *               margin_modifier:
 *                 type: number
 *               rating:
 *                 type: integer
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Rule updated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Rule not found
 */
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!id) {
      throw badRequest("id is required");
    }

    // Build updates object
    const updates: {
      priority?: number;
      stoneType?: StoneType;
      priceMin?: number;
      priceMax?: number;
      feed?: string;
      marginModifier?: number;
      rating?: number;
      active?: boolean;
    } = {};

    if (body.priority !== undefined) {
      updates.priority = parseInt(body.priority, 10);
    }
    if (body.stone_type !== undefined) {
      if (body.stone_type !== null && !VALID_STONE_TYPES.includes(body.stone_type)) {
        throw badRequest("stone_type must be one of: natural, lab, fancy");
      }
      updates.stoneType = body.stone_type === null ? undefined : body.stone_type;
    }
    if (body.price_min !== undefined) {
      updates.priceMin = body.price_min === null ? undefined : parseFloat(body.price_min);
    }
    if (body.price_max !== undefined) {
      updates.priceMax = body.price_max === null ? undefined : parseFloat(body.price_max);
    }
    if (body.feed !== undefined) {
      updates.feed = body.feed;
    }
    if (body.margin_modifier !== undefined) {
      const marginModifier = parseFloat(body.margin_modifier);
      if (isNaN(marginModifier)) {
        throw badRequest("margin_modifier must be a number");
      }
      updates.marginModifier = marginModifier;
    }
    if (body.rating !== undefined) {
      if (body.rating === null) {
        updates.rating = undefined;
      } else {
        const rating = parseInt(body.rating, 10);
        if (isNaN(rating) || rating < 1 || rating > 10) {
          throw badRequest("rating must be between 1 and 10");
        }
        updates.rating = rating;
      }
    }
    if (body.active !== undefined) {
      updates.active = body.active;
    }

    await updatePricingRule(id, updates);

    res.json({
      data: {
        message: "Rule updated successfully",
        id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules/{id}:
 *   delete:
 *     summary: Deactivate a pricing rule
 *     description: Soft-deletes the rule by setting active=false
 *     tags:
 *       - Pricing Rules
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
 *         description: Rule deactivated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Rule not found
 */
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw badRequest("id is required");
      }

      await deactivatePricingRule(id);

      res.json({
        data: {
          message: "Rule deactivated successfully",
          id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
