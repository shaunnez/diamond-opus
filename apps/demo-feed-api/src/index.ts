// Only load dotenv in development - production uses container env vars
if (process.env.NODE_ENV !== 'production') {
  const { config } = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rootDir = resolve(__dirname, '../../..');

  config({ path: resolve(rootDir, '.env.local') });
  config({ path: resolve(rootDir, '.env') });
}

import express from 'express';
import { query, closePool } from '@diamond/database';
import { createLogger } from '@diamond/shared';

const log = createLogger({ service: 'demo-feed-api' });
const PORT = parseInt(process.env.DEMO_FEED_API_PORT ?? '4000', 10);

const app = express();
app.use(express.json());

/**
 * GET /api/diamonds/count
 * Returns count of diamonds matching optional price and date filters.
 *
 * Query params:
 *   price_min, price_max - price range filter (USD)
 *   updated_from, updated_to - ISO 8601 date range filter
 */
app.get('/api/diamonds/count', async (req, res) => {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (req.query.price_min) {
      conditions.push(`asking_price_usd >= $${paramIndex++}`);
      params.push(Number(req.query.price_min));
    }
    if (req.query.price_max) {
      conditions.push(`asking_price_usd <= $${paramIndex++}`);
      params.push(Number(req.query.price_max));
    }
    if (req.query.updated_from) {
      conditions.push(`updated_at >= $${paramIndex++}`);
      params.push(req.query.updated_from);
    }
    if (req.query.updated_to) {
      conditions.push(`updated_at <= $${paramIndex++}`);
      params.push(req.query.updated_to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM demo_feed_inventory ${where}`,
      params
    );

    res.json({ total_count: parseInt(result.rows[0]?.count ?? '0', 10) });
  } catch (error) {
    log.error('Count query failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/diamonds
 * Returns paginated diamonds with optional filters.
 * Max 1000 per request.
 *
 * Query params:
 *   price_min, price_max - price range filter (USD)
 *   updated_from, updated_to - ISO 8601 date range filter
 *   offset - pagination offset (default 0)
 *   limit - page size (default 100, max 1000)
 *   order_by - sort field (default 'created_at')
 *   order_dir - sort direction: ASC or DESC (default 'ASC')
 */
app.get('/api/diamonds', async (req, res) => {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (req.query.price_min) {
      conditions.push(`asking_price_usd >= $${paramIndex++}`);
      params.push(Number(req.query.price_min));
    }
    if (req.query.price_max) {
      conditions.push(`asking_price_usd <= $${paramIndex++}`);
      params.push(Number(req.query.price_max));
    }
    if (req.query.updated_from) {
      conditions.push(`updated_at >= $${paramIndex++}`);
      params.push(req.query.updated_from);
    }
    if (req.query.updated_to) {
      conditions.push(`updated_at <= $${paramIndex++}`);
      params.push(req.query.updated_to);
    }

    const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10));
    const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10)));

    // Validate order_by against allowed columns to prevent SQL injection
    const allowedOrderBy = ['created_at', 'updated_at', 'asking_price_usd', 'weight_ct', 'stone_id'];
    const orderBy = allowedOrderBy.includes(String(req.query.order_by ?? ''))
      ? String(req.query.order_by)
      : 'created_at';
    const orderDir = String(req.query.order_dir ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM demo_feed_inventory ${where}
       ORDER BY ${orderBy} ${orderDir}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    res.json({
      items: result.rows,
      count: result.rows.length,
      offset,
      limit,
    });
  } catch (error) {
    log.error('Search query failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'demo-feed-api' });
});

const server = app.listen(PORT, () => {
  log.info(`Demo feed API listening on port ${PORT}`);
});

async function shutdown() {
  log.info('Shutting down');
  server.close();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
