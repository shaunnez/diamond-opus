import pg from "pg";
import { optionalEnv } from "@diamond/shared";

const { Pool } = pg;

let pool: pg.Pool | null = null;

// Env-driven pool configuration for Supabase shared pooling
// Set PG_POOL_MAX low (1-3) to avoid exhausting pooler connections when scaling replicas
const DEFAULT_POOL_MAX = 2;
const DEFAULT_IDLE_TIMEOUT_MS = 30000;
const DEFAULT_CONN_TIMEOUT_MS = 10000;

function getPoolConfig(): pg.PoolConfig {
  const max = parseInt(optionalEnv("PG_POOL_MAX", String(DEFAULT_POOL_MAX)), 10);
  const idleTimeoutMillis = parseInt(optionalEnv("PG_IDLE_TIMEOUT_MS", String(DEFAULT_IDLE_TIMEOUT_MS)), 10);
  const connectionTimeoutMillis = parseInt(optionalEnv("PG_CONN_TIMEOUT_MS", String(DEFAULT_CONN_TIMEOUT_MS)), 10);

  return {
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    keepAlive: true,
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    const poolConfig = getPoolConfig();
    const url = optionalEnv("DATABASE_URL", "");

    if (url) {
      pool = new Pool({
        connectionString: url,
        ...poolConfig,
        // ssl: { rejectUnauthorized: false },
      });
      return pool;
    }

    pool = new Pool({
      host: optionalEnv("DATABASE_HOST", "localhost"),
      port: Number(optionalEnv("DATABASE_PORT", "5432")),
      database: optionalEnv("DATABASE_NAME", "postgres"),
      user: optionalEnv("DATABASE_USERNAME", "postgres"),
      password: optionalEnv("DATABASE_PASSWORD", ""),
      ...poolConfig,
      // ssl: { rejectUnauthorized: false },
    });
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
