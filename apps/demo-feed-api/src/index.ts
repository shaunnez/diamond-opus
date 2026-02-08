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
 * POST /api/seed
 * Generate deterministic test data for the demo feed.
 *
 * Body:
 *   mode - "full" (truncate + insert) or "incremental" (append)
 *   count - number of diamonds to generate (default: 100000 for full, 5000 for incremental)
 */
app.post('/api/seed', async (req, res) => {
  const mode: string = req.body?.mode ?? 'full';
  if (mode !== 'full' && mode !== 'incremental') {
    res.status(400).json({ error: 'mode must be "full" or "incremental"' });
    return;
  }

  const SHAPES = ['ROUND', 'OVAL', 'EMERALD', 'CUSHION', 'ASSCHER', 'RADIANT', 'MARQUISE', 'PEAR', 'PRINCESS', 'HEART'];
  const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2'];
  const CUTS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR'];
  const POLISH_GRADES = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'];
  const SYMMETRY_GRADES = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'];
  const FLUORESCENCE_LEVELS = ['NONE', 'FAINT', 'MEDIUM', 'STRONG', 'VERY_STRONG'];
  const CERT_LABS = ['GIA', 'AGS', 'IGI', 'HRD', 'GCAL'];
  const VENDORS = [
    'Brilliant Earth Demo', 'Blue Nile Demo', 'James Allen Demo', 'Whiteflash Demo',
    'Adiamor Demo', 'Brian Gavin Demo', 'Good Old Gold Demo', 'Victor Canera Demo',
  ];

  // Seeded PRNG (mulberry32) for deterministic generation
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      const t0 = Math.imul(a ^ (a >>> 15), 1 | a);
      const t = (t0 + Math.imul(t0 ^ (t0 >>> 7), 61 | t0)) ^ t0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick<T>(rng: () => number, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)]!;
  }

  function generateDiamond(rng: () => number, index: number) {
    const shape = pick(rng, SHAPES);
    const carats = Math.round((0.5 + Math.pow(rng(), 2) * 4.5) * 100) / 100;
    const color = pick(rng, COLORS);
    const clarity = pick(rng, CLARITIES);
    const isLabCreated = rng() < 0.3;
    const colorIndex = COLORS.indexOf(color);
    const clarityIndex = CLARITIES.indexOf(clarity);
    const qualityFactor = Math.max(0.3, 1 - (colorIndex * 0.05 + clarityIndex * 0.08));
    const basePricePerCarat = isLabCreated
      ? 800 + qualityFactor * 3000
      : 2000 + qualityFactor * 15000;
    const pricePerCarat = Math.round((basePricePerCarat * (0.85 + rng() * 0.3)) * 100) / 100;
    const totalPrice = Math.round(pricePerCarat * carats * 100) / 100;
    const stoneId = `DEMO-${String(index + 1).padStart(7, '0')}`;

    return {
      stone_id: stoneId, weight_ct: carats, stone_shape: shape, stone_color: color,
      stone_clarity: clarity, cut_grade: pick(rng, CUTS), polish_grade: pick(rng, POLISH_GRADES),
      symmetry_grade: pick(rng, SYMMETRY_GRADES), fluorescence_level: pick(rng, FLUORESCENCE_LEVELS),
      asking_price_usd: totalPrice, price_per_ct_usd: pricePerCarat,
      is_lab_created: isLabCreated, is_treated: rng() < 0.05,
      availability_status: 'available', cert_lab: pick(rng, CERT_LABS),
      cert_number: `${pick(rng, CERT_LABS)}-${Math.floor(rng() * 9000000 + 1000000)}`,
      vendor_name: pick(rng, VENDORS),
    };
  }

  const FULL_DEFAULT = 100000;
  const INCREMENTAL_DEFAULT = 5000;
  const BATCH_SIZE = 1000;

  const totalCount = req.body?.count
    ? Math.min(Math.max(1, parseInt(String(req.body.count), 10)), 500000)
    : (mode === 'full' ? FULL_DEFAULT : INCREMENTAL_DEFAULT);

  try {
    if (mode === 'full') {
      await query('TRUNCATE TABLE demo_feed_inventory');
    }

    const rng = mulberry32(42);
    const startIndex = mode === 'incremental' ? FULL_DEFAULT : 0;

    // For incremental mode, advance RNG past original diamonds
    if (mode === 'incremental') {
      for (let i = 0; i < FULL_DEFAULT; i++) {
        for (let j = 0; j < 15; j++) rng();
      }
    }

    let inserted = 0;
    for (let batch = 0; batch < Math.ceil(totalCount / BATCH_SIZE); batch++) {
      const batchStart = batch * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCount);
      const batchDiamonds = [];
      for (let i = batchStart; i < batchEnd; i++) {
        batchDiamonds.push(generateDiamond(rng, startIndex + i));
      }

      await query(
        `INSERT INTO demo_feed_inventory (
          stone_id, weight_ct, stone_shape, stone_color, stone_clarity,
          cut_grade, polish_grade, symmetry_grade, fluorescence_level,
          asking_price_usd, price_per_ct_usd, is_lab_created, is_treated,
          availability_status, cert_lab, cert_number, vendor_name
        )
        SELECT
          UNNEST($1::TEXT[]), UNNEST($2::DECIMAL[]), UNNEST($3::TEXT[]), UNNEST($4::TEXT[]),
          UNNEST($5::TEXT[]), UNNEST($6::TEXT[]), UNNEST($7::TEXT[]), UNNEST($8::TEXT[]),
          UNNEST($9::TEXT[]), UNNEST($10::DECIMAL[]), UNNEST($11::DECIMAL[]), UNNEST($12::BOOLEAN[]),
          UNNEST($13::BOOLEAN[]), UNNEST($14::TEXT[]), UNNEST($15::TEXT[]), UNNEST($16::TEXT[]),
          UNNEST($17::TEXT[])
        ON CONFLICT (stone_id) DO UPDATE SET
          weight_ct = EXCLUDED.weight_ct, stone_shape = EXCLUDED.stone_shape,
          stone_color = EXCLUDED.stone_color, stone_clarity = EXCLUDED.stone_clarity,
          cut_grade = EXCLUDED.cut_grade, polish_grade = EXCLUDED.polish_grade,
          symmetry_grade = EXCLUDED.symmetry_grade, fluorescence_level = EXCLUDED.fluorescence_level,
          asking_price_usd = EXCLUDED.asking_price_usd, price_per_ct_usd = EXCLUDED.price_per_ct_usd,
          is_lab_created = EXCLUDED.is_lab_created, is_treated = EXCLUDED.is_treated,
          availability_status = EXCLUDED.availability_status, cert_lab = EXCLUDED.cert_lab,
          cert_number = EXCLUDED.cert_number, vendor_name = EXCLUDED.vendor_name,
          updated_at = NOW()`,
        [
          batchDiamonds.map(d => d.stone_id), batchDiamonds.map(d => d.weight_ct),
          batchDiamonds.map(d => d.stone_shape), batchDiamonds.map(d => d.stone_color),
          batchDiamonds.map(d => d.stone_clarity), batchDiamonds.map(d => d.cut_grade),
          batchDiamonds.map(d => d.polish_grade), batchDiamonds.map(d => d.symmetry_grade),
          batchDiamonds.map(d => d.fluorescence_level), batchDiamonds.map(d => d.asking_price_usd),
          batchDiamonds.map(d => d.price_per_ct_usd), batchDiamonds.map(d => d.is_lab_created),
          batchDiamonds.map(d => d.is_treated), batchDiamonds.map(d => d.availability_status),
          batchDiamonds.map(d => d.cert_lab), batchDiamonds.map(d => d.cert_number),
          batchDiamonds.map(d => d.vendor_name),
        ]
      );
      inserted += batchEnd - batchStart;
    }

    log.info('Seed completed via API', { mode, inserted });
    res.json({ message: 'Seed completed', mode, inserted });
  } catch (error) {
    log.error('Seed failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Seed failed', details: error instanceof Error ? error.message : String(error) });
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
