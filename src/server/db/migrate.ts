import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/*
 * Applies the committed migrations of src/server/db/migrations/ (made by
 * `pnpm db:generate`). Idempotent: drizzle records what it applied in
 * drizzle.__drizzle_migrations. Used by scripts/db-migrate.ts and the
 * contract tests; never at a request.
 */

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "server", "db", "migrations");

export async function migrateDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}
