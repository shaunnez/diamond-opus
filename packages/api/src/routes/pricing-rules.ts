import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getActivePricingRules,
  createPricingRule,
  updatePricingRule,
  deactivatePricingRule,
  createReapplyJob,
  getReapplyJob,
  getReapplyJobs,
  getRunningReapplyJob,
  updateReapplyJobStatus,
  countAvailableDiamonds,
  getAvailableDiamondsBatch,
  batchUpdateDiamondPricing,
  insertReapplySnapshots,
  revertDiamondPricingFromSnapshots,
  incrementDatasetVersion,
  resetJobForRetry,
} from "@diamond/database";
import type { StoneType } from "@diamond/shared";
import { createServiceLogger } from "@diamond/shared";
import {
  REAPPLY_BATCH_SIZE,
  REAPPLY_MAX_RETRIES,
  REAPPLY_RETRY_BASE_DELAY_MINUTES,
  REAPPLY_RETRY_MAX_DELAY_MINUTES,
} from "@diamond/shared";
import { PricingEngine } from "@diamond/pricing-engine";
import { badRequest } from "../middleware/index.js";

const router = Router();
const log = createServiceLogger("pricing-reapply");

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

// =============================================
// Reapply pricing endpoints
// =============================================

function formatReapplyJob(job: {
  id: string;
  status: string;
  totalDiamonds: number;
  processedDiamonds: number;
  failedDiamonds: number;
  feedsAffected: string[];
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  revertedAt: Date | null;
  createdAt: Date;
  retryCount: number;
  lastProgressAt: Date | null;
  nextRetryAt: Date | null;
}) {
  return {
    id: job.id,
    status: job.status,
    total_diamonds: job.totalDiamonds,
    processed_diamonds: job.processedDiamonds,
    failed_diamonds: job.failedDiamonds,
    feeds_affected: job.feedsAffected,
    error: job.error,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    reverted_at: job.revertedAt,
    created_at: job.createdAt,
    retry_count: job.retryCount,
    last_progress_at: job.lastProgressAt,
    next_retry_at: job.nextRetryAt,
  };
}

/**
 * Calculate next retry time using exponential backoff.
 * Formula: base_delay * 3^retryCount, capped at max_delay.
 * @param retryCount - Current retry attempt (1-indexed)
 * @returns Date for next retry, or null if max retries exceeded
 */
function calculateNextRetryTime(retryCount: number): Date | null {
  if (retryCount >= REAPPLY_MAX_RETRIES) {
    return null;
  }

  // Exponential backoff: 5min * 3^retryCount, capped at 30min
  const delayMinutes = Math.min(
    REAPPLY_RETRY_BASE_DELAY_MINUTES * Math.pow(3, retryCount),
    REAPPLY_RETRY_MAX_DELAY_MINUTES
  );

  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
  return nextRetry;
}

/**
 * Background job that reprices all available diamonds using current pricing rules.
 * Updates progress in the job row as it processes batches.
 * @param jobId - Reapply job ID
 * @param currentRetryCount - Current retry attempt (0 for first attempt)
 */
async function executeReapplyJob(jobId: string, currentRetryCount: number = 0): Promise<void> {
  const startedAt = new Date();
  try {
    await updateReapplyJobStatus(jobId, "running", {
      startedAt,
      lastProgressAt: startedAt,
      retryCount: currentRetryCount,
    });
    log.info("Reapply job started", { jobId, retryCount: currentRetryCount });

    const engine = new PricingEngine();
    await engine.loadRules();

    let cursor: string | null = null;
    let processedDiamonds = 0;
    let failedDiamonds = 0;
    const feedsSet = new Set<string>();

    while (true) {
      const batch = await getAvailableDiamondsBatch(cursor, REAPPLY_BATCH_SIZE);
      if (batch.length === 0) break;

      cursor = batch[batch.length - 1]!.id;

      const updates: Array<{
        id: string;
        priceModelPrice: number;
        markupRatio: number;
        rating: number | undefined;
      }> = [];
      const snapshots: Array<{
        diamondId: string;
        feed: string;
        oldPriceModelPrice: number;
        oldMarkupRatio: number | null;
        oldRating: number | null;
        newPriceModelPrice: number;
        newMarkupRatio: number | null;
        newRating: number | null;
      }> = [];

      for (const diamond of batch) {
        try {
          const pricing = engine.calculatePricing({
            feedPrice: diamond.feedPrice,
            carats: diamond.carats ?? undefined,
            labGrown: diamond.labGrown,
            fancyColor: diamond.fancyColor ?? undefined,
            feed: diamond.feed,
          });

          updates.push({
            id: diamond.id,
            priceModelPrice: pricing.priceModelPrice,
            markupRatio: pricing.markupRatio,
            rating: pricing.rating,
          });

          snapshots.push({
            diamondId: diamond.id,
            feed: diamond.feed,
            oldPriceModelPrice: diamond.priceModelPrice ?? diamond.feedPrice,
            oldMarkupRatio: diamond.markupRatio,
            oldRating: diamond.rating,
            newPriceModelPrice: pricing.priceModelPrice,
            newMarkupRatio: pricing.markupRatio,
            newRating: pricing.rating ?? null,
          });

          feedsSet.add(diamond.feed);
        } catch (err) {
          failedDiamonds++;
          log.warn("Failed to reprice diamond", {
            jobId,
            diamondId: diamond.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (updates.length > 0) {
        await batchUpdateDiamondPricing(updates);
        await insertReapplySnapshots(jobId, snapshots);
      }

      processedDiamonds += batch.length;

      await updateReapplyJobStatus(jobId, "running", {
        processedDiamonds,
        failedDiamonds,
        lastProgressAt: new Date(),
      });

      log.info("Reapply batch processed", {
        jobId,
        processedDiamonds,
        batchSize: batch.length,
      });
    }

    const feedsAffected = Array.from(feedsSet);

    await updateReapplyJobStatus(jobId, "completed", {
      processedDiamonds,
      failedDiamonds,
      feedsAffected,
      completedAt: new Date(),
    });

    // Invalidate cache for affected feeds
    for (const feed of feedsAffected) {
      const newVersion = await incrementDatasetVersion(feed);
      log.info("Dataset version incremented after reapply", { feed, version: newVersion });
    }

    log.info("Reapply job completed", {
      jobId,
      processedDiamonds,
      failedDiamonds,
      feedsAffected,
      durationMs: Date.now() - startedAt.getTime(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const nextRetryAt = calculateNextRetryTime(currentRetryCount + 1);

    log.error("Reapply job failed", {
      jobId,
      error: errorMsg,
      retryCount: currentRetryCount,
      nextRetryAt,
      willRetry: nextRetryAt !== null,
    });

    await updateReapplyJobStatus(jobId, "failed", {
      error: errorMsg,
      completedAt: new Date(),
      nextRetryAt,
    });
  }
}

/**
 * @openapi
 * /api/v2/pricing-rules/reapply:
 *   post:
 *     summary: Start an async repricing job for all available diamonds
 *     tags:
 *       - Pricing Rules
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       202:
 *         description: Repricing job accepted
 *       409:
 *         description: A repricing job is already running
 *       401:
 *         description: Unauthorized
 */
router.post("/reapply", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const running = await getRunningReapplyJob();
    if (running) {
      res.status(409).json({
        error: "A repricing job is already in progress",
        data: formatReapplyJob(running),
      });
      return;
    }

    const totalDiamonds = await countAvailableDiamonds();
    if (totalDiamonds === 0) {
      throw badRequest("No available diamonds to reprice");
    }

    const jobId = await createReapplyJob(totalDiamonds);

    // Fire-and-forget
    executeReapplyJob(jobId).catch((err) => {
      log.error("Unhandled error in reapply job", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    res.status(202).json({
      data: {
        id: jobId,
        total_diamonds: totalDiamonds,
        message: "Repricing job started",
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules/reapply/jobs:
 *   get:
 *     summary: List repricing job history
 *     tags:
 *       - Pricing Rules
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       200:
 *         description: List of repricing jobs
 *       401:
 *         description: Unauthorized
 */
router.get("/reapply/jobs", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await getReapplyJobs();
    res.json({ data: { jobs: jobs.map(formatReapplyJob) } });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules/reapply/jobs/{id}:
 *   get:
 *     summary: Get repricing job status
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
 *         description: Job status
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
router.get("/reapply/jobs/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getReapplyJob(req.params.id!);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ data: formatReapplyJob(job) });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules/reapply/jobs/{id}/revert:
 *   post:
 *     summary: Revert a completed repricing job
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
 *         description: Revert completed
 *       400:
 *         description: Job is not in a revertable state
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
router.post("/reapply/jobs/:id/revert", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getReapplyJob(req.params.id!);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (job.status !== "completed") {
      throw badRequest(`Cannot revert job with status '${job.status}'. Only completed jobs can be reverted.`);
    }

    await updateReapplyJobStatus(job.id, "running");
    log.info("Revert started", { jobId: job.id });

    try {
      const reverted = await revertDiamondPricingFromSnapshots(job.id);

      await updateReapplyJobStatus(job.id, "reverted", {
        revertedAt: new Date(),
      });

      // Invalidate cache for affected feeds
      for (const feed of job.feedsAffected) {
        const newVersion = await incrementDatasetVersion(feed);
        log.info("Dataset version incremented after revert", { feed, version: newVersion });
      }

      log.info("Revert completed", { jobId: job.id, diamondsReverted: reverted });

      res.json({
        data: {
          message: "Revert completed",
          diamonds_reverted: reverted,
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateReapplyJobStatus(job.id, "failed", { error: `Revert failed: ${errorMsg}` });
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/pricing-rules/reapply/jobs/{id}/resume:
 *   post:
 *     summary: Manually resume a failed reapply job
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
 *       202:
 *         description: Job resume accepted
 *       400:
 *         description: Job cannot be resumed (not failed, max retries reached, or race condition)
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
router.post("/reapply/jobs/:id/resume", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getReapplyJob(req.params.id!);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== "failed") {
      throw badRequest(
        `Cannot resume job with status '${job.status}'. Only failed jobs can be resumed.`
      );
    }

    if (job.retryCount >= REAPPLY_MAX_RETRIES) {
      throw badRequest(
        `Job has reached maximum retry limit (${REAPPLY_MAX_RETRIES}). Cannot retry further.`
      );
    }

    // Atomic state transition: failed → pending, increment retry_count
    const resetSuccess = await resetJobForRetry(job.id);
    if (!resetSuccess) {
      throw badRequest(
        "Job has already been picked up by another process. Retry later if needed."
      );
    }

    log.info("Manually resuming failed reapply job", {
      jobId: job.id,
      previousRetryCount: job.retryCount,
      newRetryCount: job.retryCount + 1,
    });

    // Fire-and-forget execution with incremented retry count
    executeReapplyJob(job.id, job.retryCount + 1).catch((err) => {
      log.error("Manual resume execution failed", { err, jobId: job.id });
    });

    res.status(202).json({
      data: {
        message: "Job resume accepted",
        id: job.id,
        retry_count: job.retryCount + 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Export for monitoring service (avoid circular dependency with dynamic import)
export { executeReapplyJob };

export default router;
