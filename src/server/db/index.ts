import { storeFile } from "@/lib/env";
import { withDemoData } from "./demo";
import { createFileRepository } from "./file";
import { createMemoryRepository, createMemoryState } from "./memory";
import type { Repository } from "./repository";

export type * from "./repository";

/*
 * The one store of the running app (decision A.6): the memory
 * repository saved to the file of STORE_FILE (.local/store/records.json by
 * default, docs/storage.md), or memory alone under STORE_FILE=memory (the
 * Playwright server, the pipeline scripts, a throwaway server). It sits on
 * globalThis so that pages, route handlers and server actions share one
 * store, and `next dev` keeps it across reloads. Unit tests never reach a
 * file by accident: under Vitest the default is memory, and tests/unit/db/
 * builds its repositories itself; `next build` opens no file either.
 * A fresh store file gets the panel's demonstration data when data/built/
 * holds its files (demo.ts); a memory store never does, so the Playwright
 * server and the scripts start from the examples alone.
 */

const holder = globalThis as typeof globalThis & { __repository?: Repository };

export function repository(): Repository {
  if (!holder.__repository) {
    const offline = Boolean(process.env.VITEST) || process.env.NEXT_PHASE === "phase-production-build";
    const file = offline ? null : storeFile();
    holder.__repository = file
      ? createFileRepository(file, { fresh: () => withDemoData(createMemoryState()) })
      : createMemoryRepository(createMemoryState());
  }
  return holder.__repository;
}

/** Replaces the repository, for tests; undefined goes back to the default on the next call. */
export function setRepository(next: Repository | undefined) {
  holder.__repository = next;
}
