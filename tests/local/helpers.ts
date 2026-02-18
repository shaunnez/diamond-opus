/**
 * Shared test helpers for local stack integration tests.
 *
 * Expects these environment variables to be set:
 *   DATABASE_URL, API_BASE_URL, LOCAL_API_KEY
 */

import pg from 'pg';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const API_BASE = (): string => process.env.API_BASE_URL ?? 'http://localhost:3000';

export async function apiGet(path: string): Promise<Response> {
  const apiKey = process.env.LOCAL_API_KEY ?? 'local-dev-key';
  return fetch(`${API_BASE()}${path}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
    },
  });
}

export async function apiPost(path: string, body: unknown = {}): Promise<Response> {
  const apiKey = process.env.LOCAL_API_KEY ?? 'local-dev-key';
  const bodyStr = JSON.stringify(body);
  return fetch(`${API_BASE()}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: bodyStr,
  });
}

// ---------------------------------------------------------------------------
// Polling Helper
// ---------------------------------------------------------------------------

export async function pollUntil(
  fn: () => Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 90_000, intervalMs = 2_000, label = 'condition' } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`pollUntil timed out waiting for: ${label}`);
}
