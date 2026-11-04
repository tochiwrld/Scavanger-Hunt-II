import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

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
    // The Supabase session pooler allows only 15 connections in total, shared by every running server instance.
    // Keep each instance's pool small, close idle connections fast, and let Vercel release them before an instance
    // sleeps: idle connections left open by sleeping instances once filled the pooler and blocked every login.
    const pool = new pg.Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
      ssl: /supabase|pooler/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", (e) => console.error("Postgres pool error", e.message));
    attachDatabasePool(pool);
    pool.__schema = schema;
    globalThis.__huntPool = pool;
  }
  return globalThis.__huntPool;
}

/** Run a parameterised query ($1, $2 ...) and return the rows. */
export async function q(text, params = []) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // Set the schema once per connection, and wait for it, before the first query (running both at once
    // was what produced pg's "client is already executing a query" warning).
    if (!client.__huntReady) {
      await client.query(`SET search_path TO ${pool.__schema}, public`);
      client.__huntReady = true;
    }
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}
