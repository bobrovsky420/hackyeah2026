import "server-only";
import { envValue } from "@/lib/env";
import { createMemoryRepository, createMemoryState, type MemoryState } from "./memory";
import { createPostgresRepository } from "./postgres";
import type { Repository } from "./repository";

export type * from "./repository";

/*
 * The one repository of the running app: PostgreSQL when DATABASE_URL is
 * set, the server's memory otherwise (decided 29 September 2026: a fresh
 * clone and the Playwright journeys run without a database). It sits on
 * globalThis so that pages, route handlers and server actions share one
 * pool, and `next dev` keeps it across reloads. Unit tests never reach a
 * database by accident: under Vitest the default is memory, and
 * tests/unit/db/ builds its repositories itself.
 */

const holder = globalThis as typeof globalThis & { __repository?: Repository; __memoryState?: MemoryState };

export function repository(): Repository {
  if (!holder.__repository) {
    const url = process.env.VITEST ? undefined : envValue("DATABASE_URL");
    holder.__repository = url ? createPostgresRepository(url) : createMemoryRepository((holder.__memoryState ??= createMemoryState()));
  }
  return holder.__repository;
}

/** Replaces the repository, for tests; undefined goes back to the default on the next call. */
export function setRepository(next: Repository | undefined) {
  holder.__repository = next;
}
