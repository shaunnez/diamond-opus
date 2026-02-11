/**
 * Shared test helpers for local stack integration tests.
 *
 * Expects these environment variables to be set:
 *   DATABASE_URL, API_BASE_URL, HMAC_SECRET, HMAC_CLIENT_ID
 */

import { createHash, createHmac } from 'node:crypto';
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
// HMAC Auth Helper
// ---------------------------------------------------------------------------

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function makeHmacHeaders(
  method: string,
  path: string,
  body: string = '',
): Record<string, string> {
  const clientId = process.env.HMAC_CLIENT_ID ?? 'local';
  const secret = process.env.HMAC_SECRET ?? 'local-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = sha256(body);
  const canonical = [method, path, timestamp, bodyHash].join('\n');
  const signature = hmacSha256(secret, canonical);

  return {
    'x-client-id': clientId,
    'x-timestamp': timestamp,
    'x-signature': signature,
    'content-type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const API_BASE = (): string => process.env.API_BASE_URL ?? 'http://localhost:3000';

export async function apiGet(path: string): Promise<Response> {
  const headers = makeHmacHeaders('GET', path);
  return fetch(`${API_BASE()}${path}`, { method: 'GET', headers });
}

export async function apiPost(path: string, body: unknown = {}): Promise<Response> {
  const bodyStr = JSON.stringify(body);
  const headers = makeHmacHeaders('POST', path, bodyStr);
  return fetch(`${API_BASE()}${path}`, {
    method: 'POST',
    headers,
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
