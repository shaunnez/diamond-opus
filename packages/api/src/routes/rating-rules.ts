import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getActiveRatingRules,
  createRatingRule,
  updateRatingRule,
  deactivateRatingRule,
  createRatingReapplyJob,
  getRatingReapplyJob,
  getRatingReapplyJobs,
  getRunningRatingReapplyJob,
  updateRatingReapplyJobStatus,
  countAvailableDiamondsForRating,
  getAvailableDiamondsBatchForRating,
  batchUpdateDiamondRating,
  insertRatingReapplySnapshots,
  revertDiamondRatingFromSnapshots,
  incrementDatasetVersion,
  resetRatingJobForRetry,
} from "@diamond/database";
import { createServiceLogger } from "@diamond/shared";
import {
  RATING_REAPPLY_BATCH_SIZE,
  RATING_REAPPLY_MAX_RETRIES,
  RATING_REAPPLY_RETRY_BASE_DELAY_MINUTES,
  RATING_REAPPLY_RETRY_MAX_DELAY_MINUTES,
} from "@diamond/shared";
import { RatingEngine } from "@diamond/rating-engine";
import { badRequest } from "../middleware/index.js";

const router = Router();
const log = createServiceLogger("rating-reapply");

// --- Rating rule CRUD ---

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await getActiveRatingRules();

    res.json({
      data: {
        rules: rules.map((rule) => ({
          id: rule.id,
          priority: rule.priority,
          price_min: rule.priceMin,
          price_max: rule.priceMax,
          shapes: rule.shapes,
          colors: rule.colors,
          clarities: rule.clarities,
          cuts: rule.cuts,
          feed: rule.feed,
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

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;

    if (body.priority === undefined) {
      throw badRequest("priority is required");
    }
    if (body.rating === undefined) {
      throw badRequest("rating is required");
    }

    const rating = parseInt(body.rating, 10);
    if (isNaN(rating) || rating < 1 || rating > 10) {
      throw badRequest("rating must be between 1 and 10");
    }

    const rule = await createRatingRule({
      priority: parseInt(body.priority, 10),
      priceMin: body.price_min !== undefined ? parseFloat(body.price_min) : undefined,
      priceMax: body.price_max !== undefined ? parseFloat(body.price_max) : undefined,
      shapes: body.shapes,
      colors: body.colors,
      clarities: body.clarities,
      cuts: body.cuts,
      feed: body.feed,
      rating,
    });

    let reapplyJobId: string | undefined;
    if (body.recalculate_rating === true) {
      const running = await getRunningRatingReapplyJob();
      if (running) {
        res.status(409).json({
          error: "A rating reapply job is already in progress",
          data: {
            rule: formatRule(rule),
            running_job: formatReapplyJob(running),
          },
        });
        return;
      }

      const totalDiamonds = await countAvailableDiamondsForRating();
      if (totalDiamonds > 0) {
        reapplyJobId = await createRatingReapplyJob(totalDiamonds, {
          triggerType: 'rule_create',
          triggeredByRuleId: rule.id,
          triggerRuleSnapshot: {
            priority: rule.priority,
            price_min: rule.priceMin,
            price_max: rule.priceMax,
            shapes: rule.shapes,
            colors: rule.colors,
            clarities: rule.clarities,
            cuts: rule.cuts,
            feed: rule.feed,
            rating: rule.rating,
          },
        });

        executeRatingReapplyJob(reapplyJobId).catch((err) => {
          log.error("Unhandled error in rating reapply job", {
            jobId: reapplyJobId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        log.info("Rating reapply job started after rule creation", {
          ruleId: rule.id,
          jobId: reapplyJobId,
          totalDiamonds,
        });
      }
    }

    res.status(201).json({
      data: {
        ...formatRule(rule),
        reapply_job_id: reapplyJobId,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!id) {
      throw badRequest("id is required");
    }

    const updates: {
      priority?: number;
      priceMin?: number;
      priceMax?: number;
      shapes?: string[];
      colors?: string[];
      clarities?: string[];
      cuts?: string[];
      feed?: string;
      rating?: number;
      active?: boolean;
    } = {};

    if (body.priority !== undefined) {
      updates.priority = parseInt(body.priority, 10);
    }
    if (body.price_min !== undefined) {
      updates.priceMin = body.price_min === null ? undefined : parseFloat(body.price_min);
    }
    if (body.price_max !== undefined) {
      updates.priceMax = body.price_max === null ? undefined : parseFloat(body.price_max);
    }
    if (body.shapes !== undefined) {
      updates.shapes = body.shapes;
    }
    if (body.colors !== undefined) {
      updates.colors = body.colors;
    }
    if (body.clarities !== undefined) {
      updates.clarities = body.clarities;
    }
    if (body.cuts !== undefined) {
      updates.cuts = body.cuts;
    }
    if (body.feed !== undefined) {
      updates.feed = body.feed;
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

    await updateRatingRule(id, updates);

    let reapplyJobId: string | undefined;
    if (body.recalculate_rating === true) {
      const running = await getRunningRatingReapplyJob();
      if (running) {
        res.status(409).json({
          error: "A rating reapply job is already in progress",
          data: {
            message: "Rule updated successfully",
            id,
            running_job: formatReapplyJob(running),
          },
        });
        return;
      }

      const totalDiamonds = await countAvailableDiamondsForRating();
      if (totalDiamonds > 0) {
        reapplyJobId = await createRatingReapplyJob(totalDiamonds, {
          triggerType: 'rule_update',
          triggeredByRuleId: id,
          triggerRuleSnapshot: {
            priority: updates.priority,
            price_min: updates.priceMin,
            price_max: updates.priceMax,
            shapes: updates.shapes,
            colors: updates.colors,
            clarities: updates.clarities,
            cuts: updates.cuts,
            feed: updates.feed,
            rating: updates.rating,
          },
        });

        executeRatingReapplyJob(reapplyJobId).catch((err) => {
          log.error("Unhandled error in rating reapply job", {
            jobId: reapplyJobId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        log.info("Rating reapply job started after rule update", {
          ruleId: id,
          jobId: reapplyJobId,
          totalDiamonds,
        });
      }
    }

    res.json({
      data: {
        message: "Rule updated successfully",
        id,
        reapply_job_id: reapplyJobId,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw badRequest("id is required");
      }

      await deactivateRatingRule(id);

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

// --- Reapply rating endpoints ---

function formatRule(rule: {
  id: string;
  priority: number;
  priceMin?: number;
  priceMax?: number;
  shapes?: string[];
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  feed?: string;
  rating: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: rule.id,
    priority: rule.priority,
    price_min: rule.priceMin,
    price_max: rule.priceMax,
    shapes: rule.shapes,
    colors: rule.colors,
    clarities: rule.clarities,
    cuts: rule.cuts,
    feed: rule.feed,
    rating: rule.rating,
    active: rule.active,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

function formatReapplyJob(job: {
  id: string;
  status: string;
  totalDiamonds: number;
  processedDiamonds: number;
  updatedDiamonds: number;
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
  triggerType: string | null;
  triggeredByRuleId: string | null;
  triggerRuleSnapshot: any | null;
}) {
  return {
    id: job.id,
    status: job.status,
    total_diamonds: job.totalDiamonds,
    processed_diamonds: job.processedDiamonds,
    updated_diamonds: job.updatedDiamonds,
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
    trigger_type: job.triggerType,
    triggered_by_rule_id: job.triggeredByRuleId,
    trigger_rule_snapshot: job.triggerRuleSnapshot,
  };
}

function calculateNextRetryTime(retryCount: number): Date | null {
  if (retryCount >= RATING_REAPPLY_MAX_RETRIES) {
    return null;
  }

  const delayMinutes = Math.min(
    RATING_REAPPLY_RETRY_BASE_DELAY_MINUTES * Math.pow(3, retryCount),
    RATING_REAPPLY_RETRY_MAX_DELAY_MINUTES
  );

  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
  return nextRetry;
}

async function executeRatingReapplyJob(jobId: string, currentRetryCount: number = 0): Promise<void> {
  const startedAt = new Date();
  try {
    await updateRatingReapplyJobStatus(jobId, "running", {
      startedAt,
      lastProgressAt: startedAt,
      retryCount: currentRetryCount,
    });
    log.info("Rating reapply job started", { jobId, retryCount: currentRetryCount });

    const engine = new RatingEngine();
    await engine.loadRules();

    let cursor: string | null = null;
    let processedDiamonds = 0;
    let updatedDiamonds = 0;
    let failedDiamonds = 0;
    const feedsSet = new Set<string>();

    while (true) {
      const batch = await getAvailableDiamondsBatchForRating(cursor, RATING_REAPPLY_BATCH_SIZE);
      if (batch.length === 0) break;

      cursor = batch[batch.length - 1]!.id;

      const updates: Array<{
        id: string;
        rating: number | undefined;
      }> = [];
      const snapshots: Array<{
        diamondId: string;
        feed: string;
        oldRating: number | null;
        newRating: number | null;
      }> = [];

      for (const diamond of batch) {
        try {
          const newRating = engine.calculateRating({
            feedPrice: diamond.feedPrice,
            shape: diamond.shape,
            color: diamond.color ?? undefined,
            clarity: diamond.clarity ?? undefined,
            cut: diamond.cut ?? undefined,
            feed: diamond.feed,
          });

          const oldRating = diamond.rating;
          const newRatingValue = newRating ?? null;

          if (oldRating !== newRatingValue) {
            updates.push({
              id: diamond.id,
              rating: newRating,
            });

            snapshots.push({
              diamondId: diamond.id,
              feed: diamond.feed,
              oldRating: oldRating,
              newRating: newRatingValue,
            });

            feedsSet.add(diamond.feed);
          }
        } catch (err) {
          failedDiamonds++;
          log.warn("Failed to rerate diamond", {
            jobId,
            diamondId: diamond.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (updates.length > 0) {
        await batchUpdateDiamondRating(updates);
        await insertRatingReapplySnapshots(jobId, snapshots);
        updatedDiamonds += updates.length;
      }

      processedDiamonds += batch.length;

      await updateRatingReapplyJobStatus(jobId, "running", {
        processedDiamonds,
        updatedDiamonds,
        failedDiamonds,
        lastProgressAt: new Date(),
      });

      log.info("Rating reapply batch processed", {
        jobId,
        processedDiamonds,
        updatedDiamonds,
        batchSize: batch.length,
        changedInBatch: updates.length,
      });
    }

    const feedsAffected = Array.from(feedsSet);
    const completedAt = new Date();

    await updateRatingReapplyJobStatus(jobId, "completed", {
      processedDiamonds,
      updatedDiamonds,
      failedDiamonds,
      feedsAffected,
      completedAt,
    });

    for (const feed of feedsAffected) {
      const newVersion = await incrementDatasetVersion(feed);
      log.info("Dataset version incremented after rating reapply", { feed, version: newVersion });
    }

    log.info("Rating reapply job completed", {
      jobId,
      processedDiamonds,
      updatedDiamonds,
      failedDiamonds,
      feedsAffected,
      durationMs: Date.now() - startedAt.getTime(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const nextRetryAt = calculateNextRetryTime(currentRetryCount + 1);

    log.error("Rating reapply job failed", {
      jobId,
      error: errorMsg,
      retryCount: currentRetryCount,
      nextRetryAt,
      willRetry: nextRetryAt !== null,
    });

    await updateRatingReapplyJobStatus(jobId, "failed", {
      error: errorMsg,
      completedAt: new Date(),
      nextRetryAt,
    });
  }
}

router.get("/reapply/jobs", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await getRatingReapplyJobs();
    res.json({ data: { jobs: jobs.map(formatReapplyJob) } });
  } catch (error) {
    next(error);
  }
});

router.get("/reapply/jobs/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getRatingReapplyJob(req.params.id!);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ data: formatReapplyJob(job) });
  } catch (error) {
    next(error);
  }
});

router.post("/reapply/jobs/:id/revert", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getRatingReapplyJob(req.params.id!);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (job.status !== "completed") {
      throw badRequest(`Cannot revert job with status '${job.status}'. Only completed jobs can be reverted.`);
    }

    await updateRatingReapplyJobStatus(job.id, "running");
    log.info("Rating revert started", { jobId: job.id });

    try {
      const reverted = await revertDiamondRatingFromSnapshots(job.id);

      await updateRatingReapplyJobStatus(job.id, "reverted", {
        revertedAt: new Date(),
      });

      for (const feed of job.feedsAffected) {
        const newVersion = await incrementDatasetVersion(feed);
        log.info("Dataset version incremented after rating revert", { feed, version: newVersion });
      }

      log.info("Rating revert completed", { jobId: job.id, diamondsReverted: reverted });

      res.json({
        data: {
          message: "Revert completed",
          diamonds_reverted: reverted,
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateRatingReapplyJobStatus(job.id, "failed", { error: `Revert failed: ${errorMsg}` });
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

router.post("/reapply/jobs/:id/resume", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getRatingReapplyJob(req.params.id!);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== "failed") {
      throw badRequest(
        `Cannot resume job with status '${job.status}'. Only failed jobs can be resumed.`
      );
    }

    if (job.retryCount >= RATING_REAPPLY_MAX_RETRIES) {
      throw badRequest(
        `Job has reached maximum retry limit (${RATING_REAPPLY_MAX_RETRIES}). Cannot retry further.`
      );
    }

    const resetSuccess = await resetRatingJobForRetry(job.id);
    if (!resetSuccess) {
      throw badRequest(
        "Job has already been picked up by another process. Retry later if needed."
      );
    }

    log.info("Manually resuming failed rating reapply job", {
      jobId: job.id,
      previousRetryCount: job.retryCount,
      newRetryCount: job.retryCount + 1,
    });

    executeRatingReapplyJob(job.id, job.retryCount + 1).catch((err) => {
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

export default router;
