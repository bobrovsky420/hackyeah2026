import { migrateDatabase } from "@/server/db/migrate";
import { databaseUrl, describeUrl } from "./db-env";

/* `pnpm db:migrate` (9.6): applies the committed migrations; idempotent. */

async function main() {
  const url = databaseUrl();
  await migrateDatabase(url);
  console.log(`Migrations applied to ${describeUrl(url)}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
