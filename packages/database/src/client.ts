import pg from "pg";
import { optionalEnv } from "@diamond/shared";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = optionalEnv("DATABASE_URL", undefined);

    if (databaseUrl) {
      // Use connection string (preferred for production/Azure)
      pool = new Pool({
        connectionString: databaseUrl,
        min: 2,
        max: 15,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false },
      });
    } else {
      // Fallback to individual environment variables (local development)
      const host = optionalEnv("DATABASE_HOST", undefined);
      const port = optionalEnv("DATABASE_PORT", undefined);
      const database = optionalEnv("DATABASE_NAME", undefined);
      const user = optionalEnv("DATABASE_USERNAME", undefined);
      const password = optionalEnv("DATABASE_PASSWORD", undefined);

      if (!host || !port || !database || !user || !password) {
        throw new Error(
          "Database configuration missing: set DATABASE_URL or all of DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD"
        );
      }

      pool = new Pool({
        host,
        port: Number(port),
        database,
        user,
        password,
        min: 2,
        max: 15,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false },
      });
    }
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const client = getPool();
  return client.query<T>(text, params);
}

export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
