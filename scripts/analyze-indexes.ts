/**
 * Index Analysis Script
 *
 * Queries pg_indexes, pg_stat_user_indexes, and pg_statio_user_indexes
 * to produce a full picture of every index: definition, usage stats,
 * size, and cache hit ratio. Useful for identifying missing, unused,
 * or redundant indexes.
 *
 * Usage:
 *   npx tsx scripts/analyze-indexes.ts
 *
 * Requires: DATABASE_URL or DATABASE_* env vars
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

import { query, closePool } from '@diamond/database';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const INDEX_DEFINITIONS = `
  SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname
`;

const INDEX_USAGE_STATS = `
  SELECT
    s.relname                          AS table,
    s.indexrelname                     AS index,
    s.idx_scan                         AS scans,
    s.idx_tup_read                     AS tuples_read,
    s.idx_tup_fetch                    AS tuples_fetched,
    pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
    pg_relation_size(s.indexrelid)     AS index_size_bytes,
    t.n_live_tup                       AS live_rows,
    t.n_dead_tup                       AS dead_rows,
    t.last_autovacuum,
    t.last_autoanalyze
  FROM pg_stat_user_indexes s
  JOIN pg_stat_user_tables  t ON t.relname = s.relname
  WHERE s.schemaname = 'public'
  ORDER BY s.relname, s.idx_scan DESC
`;

const INDEX_IO_STATS = `
  SELECT
    relname   AS table,
    indexrelname AS index,
    idx_blks_read  AS disk_reads,
    idx_blks_hit   AS cache_hits,
    CASE WHEN (idx_blks_read + idx_blks_hit) = 0
      THEN NULL
      ELSE ROUND(100.0 * idx_blks_hit / (idx_blks_read + idx_blks_hit), 1)
    END AS cache_hit_pct
  FROM pg_statio_user_indexes
  WHERE schemaname = 'public'
  ORDER BY relname, (idx_blks_read + idx_blks_hit) DESC
`;

const TABLE_SIZES = `
  SELECT
    relname                                          AS table,
    pg_size_pretty(pg_total_relation_size(relid))   AS total_size,
    pg_size_pretty(pg_relation_size(relid))         AS table_size,
    pg_size_pretty(pg_total_relation_size(relid)
      - pg_relation_size(relid))                    AS indexes_size,
    n_live_tup                                       AS live_rows,
    n_dead_tup                                       AS dead_rows
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(relid) DESC
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function section(title: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log('  (no rows)');
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Fetching index analysis from database...\n');

  const [defs, usage, io, sizes] = await Promise.all([
    query(INDEX_DEFINITIONS),
    query(INDEX_USAGE_STATS),
    query(INDEX_IO_STATS),
    query(TABLE_SIZES),
  ]);

  section('TABLE SIZES');
  printTable(sizes.rows);

  section('INDEX DEFINITIONS (all public tables)');
  printTable(defs.rows);

  section('INDEX USAGE STATS (scans, rows read/fetched, size)');
  printTable(usage.rows);

  section('INDEX I/O STATS (disk reads vs cache hits)');
  printTable(io.rows);

  section('UNUSED INDEXES (0 scans, candidates for removal)');
  const unused = usage.rows.filter(r => Number(r.scans) === 0);
  printTable(unused);

  section('LARGEST INDEXES');
  const sorted = [...usage.rows].sort(
    (a, b) => Number(b.index_size_bytes) - Number(a.index_size_bytes)
  );
  printTable(sorted.slice(0, 15));

  await closePool();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
