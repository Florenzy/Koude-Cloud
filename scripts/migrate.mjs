import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(728492)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  const applied = new Set(
    (await client.query("SELECT name FROM schema_migrations")).rows.map(
      (row) => row.name,
    ),
  );
  const directory = new URL("../db/postgres/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (applied.has(name)) continue;
    await client.query(await readFile(new URL(name, directory), "utf8"));
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      name,
    ]);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
