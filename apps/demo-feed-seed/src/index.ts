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

import { query, closePool } from '@diamond/database';
import { createServiceLogger } from '@diamond/shared';

const log = createServiceLogger('demo-feed-seed');

const TOTAL_DIAMONDS = parseInt(process.env.DEMO_SEED_COUNT ?? '100000', 10);
const BATCH_SIZE = 1000;

// Seeded PRNG for idempotent generation
// Simple mulberry32 - produces deterministic sequence from a seed
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPES = ['ROUND', 'OVAL', 'EMERALD', 'CUSHION', 'ASSCHER', 'RADIANT', 'MARQUISE', 'PEAR', 'PRINCESS', 'HEART'];
const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2'];
const CUTS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR'];
const POLISH = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'];
const SYMMETRY = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'];
const FLUORESCENCE = ['NONE', 'FAINT', 'MEDIUM', 'STRONG', 'VERY_STRONG'];
const CERT_LABS = ['GIA', 'AGS', 'IGI', 'HRD', 'GCAL'];
const VENDORS = [
  'Brilliant Earth Demo',
  'Blue Nile Demo',
  'James Allen Demo',
  'Whiteflash Demo',
  'Adiamor Demo',
  'Brian Gavin Demo',
  'Good Old Gold Demo',
  'Victor Canera Demo',
];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function generateDiamond(rng: () => number, index: number) {
  const shape = pick(rng, SHAPES);
  // Carats: 0.5 to 5.0, weighted toward smaller stones
  const carats = Math.round((0.5 + Math.pow(rng(), 2) * 4.5) * 100) / 100;
  const color = pick(rng, COLORS);
  const clarity = pick(rng, CLARITIES);
  const isLabCreated = rng() < 0.3; // 30% lab-grown

  // Price model: base price per carat varies by color/clarity grade
  const colorIndex = COLORS.indexOf(color);
  const clarityIndex = CLARITIES.indexOf(clarity);
  const qualityFactor = Math.max(0.3, 1 - (colorIndex * 0.05 + clarityIndex * 0.08));
  const basePricePerCarat = isLabCreated
    ? 800 + qualityFactor * 3000
    : 2000 + qualityFactor * 15000;
  // Add some randomness
  const pricePerCarat = Math.round((basePricePerCarat * (0.85 + rng() * 0.3)) * 100) / 100;
  const totalPrice = Math.round(pricePerCarat * carats * 100) / 100;

  // Stone ID uses index for idempotency
  const stoneId = `DEMO-${String(index + 1).padStart(7, '0')}`;

  return {
    stone_id: stoneId,
    weight_ct: carats,
    stone_shape: shape,
    stone_color: color,
    stone_clarity: clarity,
    cut_grade: pick(rng, CUTS),
    polish_grade: pick(rng, POLISH),
    symmetry_grade: pick(rng, SYMMETRY),
    fluorescence_level: pick(rng, FLUORESCENCE),
    asking_price_usd: totalPrice,
    price_per_ct_usd: pricePerCarat,
    is_lab_created: isLabCreated,
    is_treated: rng() < 0.05, // 5% treated
    availability_status: 'available',
    cert_lab: pick(rng, CERT_LABS),
    cert_number: `${pick(rng, CERT_LABS)}-${Math.floor(rng() * 9000000 + 1000000)}`,
    vendor_name: pick(rng, VENDORS),
  };
}

async function seed() {
  const mode = process.argv[2] ?? 'full';
  log.info('Starting demo feed seed', { totalDiamonds: TOTAL_DIAMONDS, mode });

  if (mode === 'full') {
    // Full run: idempotent. Truncate and re-insert
    await query('TRUNCATE TABLE demo_feed_inventory');
    log.info('Truncated demo_feed_inventory table');
  }

  const rng = mulberry32(42); // Fixed seed for deterministic generation
  let inserted = 0;

  const startIndex = mode === 'incremental' ? TOTAL_DIAMONDS : 0;
  const count = mode === 'incremental'
    ? parseInt(process.env.DEMO_SEED_INCREMENTAL_COUNT ?? '5000', 10)
    : TOTAL_DIAMONDS;

  for (let batch = 0; batch < Math.ceil(count / BATCH_SIZE); batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, count);
    const batchDiamonds = [];

    // For incremental mode, advance the RNG to the correct position
    if (mode === 'incremental' && batch === 0) {
      // Skip RNG forward past the original diamonds
      for (let i = 0; i < TOTAL_DIAMONDS; i++) {
        // Each diamond consumes roughly 15 RNG calls
        for (let j = 0; j < 15; j++) rng();
      }
    }

    for (let i = batchStart; i < batchEnd; i++) {
      batchDiamonds.push(generateDiamond(rng, startIndex + i));
    }

    // Bulk insert using UNNEST
    const stoneIds = batchDiamonds.map(d => d.stone_id);
    const weights = batchDiamonds.map(d => d.weight_ct);
    const shapes = batchDiamonds.map(d => d.stone_shape);
    const colors = batchDiamonds.map(d => d.stone_color);
    const clarities = batchDiamonds.map(d => d.stone_clarity);
    const cuts = batchDiamonds.map(d => d.cut_grade);
    const polishes = batchDiamonds.map(d => d.polish_grade);
    const symmetries = batchDiamonds.map(d => d.symmetry_grade);
    const fluorescences = batchDiamonds.map(d => d.fluorescence_level);
    const prices = batchDiamonds.map(d => d.asking_price_usd);
    const pricesPerCt = batchDiamonds.map(d => d.price_per_ct_usd);
    const labCreated = batchDiamonds.map(d => d.is_lab_created);
    const treated = batchDiamonds.map(d => d.is_treated);
    const availabilities = batchDiamonds.map(d => d.availability_status);
    const certLabs = batchDiamonds.map(d => d.cert_lab);
    const certNumbers = batchDiamonds.map(d => d.cert_number);
    const vendors = batchDiamonds.map(d => d.vendor_name);

    await query(
      `INSERT INTO demo_feed_inventory (
        stone_id, weight_ct, stone_shape, stone_color, stone_clarity,
        cut_grade, polish_grade, symmetry_grade, fluorescence_level,
        asking_price_usd, price_per_ct_usd, is_lab_created, is_treated,
        availability_status, cert_lab, cert_number, vendor_name
      )
      SELECT
        UNNEST($1::TEXT[]),
        UNNEST($2::DECIMAL[]),
        UNNEST($3::TEXT[]),
        UNNEST($4::TEXT[]),
        UNNEST($5::TEXT[]),
        UNNEST($6::TEXT[]),
        UNNEST($7::TEXT[]),
        UNNEST($8::TEXT[]),
        UNNEST($9::TEXT[]),
        UNNEST($10::DECIMAL[]),
        UNNEST($11::DECIMAL[]),
        UNNEST($12::BOOLEAN[]),
        UNNEST($13::BOOLEAN[]),
        UNNEST($14::TEXT[]),
        UNNEST($15::TEXT[]),
        UNNEST($16::TEXT[]),
        UNNEST($17::TEXT[])
      ON CONFLICT (stone_id) DO UPDATE SET
        weight_ct = EXCLUDED.weight_ct,
        stone_shape = EXCLUDED.stone_shape,
        stone_color = EXCLUDED.stone_color,
        stone_clarity = EXCLUDED.stone_clarity,
        cut_grade = EXCLUDED.cut_grade,
        polish_grade = EXCLUDED.polish_grade,
        symmetry_grade = EXCLUDED.symmetry_grade,
        fluorescence_level = EXCLUDED.fluorescence_level,
        asking_price_usd = EXCLUDED.asking_price_usd,
        price_per_ct_usd = EXCLUDED.price_per_ct_usd,
        is_lab_created = EXCLUDED.is_lab_created,
        is_treated = EXCLUDED.is_treated,
        availability_status = EXCLUDED.availability_status,
        cert_lab = EXCLUDED.cert_lab,
        cert_number = EXCLUDED.cert_number,
        vendor_name = EXCLUDED.vendor_name,
        updated_at = NOW()`,
      [stoneIds, weights, shapes, colors, clarities, cuts, polishes, symmetries,
       fluorescences, prices, pricesPerCt, labCreated, treated, availabilities,
       certLabs, certNumbers, vendors]
    );

    inserted += batchEnd - batchStart;
    if (inserted % 10000 === 0 || inserted === count) {
      log.info(`Inserted ${inserted}/${count} diamonds`);
    }
  }

  log.info('Seed completed', { inserted });
}

try {
  await seed();
} catch (error) {
  log.error('Seed failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  await closePool();
}
