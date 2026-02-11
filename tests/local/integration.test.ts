/**
 * Integration Tests — Local Docker Stack
 *
 * These tests run against the docker-compose stack and verify that each
 * stage of the pipeline works correctly with real infrastructure.
 *
 * Prerequisites:
 *   - docker compose up (infrastructure + demo-feed-api + api)
 *   - Demo feed seeded with 500 records
 *   - Scheduler has been triggered (scheduler container ran to completion)
 *   - Worker and consolidator are running
 *
 * Environment variables (set by local-e2e.sh):
 *   DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING, API_BASE_URL
 */

import { describe, it, expect, afterAll } from 'vitest';
import { query, closePool, pollUntil } from './helpers.js';

afterAll(async () => {
  await closePool();
});

// ---------------------------------------------------------------------------
// Test 1 — Partitioning + Heatmap
// ---------------------------------------------------------------------------

describe('Partitioning + Heatmap', () => {
  it('should have created at least one run', async () => {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_metadata WHERE feed = 'demo'`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should have created partition_progress rows', async () => {
    // Wait for partitions to exist (scheduler may still be writing)
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM partition_progress pp
           JOIN run_metadata rm ON pp.run_id = rm.run_id
           WHERE rm.feed = 'demo'`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'partition_progress rows exist', timeoutMs: 30_000 }
    );

    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM partition_progress pp
       JOIN run_metadata rm ON pp.run_id = rm.run_id
       WHERE rm.feed = 'demo'`
    );
    expect(parseInt(result.rows[0]?.count ?? '0', 10)).toBeGreaterThan(0);
  });

  it('should not have any partition with next_offset exceeding expected bounds', async () => {
    // The partition_progress.next_offset should be reasonable.
    // Since we seeded 500 records, no single partition should have processed
    // more than 500 records (offsets should stay bounded).
    const result = await query<{ partition_id: string; next_offset: number }>(
      `SELECT pp.partition_id, pp.next_offset
       FROM partition_progress pp
       JOIN run_metadata rm ON pp.run_id = rm.run_id
       WHERE rm.feed = 'demo'
         AND pp.next_offset > 1000`
    );
    expect(result.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Worker + Raw Writes
// ---------------------------------------------------------------------------

describe('Worker + Raw Writes', () => {
  it('should have written raw diamonds', async () => {
    // Wait for workers to process at least some records
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM raw_diamonds_demo`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'raw_diamonds_demo has rows', timeoutMs: 60_000 }
    );

    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM raw_diamonds_demo`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });

  it('should not have duplicate supplier_stone_id rows', async () => {
    const result = await query<{ supplier_stone_id: string; cnt: string }>(
      `SELECT supplier_stone_id, COUNT(*)::text AS cnt
       FROM raw_diamonds_demo
       GROUP BY supplier_stone_id
       HAVING COUNT(*) > 1
       LIMIT 5`
    );
    expect(result.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Consolidation
// ---------------------------------------------------------------------------

describe('Consolidation', () => {
  it('should populate the diamonds table', async () => {
    // Wait for consolidation to process records
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'diamonds table has demo rows', timeoutMs: 90_000, intervalMs: 3_000 }
    );

    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });

  it('should mark raw diamonds as consolidated', async () => {
    // Wait for at least some rows to be marked consolidated
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM raw_diamonds_demo
           WHERE consolidation_status = 'done'`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'raw diamonds marked as done', timeoutMs: 90_000, intervalMs: 3_000 }
    );

    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM raw_diamonds_demo
       WHERE consolidation_status = 'done'`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });
});
