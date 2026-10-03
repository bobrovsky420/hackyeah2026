import { exampleNeeds, exampleReadiness } from "@/server/db/examples";
import { createPostgresRepository } from "@/server/db/postgres";
import { databaseUrl, describeUrl } from "./db-env";

/*
 * `pnpm seed` (9.6): the example entries, idempotent. The three example
 * needs of the console and the map, and the two consented and verified
 * team entries of the readiness registry (FR-6.5), all marked as examples.
 * An entry that exists already, even changed by ROPS, is left alone.
 */

async function main() {
  const url = databaseUrl();
  const repo = createPostgresRepository(url, { max: 1 });
  let added = 0;
  try {
    for (const need of exampleNeeds()) {
      if (await repo.getNeed(need.id)) continue;
      await repo.addNeed(need);
      added += 1;
    }
    for (const entry of exampleReadiness()) {
      if (await repo.getReadiness(entry.id)) continue;
      await repo.addReadiness(entry);
      added += 1;
    }
  } finally {
    await repo.close();
  }
  console.log(`Seeded ${describeUrl(url)}: ${added} example entries added.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
