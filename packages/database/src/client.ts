import pg from "pg";
import { optionalEnv, requireEnv } from "@diamond/shared";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = optionalEnv("DATABASE_URL", "");
    if (url) {
      pool = new Pool({
        connectionString: url,
        // ssl: { rejectUnauthorized: false },
      });
      return pool;
    }
    const poolParams = {
      host: optionalEnv("DATABASE_HOST", "localhost"),
      port: Number(optionalEnv("DATABASE_PORT", "5432")),
      database: optionalEnv("DATABASE_NAME", "postgres"),
      user: optionalEnv("DATABASE_USERNAME", "postgres"),
      password: optionalEnv("DATABASE_PASSWORD", ""),
      min: 2,
      max: 30,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 10000,
      // ssl: { rejectUnauthorized: false },
    };
    pool = new Pool(poolParams);
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
