import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  DIAMOND_SHAPES,
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  createLogger,
} from "@diamond/shared";
import {
  NivodaAdapter,
  scanHeatmap,
  type NivodaQuery,
  type HeatmapConfig,
} from "@diamond/nivoda";

const router = Router();
const logger = createLogger({ service: "api-heatmap" });

interface RunHeatmapBody {
  mode?: "single-pass" | "two-pass";
  min_price?: number;
  max_price?: number;
  max_workers?: number;
  dense_zone_threshold?: number;
  dense_zone_step?: number;
  max_total_records?: number;
  lab_grown?: boolean;
}

/**
 * @openapi
 * /api/v2/heatmap/run:
 *   post:
 *     summary: Run a heatmap scan to analyze diamond inventory density
 *     description: |
 *       Executes the heatmap scanning algorithm to analyze diamond inventory
 *       density by price range. Returns density map and partitioning information.
 *     tags:
 *       - Heatmap
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [single-pass, two-pass]
 *                 default: single-pass
 *                 description: Scanning mode - two-pass is more efficient for sparse data
 *               min_price:
 *                 type: number
 *                 default: 0
 *                 description: Minimum price to scan
 *               max_price:
 *                 type: number
 *                 default: 1000000
 *                 description: Maximum price to scan
 *               max_workers:
 *                 type: number
 *                 default: 30
 *                 description: Maximum number of worker partitions to create
 *               dense_zone_threshold:
 *                 type: number
 *                 default: 20000
 *                 description: Price threshold below which fixed steps are used
 *               dense_zone_step:
 *                 type: number
 *                 default: 100
 *                 description: Step size in dense zone
 *               max_total_records:
 *                 type: number
 *                 default: 0
 *                 description: Cap on total records (0 = unlimited)
 *               lab_grown:
 *                 type: boolean
 *                 description: Filter for lab-grown diamonds only
 *     responses:
 *       200:
 *         description: Heatmap scan completed successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Heatmap scan failed
 */
router.post(
  "/run",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RunHeatmapBody;

      const log = logger.child({ component: "heatmap-api" });
      log.info("Starting heatmap scan via API", { body });

      const adapter = new NivodaAdapter();

      // Build base query
      const baseQuery: NivodaQuery = {
        shapes: [...DIAMOND_SHAPES],
        sizes: { from: 0.5, to: 10 },
      };

      if (body.lab_grown !== undefined) {
        baseQuery.labgrown = body.lab_grown;
      }

      // Build heatmap config from request
      const heatmapConfig: HeatmapConfig = {
        minPrice: body.min_price ?? 0,
        maxPrice: body.max_price ?? 1000000,
        maxWorkers: body.max_workers ?? HEATMAP_MAX_WORKERS,
        minRecordsPerWorker: HEATMAP_MIN_RECORDS_PER_WORKER,
        useTwoPassScan: body.mode === "two-pass",
        maxTotalRecords: body.max_total_records ?? 0,
      };

      if (body.dense_zone_threshold !== undefined) {
        heatmapConfig.denseZoneThreshold = body.dense_zone_threshold;
      }

      if (body.dense_zone_step !== undefined) {
        heatmapConfig.denseZoneStep = body.dense_zone_step;
      }

      log.info("Running heatmap with config", { heatmapConfig });

      const result = await scanHeatmap(adapter, baseQuery, heatmapConfig, log);

      log.info("Heatmap scan completed", {
        totalRecords: result.totalRecords,
        workerCount: result.workerCount,
        stats: result.stats,
      });

      // Transform result for API response
      res.json({
        data: {
          total_records: result.totalRecords,
          worker_count: result.workerCount,
          stats: {
            api_calls: result.stats.apiCalls,
            scan_duration_ms: result.stats.scanDurationMs,
            ranges_scanned: result.stats.rangesScanned,
            non_empty_ranges: result.stats.nonEmptyRanges,
            used_two_pass: result.stats.usedTwoPass,
          },
          density_map: result.densityMap.map((chunk) => ({
            min_price: chunk.min,
            max_price: chunk.max,
            count: chunk.count,
          })),
          partitions: result.partitions.map((partition) => ({
            partition_id: partition.partitionId,
            min_price: partition.minPrice,
            max_price: partition.maxPrice,
            total_records: partition.totalRecords,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/heatmap/preview:
 *   post:
 *     summary: Preview heatmap scan with limited API calls
 *     description: |
 *       Runs a limited heatmap scan for preview purposes.
 *       Uses larger step sizes to reduce API calls.
 *     tags:
 *       - Heatmap
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               min_price:
 *                 type: number
 *                 default: 0
 *               max_price:
 *                 type: number
 *                 default: 100000
 *               lab_grown:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preview scan completed
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/preview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RunHeatmapBody;

      const log = logger.child({ component: "heatmap-preview" });
      log.info("Starting heatmap preview", { body });

      const adapter = new NivodaAdapter();

      const baseQuery: NivodaQuery = {
        shapes: [...DIAMOND_SHAPES],
        sizes: { from: 0.5, to: 10 },
      };

      if (body.lab_grown !== undefined) {
        baseQuery.labgrown = body.lab_grown;
      }

      // Use larger steps for preview (faster, fewer API calls)
      const heatmapConfig: HeatmapConfig = {
        minPrice: body.min_price ?? 0,
        maxPrice: body.max_price ?? 100000, // Default to lower max for preview
        maxWorkers: 10,
        minRecordsPerWorker: HEATMAP_MIN_RECORDS_PER_WORKER,
        denseZoneStep: 500, // Larger steps for preview
        denseZoneThreshold: 20000,
        initialStep: 5000,
        useTwoPassScan: true, // Two-pass is faster for preview
        coarseStep: 10000,
      };

      const result = await scanHeatmap(adapter, baseQuery, heatmapConfig, log);

      res.json({
        data: {
          total_records: result.totalRecords,
          worker_count: result.workerCount,
          stats: {
            api_calls: result.stats.apiCalls,
            scan_duration_ms: result.stats.scanDurationMs,
            ranges_scanned: result.stats.rangesScanned,
            non_empty_ranges: result.stats.nonEmptyRanges,
            used_two_pass: result.stats.usedTwoPass,
          },
          density_map: result.densityMap.map((chunk) => ({
            min_price: chunk.min,
            max_price: chunk.max,
            count: chunk.count,
          })),
          partitions: result.partitions.map((partition) => ({
            partition_id: partition.partitionId,
            min_price: partition.minPrice,
            max_price: partition.maxPrice,
            total_records: partition.totalRecords,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
