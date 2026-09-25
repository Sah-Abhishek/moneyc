// Applies pending schema migrations to DATABASE_URL, then exits.
// The app also migrates on first use, so this is optional — run it in a
// deploy step if you'd rather a bad migration fail the deploy than a request.
import pg from "pg";
import { migrate, pgTypes, poolDb } from "../src/server/db/index.ts";
import { MIGRATIONS } from "../src/server/db/migrations.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1, types: pgTypes });
try {
  await migrate(poolDb(pool));
  console.log(`Schema is at v${MIGRATIONS.length}.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
