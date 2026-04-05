import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function connectDb() {
  try {
    const client = await pool.connect();
    const { rows } = await client.query("SELECT NOW()");
    client.release();
    console.log(`[DB] Connected to PostgreSQL — server time: ${rows[0].now}`);
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    throw err;
  }
}

/**
 * Simple query helper — use this everywhere instead of pool.query directly
 * so we can add logging/tracing later in one place.
 */
export async function query(sql, params) {
  const start = Date.now();
  const result = await pool.query(sql, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log(`[DB] query(${duration}ms) rows=${result.rowCount}`);
  }
  return result;
}
