/**
 * Quick test script to reproduce the runaway worker query against the Nivoda API.
 *
 * Tests:
 * 1. Count query for the partition's price range
 * 2. Search at the runaway offset (89850) to see what Nivoda returns
 * 3. Search at a high offset near the estimated records to compare
 *
 * Usage: npx tsx scripts/test-nivoda-offset.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

import { NivodaAdapter } from '../packages/nivoda/src/adapter.js';
import { DIAMOND_SHAPES } from '../packages/shared/src/constants.js';

// Uses NIVODA_ENDPOINT, NIVODA_USERNAME, NIVODA_PASSWORD from .env.local
const adapter = new NivodaAdapter();

// Reproduce the exact query from the work item
const query = {
  shapes: [...DIAMOND_SHAPES],
  sizes: { from: 0.4, to: 15.01 },
  dollar_per_carat: { from: 650, to: 899 },
  updated: {
    from: '2020-02-11T12:39:00.000Z',
    to: '2026-02-12T11:22:04.855Z',
  },
  has_image: true,
  has_v360: true,
  availability: ['AVAILABLE'],
  excludeFairPoorCuts: true,
  hide_memo: true,
};

const order = { type: 'createdAt' as const, direction: 'ASC' as const };

async function main() {
  console.log('=== Nivoda API Offset Test ===\n');
  console.log('Query:', JSON.stringify(query, null, 2));
  console.log('');

  // 1. Count query
  console.log('--- Count Query ---');
  try {
    const count = await adapter.getDiamondsCount(query);
    console.log(`diamonds_by_query_count: ${count}`);
  } catch (e) {
    console.error('Count query failed:', (e as Error).message);
  }
  console.log('');

  // 2. Search at offset 0 (baseline)
  console.log('--- Search at offset=0, limit=30 ---');
  try {
    const res = await adapter.searchDiamonds(query, { offset: 0, limit: 30, order });
    console.log(`total_count: ${res.total_count}`);
    console.log(`items.length: ${res.items.length}`);
    if (res.items.length > 0) {
      console.log(`First item id: ${res.items[0].id}`);
    }
  } catch (e) {
    console.error('Search failed:', (e as Error).message);
  }
  console.log('');

  // 3. Search at offset near estimated records (51906)
  console.log('--- Search at offset=51900, limit=30 ---');
  try {
    const res = await adapter.searchDiamonds(query, { offset: 51900, limit: 30, order });
    console.log(`total_count: ${res.total_count}`);
    console.log(`items.length: ${res.items.length}`);
    if (res.items.length > 0) {
      console.log(`First item id: ${res.items[0].id}`);
    }
  } catch (e) {
    console.error('Search failed:', (e as Error).message);
  }
  console.log('');

  // 4. Search at the runaway offset (89850)
  console.log('--- Search at offset=89850, limit=30 ---');
  try {
    const res = await adapter.searchDiamonds(query, { offset: 89850, limit: 30, order });
    console.log(`total_count: ${res.total_count}`);
    console.log(`items.length: ${res.items.length}`);
    if (res.items.length > 0) {
      console.log(`First item id: ${res.items[0].id}`);
    }
  } catch (e) {
    console.error('Search failed:', (e as Error).message);
  }
  console.log('');

  // 5. Search at an even higher offset (100000)
  console.log('--- Search at offset=100000, limit=30 ---');
  try {
    const res = await adapter.searchDiamonds(query, { offset: 100000, limit: 30, order });
    console.log(`total_count: ${res.total_count}`);
    console.log(`items.length: ${res.items.length}`);
    if (res.items.length > 0) {
      console.log(`First item id: ${res.items[0].id}`);
    }
  } catch (e) {
    console.error('Search failed:', (e as Error).message);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
