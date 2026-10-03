import { createPostgresRepository } from "@/server/db/postgres";
import { DEFAULT_ROUTES_UNTIL, isDay, retentionCutoffs } from "@/server/retention";
import { databaseUrl, describeUrl } from "./db-env";

/*
 * `pnpm retention` (12.6, OP-18): deletes what is past its retention
 * period in the database (the rules are in src/server/retention.ts). Run it
 * once a day, for example from cron on the app's host. Options:
 *   --dry-run                  count only, delete nothing
 *   --routes-until=YYYY-MM-DD  the day from which the event's routes go
 *                              (default 2026-11-04; RETENTION_ROUTES_UNTIL
 *                              in the environment works too)
 * The in-memory store of a server without DATABASE_URL needs no job: a
 * restart empties it.
 */

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const routesUntil = option("routes-until") ?? process.env.RETENTION_ROUTES_UNTIL ?? DEFAULT_ROUTES_UNTIL;
  if (!isDay(routesUntil)) {
    console.error(`--routes-until needs a date as YYYY-MM-DD, not "${routesUntil}".`);
    process.exit(1);
  }
  const cutoffs = retentionCutoffs(new Date(), { routesUntil });
  const url = databaseUrl();
  const repo = createPostgresRepository(url, { max: 1 });
  try {
    const counts = await repo.applyRetention(cutoffs, { dryRun });
    const verb = dryRun ? "would delete" : "deleted";
    console.log(`Retention on ${describeUrl(url)}${dryRun ? " (dry run)" : ""}:`);
    console.log(
      cutoffs.routesBefore
        ? `  routes created before ${cutoffs.routesBefore}: ${verb} ${counts.routes}, with ${counts.feedback} feedback entries`
        : `  routes: kept until ${routesUntil}`,
    );
    console.log(`  contact requests sent before ${cutoffs.contactsBefore}: ${verb} ${counts.contacts}`);
    console.log(`  readiness registrations with retention_until before ${cutoffs.readinessBefore}: ${verb} ${counts.readiness}`);
    console.log(`  screening log entries older than 14 days: ${verb} ${counts.screeningEntries}`);
    console.log(`  screening log texts past their seven days: ${dryRun ? "would clear" : "cleared"} ${counts.screeningTexts}`);
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
