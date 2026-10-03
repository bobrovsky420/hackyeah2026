/*
 * The database URL of the command-line scripts (docs/database.md): the
 * environment first, then .env.dev. Without DATABASE_URL, the local Docker
 * database of docker-compose.yml is assumed when POSTGRES_PASSWORD is set,
 * so `pnpm db:migrate` and `pnpm seed` work right after `pnpm db:up` while
 * the app itself stays on memory. The URL is never printed.
 */

export function databaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env.dev");
    } catch {
      // No .env.dev: the environment alone decides.
    }
  }
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const password = process.env.POSTGRES_PASSWORD;
  if (password) {
    return `postgres://hubmi:${encodeURIComponent(password)}@localhost:${process.env.POSTGRES_PORT ?? "5432"}/hubmi`;
  }
  console.error("Set DATABASE_URL, or POSTGRES_PASSWORD for the local Docker database (docs/database.md).");
  process.exit(1);
}

/** host:port/database, for the log line; no user, no password. */
export function describeUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
}
