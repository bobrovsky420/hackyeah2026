import { defineConfig } from "drizzle-kit";

/*
 * drizzle-kit (docs/database.md): `pnpm db:generate` writes a migration
 * from src/server/db/schema.ts into src/server/db/migrations/, which is
 * committed; `pnpm db:migrate` applies them through scripts/db-migrate.ts,
 * not through drizzle-kit, so the app's image needs no dev tools.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
