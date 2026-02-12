/**
 * Nivoda Density Distribution Scanner
 *
 * Compares diamond count distributions between `dollar_value` (total price)
 * and `dollar_per_carat` (price per carat) filters on the Nivoda API.
 *
 * This helps determine:
 * 1. Which filter is more reliable (flaky dollar_value vs dollar_per_carat)
 * 2. Where diamonds concentrate (for tuning heatmap constants)
 * 3. Optimal dense zone threshold and step sizes
 *
 * Usage:
 *   npx tsx scripts/nivoda-density-scan.ts
 *
 * Requires: NIVODA_ENDPOINT, NIVODA_USERNAME, NIVODA_PASSWORD env vars
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

// Force direct connection to Nivoda (bypass proxy which may not be running locally)
delete process.env.NIVODA_PROXY_BASE_URL;

import { NivodaAdapter } from '@diamond/nivoda';
import { DIAMOND_SHAPES, withRetry } from '@diamond/shared';

// --- Configuration ---

const CONCURRENCY = 3;

/** Base query matching production filters */
const BASE_QUERY = {
  shapes: [...DIAMOND_SHAPES],
  sizes: { from: 0.4, to: 15.01 },
  has_image: true,
  has_v360: true,
  availability: ['AVAILABLE'],
  excludeFairPoorCuts: true,
  hide_memo: true,
};

interface Bucket {
  from: number;
  to: number;
}

interface BucketResult {
  from: number;
  to: number;
  count: number;
}

/**
 * Build scan buckets with varying granularity:
 * - Fine ($500 steps) from 0 to 20k
 * - Medium ($5k steps) from 20k to 50k
 * - Coarse ($10k steps) from 50k to 100k
 * - Very coarse ($25k steps) from 100k to maxPrice
 */
function buildBuckets(maxPrice: number): Bucket[] {
  const buckets: Bucket[] = [];

  // Fine: $0 - $20k in $500 steps
  for (let from = 0; from < 20_000 && from < maxPrice; from += 500) {
    buckets.push({ from, to: Math.min(from + 499, maxPrice - 1) });
  }

  // Medium: $20k - $50k in $5k steps
  for (let from = 20_000; from < 50_000 && from < maxPrice; from += 5_000) {
    buckets.push({ from, to: Math.min(from + 4_999, maxPrice - 1) });
  }

  // Coarse: $50k - $100k in $10k steps
  for (let from = 50_000; from < 100_000 && from < maxPrice; from += 10_000) {
    buckets.push({ from, to: Math.min(from + 9_999, maxPrice - 1) });
  }

  // Very coarse: $100k+ in $25k steps
  for (let from = 100_000; from < maxPrice; from += 25_000) {
    buckets.push({ from, to: Math.min(from + 24_999, maxPrice - 1) });
  }

  return buckets;
}

/**
 * Run count queries for all buckets with concurrency limiting.
 */
async function scanBuckets(
  adapter: NivodaAdapter,
  buckets: Bucket[],
  filterField: 'dollar_value' | 'dollar_per_carat',
): Promise<BucketResult[]> {
  const results: BucketResult[] = [];
  let completed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < buckets.length; i += CONCURRENCY) {
    const batch = buckets.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (bucket) => {
        const query = {
          ...BASE_QUERY,
          [filterField]: { from: bucket.from, to: bucket.to },
        };

        const count = await withRetry(
          () => adapter.getDiamondsCount(query as any),
          {
            onRetry: (error, attempt) => {
              console.warn(
                `  Retry ${attempt} for ${filterField} $${bucket.from}-$${bucket.to}: ${error.message}`,
              );
            },
          },
        );

        completed++;
        return { from: bucket.from, to: bucket.to, count };
      }),
    );

    results.push(...batchResults);
    process.stdout.write(
      `\r  ${filterField}: ${completed}/${buckets.length} buckets scanned`,
    );
  }

  console.log(); // newline after progress
  return results;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatRange(from: number, to: number): string {
  const f = `$${formatNumber(from)}`;
  const t = `$${formatNumber(to)}`;
  return `${f.padEnd(10)} - ${t.padEnd(10)}`;
}

function printResults(label: string, results: BucketResult[]): void {
  console.log(`\n--- ${label} ---`);
  console.log(
    `${'Range'.padEnd(28)} | ${'Count'.padStart(10)} | ${'Cumulative'.padStart(12)} | ${'%'.padStart(6)}`,
  );
  console.log('-'.repeat(65));

  const total = results.reduce((sum, r) => sum + r.count, 0);
  let cumulative = 0;

  for (const r of results) {
    cumulative += r.count;
    const pct = total > 0 ? ((r.count / total) * 100).toFixed(1) : '0.0';
    if (r.count > 0) {
      console.log(
        `${formatRange(r.from, r.to).padEnd(28)} | ${formatNumber(r.count).padStart(10)} | ${formatNumber(cumulative).padStart(12)} | ${pct.padStart(5)}%`,
      );
    }
  }

  console.log('-'.repeat(65));
  console.log(`Total: ${formatNumber(total)}`);

  // Find dense zone suggestion (bucket where 80% of inventory is reached)
  cumulative = 0;
  for (const r of results) {
    cumulative += r.count;
    if (cumulative >= total * 0.8) {
      console.log(
        `80% threshold at: $${formatNumber(r.to)} (${formatNumber(cumulative)} diamonds)`,
      );
      break;
    }
  }

  cumulative = 0;
  for (const r of results) {
    cumulative += r.count;
    if (cumulative >= total * 0.95) {
      console.log(
        `95% threshold at: $${formatNumber(r.to)} (${formatNumber(cumulative)} diamonds)`,
      );
      break;
    }
  }
}

async function main(): Promise<void> {
  console.log('=== Nivoda Density Distribution Comparison ===');
  console.log(
    'Base filters: shapes=all, size=0.4-15.01ct, available, has_image, has_v360\n',
  );

  const adapter = new NivodaAdapter();

  // First get a baseline total count (no price filter)
  console.log('Getting baseline total count (no price filter)...');
  const baselineCount = await withRetry(
    () => adapter.getDiamondsCount(BASE_QUERY as any),
  );
  console.log(`Baseline total: ${formatNumber(baselineCount)} diamonds\n`);

  // Scan dollar_value distribution
  console.log('Scanning dollar_value (total price) distribution...');
  const dollarValueBuckets = buildBuckets(250_000);
  const dollarValueResults = await scanBuckets(
    adapter,
    dollarValueBuckets,
    'dollar_value',
  );

  // Scan dollar_per_carat distribution
  console.log('\nScanning dollar_per_carat distribution...');
  const perCaratBuckets = buildBuckets(100_000);
  const perCaratResults = await scanBuckets(
    adapter,
    perCaratBuckets,
    'dollar_per_carat',
  );

  // Print results
  printResults('dollar_value (total price, max $250k)', dollarValueResults);
  printResults('dollar_per_carat (price per carat, max $100k)', perCaratResults);

  // Summary comparison
  const dvTotal = dollarValueResults.reduce((s, r) => s + r.count, 0);
  const dpcTotal = perCaratResults.reduce((s, r) => s + r.count, 0);

  console.log('\n=== Summary ===');
  console.log(`Baseline (no price filter):  ${formatNumber(baselineCount)}`);
  console.log(`Sum of dollar_value buckets: ${formatNumber(dvTotal)}`);
  console.log(`Sum of dollar_per_carat:     ${formatNumber(dpcTotal)}`);

  if (dvTotal !== baselineCount) {
    console.log(
      `  ⚠ dollar_value sum differs from baseline by ${formatNumber(Math.abs(dvTotal - baselineCount))} (${(((dvTotal - baselineCount) / baselineCount) * 100).toFixed(1)}%)`,
    );
  }
  if (dpcTotal !== baselineCount) {
    console.log(
      `  ⚠ dollar_per_carat sum differs from baseline by ${formatNumber(Math.abs(dpcTotal - baselineCount))} (${(((dpcTotal - baselineCount) / baselineCount) * 100).toFixed(1)}%)`,
    );
  }

  // Output raw JSON for further analysis
  const outputPath = resolve(rootDir, 'density-scan-results.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        baseline: baselineCount,
        dollar_value: dollarValueResults,
        dollar_per_carat: perCaratResults,
      },
      null,
      2,
    ),
  );
  console.log(`\nRaw results saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Scan failed:', err);
  process.exit(1);
});
