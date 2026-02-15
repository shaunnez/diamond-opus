import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  getDashboardSummary,
  getRunsWithStats,
  getRunDetails,
  getRecentFailedWorkers,
  getFeedStats,
  getConsolidationProgress,
  getOverallConsolidationStats,
  getRunsConsolidationStatus,
  executeQuery,
  isAllowedTable,
  getErrorLogs,
  getErrorLogServices,
  clearErrorLogs,
  getHoldHistoryList,
  getPurchaseHistoryList,
  type RunsFilter,
  type AnalyticsFeed,
} from '@diamond/database';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  optionalEnv,
  BLOB_CONTAINERS,
  WATERMARK_BLOB_NAME,
  type Watermark,
} from '@diamond/shared';
import { validateQuery, validateParams, validateBody, badRequest, notFound } from '../middleware/index.js';
import {
  runsQuerySchema,
  runIdSchema,
  queryProxySchema,
  tableParamSchema,
  consolidationQuerySchema,
  type RunsQuery,
  type RunIdParams,
  type QueryProxyBody,
  type TableParams,
  type ConsolidationQuery,
} from '../validators/index.js';

const router = Router();

// ============================================================================
// Azure Blob Storage helpers for watermark
// ============================================================================

let blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient | null {
  const connectionString = optionalEnv('AZURE_STORAGE_CONNECTION_STRING', '');
  if (!connectionString) return null;
  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  }
  return blobServiceClient;
}

async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => chunks.push(data));
    readableStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    readableStream.on('error', reject);
  });
}

// ============================================================================
// Dashboard Summary
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/summary:
 *   get:
 *     summary: Get dashboard summary statistics
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary data
 *       401:
 *         description: Unauthorized
 */
router.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await getDashboardSummary();
    res.json({ data: summary });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Watermark (Azure Blob Storage)
// ============================================================================

const VALID_WATERMARK_FEEDS = ['nivoda', 'demo'] as const;

function resolveWatermarkBlobName(feed?: string): string {
  if (feed && VALID_WATERMARK_FEEDS.includes(feed as typeof VALID_WATERMARK_FEEDS[number])) {
    return `${feed}.json`;
  }
  return WATERMARK_BLOB_NAME;
}

router.get('/watermark', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getBlobServiceClient();
    if (!client) {
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Azure Storage not configured' },
      });
      return;
    }

    const feed = req.query.feed as string | undefined;
    const blobName = resolveWatermarkBlobName(feed);
    const containerClient = client.getContainerClient(BLOB_CONTAINERS.WATERMARKS);
    const blobClient = containerClient.getBlobClient(blobName);

    try {
      const downloadResponse = await blobClient.download();
      const content = await streamToString(downloadResponse.readableStreamBody!);
      const watermark = JSON.parse(content) as Watermark;
      res.json({ data: watermark });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        res.json({ data: null });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.put('/watermark', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getBlobServiceClient();
    if (!client) {
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Azure Storage not configured' },
      });
      return;
    }

    const { lastUpdatedAt, lastRunId, lastRunCompletedAt } = req.body;
    if (!lastUpdatedAt) {
      throw badRequest('lastUpdatedAt is required');
    }

    const watermark: Watermark = {
      lastUpdatedAt,
      lastRunId,
      lastRunCompletedAt,
    };

    const feed = req.query.feed as string | undefined;
    const blobName = resolveWatermarkBlobName(feed);
    const containerClient = client.getContainerClient(BLOB_CONTAINERS.WATERMARKS);
    await containerClient.createIfNotExists();
    const blobClient = containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(watermark);

    await blobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });

    res.json({ data: watermark, message: 'Watermark updated successfully' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Runs
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/runs:
 *   get:
 *     summary: List pipeline runs with filtering
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: run_type
 *         schema:
 *           type: string
 *           enum: [full, incremental]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [running, completed, failed, partial]
 *       - in: query
 *         name: started_after
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: started_before
 *         schema:
 *           type: string
 *           format: date-time
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
 *           maximum: 500
 *     responses:
 *       200:
 *         description: List of runs with statistics
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/runs',
  validateQuery(runsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as Request & { validatedQuery: RunsQuery }).validatedQuery;

      const filters: RunsFilter = {
        runType: query.run_type,
        status: query.status,
        feed: query.feed,
        startedAfter: query.started_after,
        startedBefore: query.started_before,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      };

      const { runs, total } = await getRunsWithStats(filters);

      res.json({
        data: runs,
        pagination: {
          total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/analytics/runs/{runId}:
 *   get:
 *     summary: Get detailed information about a specific run
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Run details with worker breakdown
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/runs/:runId',
  validateParams(runIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId } = (req as Request & { validatedParams: RunIdParams }).validatedParams;
      const { run, workers } = await getRunDetails(runId);

      if (!run) {
        throw notFound('Run not found');
      }

      res.json({ data: { run, workers } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Failed Workers
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/failed-workers:
 *   get:
 *     summary: Get recent failed workers across all runs
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: List of recent failed workers
 *       401:
 *         description: Unauthorized
 */
router.get('/failed-workers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const workers = await getRecentFailedWorkers(limit);
    res.json({ data: workers });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Feeds
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/feeds:
 *   get:
 *     summary: Get diamond statistics grouped by feed
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       200:
 *         description: Feed statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/feeds', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const feeds = await getFeedStats();
    res.json({ data: feeds });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Consolidation
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/consolidation:
 *   get:
 *     summary: Get overall consolidation statistics
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: feed
 *         schema:
 *           type: string
 *           enum: [nivoda, demo]
 *           default: nivoda
 *         description: Feed to get consolidation stats for
 *     responses:
 *       200:
 *         description: Overall consolidation progress
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/consolidation',
  validateQuery(consolidationQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { feed } = (req as Request & { validatedQuery: ConsolidationQuery }).validatedQuery;
      const stats = await getOverallConsolidationStats(feed as AnalyticsFeed);
      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/analytics/consolidation/status:
 *   get:
 *     summary: Get consolidation status for recent runs
 *     description: |
 *       Returns per-run consolidation status including recorded outcome stats
 *       and live progress counts from the raw diamonds table for the specified
 *       feed. Used by the dashboard to show which runs completed fully and
 *       which can be resumed.
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: feed
 *         schema:
 *           type: string
 *           enum: [nivoda, demo]
 *           default: nivoda
 *         description: Feed to get consolidation status for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Consolidation status for recent runs
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/consolidation/status',
  validateQuery(consolidationQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { feed, limit: validatedLimit } = (req as Request & { validatedQuery: ConsolidationQuery }).validatedQuery;
      const limit = validatedLimit ?? 10;
      const statuses = await getRunsConsolidationStatus(limit, feed as AnalyticsFeed);
      res.json({ data: statuses });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/analytics/consolidation/{runId}:
 *   get:
 *     summary: Get consolidation progress for a specific run
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: feed
 *         schema:
 *           type: string
 *           enum: [nivoda, demo]
 *           default: nivoda
 *         description: Feed to get consolidation progress for
 *     responses:
 *       200:
 *         description: Consolidation progress for the run
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/consolidation/:runId',
  validateParams(runIdSchema),
  validateQuery(consolidationQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId } = (req as Request & { validatedParams: RunIdParams }).validatedParams;
      const { feed } = (req as Request & { validatedQuery: ConsolidationQuery }).validatedQuery;
      const progress = await getConsolidationProgress(runId, feed as AnalyticsFeed);

      if (!progress) {
        throw notFound('No consolidation data found for this run');
      }

      res.json({ data: progress });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Holds & Orders History
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/holds:
 *   get:
 *     summary: Get hold history
 *     description: Returns a paginated list of diamond hold records.
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
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
 *     responses:
 *       200:
 *         description: Paginated list of holds
 *       401:
 *         description: Unauthorized
 */
router.get('/holds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    const { holds, total } = await getHoldHistoryList(limit, offset);

    res.json({
      data: holds,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/analytics/orders:
 *   get:
 *     summary: Get purchase history
 *     description: Returns a paginated list of diamond purchase/order records.
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
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
 *     responses:
 *       200:
 *         description: Paginated list of orders
 *       401:
 *         description: Unauthorized
 */
router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    const { orders, total } = await getPurchaseHistoryList(limit, offset);

    res.json({
      data: orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Error Logs
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/error-logs:
 *   get:
 *     summary: Get error logs with optional service filter
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: service
 *         schema:
 *           type: string
 *           enum: [scheduler, worker, consolidator, api]
 *       - in: query
 *         name: runId
 *         schema:
 *           type: string
 *         description: Filter by runId stored in context
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs created after this time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs created before this time
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
 *     responses:
 *       200:
 *         description: Paginated error logs
 *       401:
 *         description: Unauthorized
 */
router.get('/error-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = req.query.service as string | undefined;
    const runId = req.query.runId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    const { logs, total } = await getErrorLogs({ service, runId, from, to, limit, offset });

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/analytics/error-logs/services:
 *   get:
 *     summary: Get distinct services that have error logs
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       200:
 *         description: List of service names
 *       401:
 *         description: Unauthorized
 */
router.get('/error-logs/services', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const services = await getErrorLogServices();
    res.json({ data: services });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v2/analytics/error-logs:
 *   delete:
 *     summary: Clear error logs, optionally filtered by service
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: service
 *         schema:
 *           type: string
 *         description: Filter by service name
 *     responses:
 *       200:
 *         description: Number of deleted error logs
 *       401:
 *         description: Unauthorized
 */
router.delete('/error-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = req.query.service as string | undefined;
    const deleted = await clearErrorLogs(service);
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Query Proxy
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/query/{table}:
 *   post:
 *     summary: Execute a flexible query against allowed tables
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema:
 *           type: string
 *           enum: [diamonds, run_metadata, worker_runs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               select:
 *                 type: string
 *                 description: Columns to select (comma-separated)
 *               filters:
 *                 type: object
 *                 description: Filter conditions
 *               order:
 *                 type: object
 *                 properties:
 *                   column:
 *                     type: string
 *                   ascending:
 *                     type: boolean
 *               limit:
 *                 type: integer
 *                 default: 100
 *                 maximum: 1000
 *               offset:
 *                 type: integer
 *                 default: 0
 *     responses:
 *       200:
 *         description: Query results
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/query/:table',
  validateParams(tableParamSchema),
  validateBody(queryProxySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { table } = (req as Request & { validatedParams: TableParams }).validatedParams;
      const body = req.body as QueryProxyBody;

      if (!isAllowedTable(table)) {
        throw badRequest(`Table '${table}' is not allowed for querying`);
      }

      const result = await executeQuery(table, {
        select: body.select,
        filters: body.filters,
        order: body.order,
        limit: body.limit,
        offset: body.offset,
      });

      res.json({
        data: result.rows,
        pagination: {
          total: result.count,
          limit: body.limit,
          offset: body.offset,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not allowed')) {
        next(badRequest(error.message));
        return;
      }
      next(error);
    }
  }
);

export default router;
