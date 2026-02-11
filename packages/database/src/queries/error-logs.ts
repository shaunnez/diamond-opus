import { query } from '../client.js';

export interface ErrorLogRow {
  id: string;
  service: string;
  error_message: string;
  stack_trace: string | null;
  context: Record<string, unknown> | null;
  created_at: Date;
}

export interface ErrorLog {
  id: string;
  service: string;
  errorMessage: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
  createdAt: Date;
}

export interface ErrorLogsFilter {
  service?: string;
  runId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

function mapRowToErrorLog(row: ErrorLogRow): ErrorLog {
  return {
    id: row.id,
    service: row.service,
    errorMessage: row.error_message,
    stackTrace: row.stack_trace ?? undefined,
    context: row.context ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Insert an error log entry.
 * This is fire-and-forget safe — callers should catch and ignore failures
 * to avoid masking the original error.
 */
export async function insertErrorLog(
  service: string,
  errorMessage: string,
  stackTrace?: string,
  context?: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO error_logs (service, error_message, stack_trace, context)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (error_message) DO NOTHING`,
    [service, errorMessage, stackTrace ?? null, context ? JSON.stringify(context) : null],
  );
}

/**
 * Query error logs with optional service filter, ordered by most recent first.
 */
export async function getErrorLogs(
  filters: ErrorLogsFilter,
): Promise<{ logs: ErrorLog[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.service) {
    conditions.push(`service = $${paramIndex++}`);
    params.push(filters.service);
  }

  if (filters.runId) {
    conditions.push(`context->>'runId' = $${paramIndex++}`);
    params.push(filters.runId);
  }

  if (filters.from) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.from);
  }

  if (filters.to) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM error_logs ${whereClause}`,
    params,
  );

  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataParams = [...params, filters.limit, filters.offset];
  const rows = await query<ErrorLogRow>(
    `SELECT * FROM error_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    dataParams,
  );

  return {
    logs: rows.rows.map(mapRowToErrorLog),
    total,
  };
}

/**
 * Get distinct service names that have error logs.
 */
export async function getErrorLogServices(): Promise<string[]> {
  const result = await query<{ service: string }>(
    `SELECT DISTINCT service FROM error_logs ORDER BY service`,
  );
  return result.rows.map((r) => r.service);
}

/**
 * Clear error logs, optionally filtered by service.
 * Returns the number of deleted rows.
 */
export async function clearErrorLogs(service?: string): Promise<number> {
  if (service) {
    const result = await query(
      `DELETE FROM error_logs WHERE service = $1`,
      [service],
    );
    return result.rowCount ?? 0;
  }
  const result = await query(`DELETE FROM error_logs`);
  return result.rowCount ?? 0;
}
