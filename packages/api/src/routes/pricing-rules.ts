import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getActivePricingRules,
  createPricingRule,
  updatePricingRule,
  deactivatePricingRule,
} from "@diamond/database";
import { badRequest, notFound } from "../middleware/index.js";

const router = Router();

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
          carat_min: rule.caratMin,
          carat_max: rule.caratMax,
          shapes: rule.shapes,
          lab_grown: rule.labGrown,
          feed: rule.feed,
          markup_ratio: rule.markupRatio,
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
 *               - markup_ratio
 *             properties:
 *               priority:
 *                 type: integer
 *                 description: Rule priority (lower = higher precedence)
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
 *               feed:
 *                 type: string
 *               markup_ratio:
 *                 type: number
 *                 description: Markup multiplier (e.g., 1.15 for 15% markup)
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
    if (body.markup_ratio === undefined) {
      throw badRequest("markup_ratio is required");
    }

    // Validate markup_ratio is a valid number
    const markupRatio = parseFloat(body.markup_ratio);
    if (isNaN(markupRatio) || markupRatio <= 0) {
      throw badRequest("markup_ratio must be a positive number");
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
      caratMin: body.carat_min !== undefined ? parseFloat(body.carat_min) : undefined,
      caratMax: body.carat_max !== undefined ? parseFloat(body.carat_max) : undefined,
      shapes: body.shapes,
      labGrown: body.lab_grown,
      feed: body.feed,
      markupRatio,
      rating: body.rating !== undefined ? parseInt(body.rating, 10) : undefined,
    });

    res.status(201).json({
      data: {
        id: rule.id,
        priority: rule.priority,
        carat_min: rule.caratMin,
        carat_max: rule.caratMax,
        shapes: rule.shapes,
        lab_grown: rule.labGrown,
        feed: rule.feed,
        markup_ratio: rule.markupRatio,
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
 *               feed:
 *                 type: string
 *               markup_ratio:
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
      caratMin?: number;
      caratMax?: number;
      shapes?: string[];
      labGrown?: boolean;
      feed?: string;
      markupRatio?: number;
      rating?: number;
      active?: boolean;
    } = {};

    if (body.priority !== undefined) {
      updates.priority = parseInt(body.priority, 10);
    }
    if (body.carat_min !== undefined) {
      updates.caratMin = body.carat_min === null ? undefined : parseFloat(body.carat_min);
    }
    if (body.carat_max !== undefined) {
      updates.caratMax = body.carat_max === null ? undefined : parseFloat(body.carat_max);
    }
    if (body.shapes !== undefined) {
      updates.shapes = body.shapes;
    }
    if (body.lab_grown !== undefined) {
      updates.labGrown = body.lab_grown;
    }
    if (body.feed !== undefined) {
      updates.feed = body.feed;
    }
    if (body.markup_ratio !== undefined) {
      const markupRatio = parseFloat(body.markup_ratio);
      if (isNaN(markupRatio) || markupRatio <= 0) {
        throw badRequest("markup_ratio must be a positive number");
      }
      updates.markupRatio = markupRatio;
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
