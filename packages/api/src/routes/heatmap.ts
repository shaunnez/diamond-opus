import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  DIAMOND_SHAPES,
  HEATMAP_MAX_WORKERS,
  HEATMAP_MIN_RECORDS_PER_WORKER,
  BLOB_CONTAINERS,
  createLogger,
  optionalEnv,
} from "@diamond/shared";
import {
  NivodaAdapter,
  scanHeatmap,
  type NivodaQuery,
  type HeatmapConfig,
} from "@diamond/nivoda";
import { BlobServiceClient } from "@azure/storage-blob";

const router = Router();
const logger = createLogger({ service: "api-heatmap" });

// ============================================================================
// Azure Blob Storage helpers for heatmap history
// ============================================================================

let blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient | null {
  const connectionString = optionalEnv("AZURE_STORAGE_CONNECTION_STRING", "");
  if (!connectionString) return null;
  if (!blobServiceClient) {
    blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
  }
  return blobServiceClient;
}

async function streamToString(
  readableStream: NodeJS.ReadableStream
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data: Buffer) => chunks.push(data));
    readableStream.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8"))
    );
    readableStream.on("error", reject);
  });
}

interface HeatmapHistoryEntry {
  scanned_at: string;
  scan_type: "run" | "preview";
  feed: string;
  config: Record<string, unknown>;
  result: {
    total_records: number;
    worker_count: number;
    stats: {
      api_calls: number;
      scan_duration_ms: number;
      ranges_scanned: number;
      non_empty_ranges: number;
      used_two_pass: boolean;
    };
    density_map: { min_price: number; max_price: number; count: number }[];
    partitions: {
      partition_id: string;
      min_price: number;
      max_price: number;
      total_records: number;
    }[];
  };
}

/**
 * Save heatmap result to Azure Blob Storage.
 * Blob path: {feed}/{scanType}.json
 */
async function saveHeatmapHistory(entry: HeatmapHistoryEntry): Promise<void> {
  const client = getBlobServiceClient();
  if (!client) {
    logger.warn("Azure Storage not configured, skipping heatmap history save");
    return;
  }

  const containerClient = client.getContainerClient(
    BLOB_CONTAINERS.HEATMAPS
  );
  await containerClient.createIfNotExists();

  const blobName = `${entry.feed}/${entry.scan_type}.json`;
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const content = JSON.stringify(entry);

  await blobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });

  logger.info("Saved heatmap history", {
    blobName,
    totalRecords: entry.result.total_records,
  });
}

/**
 * Load heatmap history from Azure Blob Storage.
 */
async function loadHeatmapHistory(
  feed: string,
  scanType: string
): Promise<HeatmapHistoryEntry | null> {
  const client = getBlobServiceClient();
  if (!client) return null;

  const containerClient = client.getContainerClient(
    BLOB_CONTAINERS.HEATMAPS
  );
  const blobName = `${feed}/${scanType}.json`;
  const blobClient = containerClient.getBlobClient(blobName);

  try {
    const downloadResponse = await blobClient.download();
    const content = await streamToString(
      downloadResponse.readableStreamBody!
    );
    return JSON.parse(content) as HeatmapHistoryEntry;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null;
    }
    throw error;
  }
}

// ============================================================================
// Helper to transform scan result to API response shape
// ============================================================================

function transformResult(result: {
  totalRecords: number;
  workerCount: number;
  stats: {
    apiCalls: number;
    scanDurationMs: number;
    rangesScanned: number;
    nonEmptyRanges: number;
    usedTwoPass: boolean;
  };
  densityMap: { min: number; max: number; count: number }[];
  partitions: {
    partitionId: string;
    minPrice: number;
    maxPrice: number;
    totalRecords: number;
  }[];
}) {
  return {
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
  };
}

// ============================================================================
// Request body interface
// ============================================================================

interface RunHeatmapBody {
  mode?: "single-pass" | "two-pass";
  min_price?: number;
  max_price?: number;
  max_workers?: number;
  dense_zone_threshold?: number;
  dense_zone_step?: number;
  max_total_records?: number;
  feed?: string;
}

/**
 * @openapi
 * /api/v2/heatmap/run:
 *   post:
 *     summary: Run a heatmap scan to analyze diamond inventory density
 *     description: |
 *       Executes the heatmap scanning algorithm to analyze diamond inventory
 *       density by price range. Returns density map and partitioning information.
 *       Results are automatically saved to Azure Blob Storage for history.
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
 *               feed:
 *                 type: string
 *                 default: nivoda
 *                 description: Feed identifier for history storage
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
      const feed = body.feed ?? "nivoda";

      const log = logger.child({ component: "heatmap-api" });
      log.info("Starting heatmap scan via API", { body, feed });

      const adapter = new NivodaAdapter();

      // Build base query
      const baseQuery: NivodaQuery = {
        shapes: [...DIAMOND_SHAPES],
        sizes: { from: 0.4, to: 15.01 },
        has_image: true,
        has_v360: true,
        availability: ['AVAILABLE'],
        excludeFairPoorCuts: true,
        hide_memo: true
      };


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

      const transformed = transformResult(result);

      // Save to blob storage (fire and forget - don't block response)
      saveHeatmapHistory({
        scanned_at: new Date().toISOString(),
        scan_type: "run",
        feed,
        config: {
          mode: body.mode ?? "single-pass",
          min_price: heatmapConfig.minPrice,
          max_price: heatmapConfig.maxPrice,
          max_workers: heatmapConfig.maxWorkers,
        },
        result: transformed,
      }).catch((err) => {
        log.error("Failed to save heatmap history", { error: err });
      });

      res.json({ data: transformed });
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
 *       Results are automatically saved to Azure Blob Storage for history.
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
 *               feed:
 *                 type: string
 *                 default: nivoda
 *                 description: Feed identifier for history storage
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
      const feed = body.feed ?? "nivoda";

      const log = logger.child({ component: "heatmap-preview" });
      log.info("Starting heatmap preview", { body, feed });

      const adapter = new NivodaAdapter();

      const baseQuery: NivodaQuery = {
        shapes: [...DIAMOND_SHAPES],
        sizes: { from: 0.4, to: 15.01 },
        has_image: true,
        has_v360: true,
        availability: ['AVAILABLE'],
        excludeFairPoorCuts: true,
        hide_memo: true
      };

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

      const transformed = transformResult(result);

      // Save to blob storage (fire and forget)
      saveHeatmapHistory({
        scanned_at: new Date().toISOString(),
        scan_type: "preview",
        feed,
        config: {
          mode: "two-pass",
          min_price: heatmapConfig.minPrice,
          max_price: heatmapConfig.maxPrice,
          max_workers: heatmapConfig.maxWorkers,
        },
        result: transformed,
      }).catch((err) => {
        log.error("Failed to save heatmap history", { error: err });
      });

      res.json({ data: transformed });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Heatmap History
// ============================================================================

/**
 * @openapi
 * /api/v2/heatmap/history/{feed}:
 *   get:
 *     summary: Get last heatmap scan results for a feed
 *     description: |
 *       Retrieves the most recent stored heatmap scan results for the
 *       specified feed. Returns both run and preview results if available.
 *     tags:
 *       - Heatmap
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: feed
 *         required: true
 *         schema:
 *           type: string
 *         description: Feed identifier (e.g., "nivoda")
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [run, preview]
 *         description: Filter by scan type. If omitted, returns both.
 *     responses:
 *       200:
 *         description: Heatmap history for the feed
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Azure Storage not configured
 */
router.get(
  "/history/:feed",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { feed } = req.params;
      const scanType = req.query.type as string | undefined;

      const client = getBlobServiceClient();
      if (!client) {
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Azure Storage not configured",
          },
        });
        return;
      }

      if (scanType) {
        // Return specific scan type
        const entry = await loadHeatmapHistory(feed, scanType);
        res.json({ data: entry });
      } else {
        // Return both run and preview
        const [run, preview] = await Promise.all([
          loadHeatmapHistory(feed, "run"),
          loadHeatmapHistory(feed, "preview"),
        ]);
        res.json({ data: { run, preview } });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
