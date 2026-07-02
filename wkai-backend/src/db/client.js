import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Headroom for a classroom: 1 instructor + many students across sessions each
  // making short API calls. Overridable via env.
  max: Number(process.env.PG_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  // Generous connect timeout so a Neon/serverless cold start doesn't drop the
  // connection mid-handshake.
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 20_000),
  ssl: process.env.DATABASE_URL?.includes("neon.tech") ? { rejectUnauthorized: false } : false,
});

// An idle-client error (e.g. Postgres/Neon dropped the connection) would
// otherwise crash the process — log and let the pool replace the client.
pool.on("error", (err) => {
  console.error("[DB] Idle client error:", err.message);
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
