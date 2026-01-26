import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  getDashboardSummary,
  getRunsWithStats,
  getRunDetails,
  getSupplierStats,
  getConsolidationProgress,
  getOverallConsolidationStats,
  executeQuery,
  isAllowedTable,
  type RunsFilter,
} from '@diamond/database';
import { validateQuery, validateParams, validateBody, badRequest, notFound } from '../middleware/index.js';
import {
  runsQuerySchema,
  runIdSchema,
  queryProxySchema,
  tableParamSchema,
  type RunsQuery,
  type RunIdParams,
  type QueryProxyBody,
  type TableParams,
} from '../validators/index.js';

const router = Router();

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
 *           maximum: 100
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
// Suppliers
// ============================================================================

/**
 * @openapi
 * /api/v2/analytics/suppliers:
 *   get:
 *     summary: Get diamond statistics grouped by supplier
 *     tags:
 *       - Analytics
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     responses:
 *       200:
 *         description: Supplier statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/suppliers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const suppliers = await getSupplierStats();
    res.json({ data: suppliers });
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
 *     responses:
 *       200:
 *         description: Overall consolidation progress
 *       401:
 *         description: Unauthorized
 */
router.get('/consolidation', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getOverallConsolidationStats();
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId } = (req as Request & { validatedParams: RunIdParams }).validatedParams;
      const progress = await getConsolidationProgress(runId);

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
