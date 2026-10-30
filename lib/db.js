import pg from "pg";

/**
 * Connects to Supabase Postgres. Set DATABASE_URL to the Supabase *Session pooler* connection string
 * (Supabase dashboard > Connect). The app's tables live in the `hunt` schema (override with DB_SCHEMA).
 */
function getPool() {
  if (!globalThis.__huntPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set. Add your Supabase session-pooler connection string.");
    const schema = process.env.DB_SCHEMA || "hunt";
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("DB_SCHEMA must be a simple lowercase name");
    const pool = new pg.Pool({
      connectionString,
      max: 3,
      ssl: /supabase|pooler/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("connect", (client) => { client.query(`SET search_path TO ${schema}, public`).catch(() => {}); });
    pool.on("error", (e) => console.error("Postgres pool error", e.message));
    globalThis.__huntPool = pool;
  }
  return globalThis.__huntPool;
}

/** Run a parameterised query ($1, $2 ...) and return the rows. */
export async function q(text, params = []) {
  const res = await getPool().query(text, params);
  return res.rows;
}
