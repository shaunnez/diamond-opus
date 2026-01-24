import type { ApiKey } from '@diamond/shared';
import { query } from '../client.js';

interface ApiKeyRow {
  id: string;
  key_hash: string;
  client_name: string;
  permissions: string[];
  active: boolean;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
}

function mapRowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    keyHash: row.key_hash,
    clientName: row.client_name,
    permissions: row.permissions,
    active: row.active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const result = await query<ApiKeyRow>(
    `SELECT * FROM api_keys
     WHERE key_hash = $1
       AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [keyHash]
  );
  const row = result.rows[0];
  return row ? mapRowToApiKey(row) : null;
}

export async function updateApiKeyLastUsed(id: string): Promise<void> {
  await query(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function createApiKey(
  keyHash: string,
  clientName: string,
  permissions: string[] = [],
  expiresAt?: Date
): Promise<ApiKey> {
  const result = await query<ApiKeyRow>(
    `INSERT INTO api_keys (key_hash, client_name, permissions, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [keyHash, clientName, permissions, expiresAt]
  );
  return mapRowToApiKey(result.rows[0]!);
}

export async function deactivateApiKey(id: string): Promise<void> {
  await query(
    `UPDATE api_keys SET active = FALSE WHERE id = $1`,
    [id]
  );
}
