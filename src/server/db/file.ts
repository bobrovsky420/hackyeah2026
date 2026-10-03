import { closeSync, copyFileSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { NeedCluster, StoredBrief, ContactRequest, ContentReport, Evaluation, Feedback, Idea, ModerationLogEntry, Need, Readiness, Route } from "@/lib/contracts";
import { applyRetentionDefaults } from "@/server/retention";
import { createMemoryRepository, createMemoryState, type MemoryState } from "./memory";
import type { Repository, StoredScreeningLogEntry } from "./repository";

/*
 * The store of the running app (decision A.6, docs/storage.md):
 * the memory repository, loaded from one JSON file at start and saved to
 * it after every change. The file is written whole and renamed into
 * place, so a reader never sees half of it; the saves of one request are
 * coalesced into one write, made off the request path. On exit a pending
 * save is written synchronously; `next dev` kills its server 100 ms after
 * a signal, so the changes of the last millisecond can go. One process
 * per file: two servers on the same file overwrite each other's saves.
 * The retention of 12.6 runs when the store opens and once a day after.
 */

export const STORE_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const RENAME_ATTEMPTS = 8;
/** OneDrive and Defender hold a changed file open for a moment; the rename waits for them. */
const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

interface StoreFile {
  version: number;
  saved_at: string;
  pid: number;
  state: {
    startedAt: string;
    routes: Route[];
    reviewedDeclines: string[];
    needs: Need[];
    contacts: ContactRequest[];
    readiness: Readiness[];
    /** Absent in the files saved before the idea cards existed. */
    ideas?: Idea[];
    /** Absent in the files saved before the evaluations existed. */
    evaluations?: Evaluation[];
    feedback: Feedback[];
    reports: ContentReport[];
    log: ModerationLogEntry[];
    screeningLog: StoredScreeningLogEntry[];
    screeningSeq: number;
    briefs: string[];
    counters: [string, number][];
    storedBriefs: StoredBrief[];
    clusters: NeedCluster[];
  };
}

export interface FileRepositoryOptions {
  /** The state of a store whose file does not exist yet; the examples of examples.ts by default. For tests. */
  fresh?: () => MemoryState;
  /** The clock of the retention runs; the real one by default. For tests. */
  now?: () => Date;
}

/** A file that is not a store: moved aside, never trusted. */
class UnreadableStore extends Error {}

function serialise(state: MemoryState): string {
  const file: StoreFile = {
    version: STORE_VERSION,
    saved_at: new Date().toISOString(),
    pid: process.pid,
    state: {
      startedAt: state.startedAt,
      routes: [...state.routes.values()],
      reviewedDeclines: [...state.reviewedDeclines],
      needs: state.needs,
      contacts: state.contacts,
      readiness: state.readiness,
      ideas: state.ideas,
      evaluations: state.evaluations,
      feedback: state.feedback,
      reports: state.reports,
      log: state.log,
      screeningLog: state.screeningLog,
      screeningSeq: state.screeningSeq,
      briefs: [...state.briefs],
      counters: [...state.counters],
      storedBriefs: [...state.storedBriefs.values()],
      clusters: [...state.clusters.values()],
    },
  };
  return JSON.stringify(file);
}

const LISTS = ["routes", "reviewedDeclines", "needs", "contacts", "readiness", "feedback", "reports", "log", "screeningLog", "briefs", "counters", "storedBriefs", "clusters"] as const;

function restore(text: string): MemoryState {
  let file: StoreFile;
  try {
    file = JSON.parse(text) as StoreFile;
  } catch (error) {
    throw new UnreadableStore(`not JSON: ${(error as Error).message}`);
  }
  if (typeof file?.version !== "number" || file.version < 1) throw new UnreadableStore("no version");
  if (file.version > STORE_VERSION) throw new Error(`the store file is version ${file.version}, this build reads up to ${STORE_VERSION}`);
  const state = file.state;
  if (typeof state?.startedAt !== "string" || !Number.isInteger(state.screeningSeq) || LISTS.some((name) => !Array.isArray(state[name]))) {
    throw new UnreadableStore("not the shape of a store");
  }
  return {
    startedAt: state.startedAt,
    routes: new Map(state.routes.map((route) => [route.id, route])),
    reviewedDeclines: new Set(state.reviewedDeclines),
    needs: state.needs,
    contacts: state.contacts,
    readiness: state.readiness,
    ideas: Array.isArray(state.ideas) ? state.ideas : [],
    evaluations: Array.isArray(state.evaluations) ? state.evaluations : [],
    feedback: state.feedback,
    reports: state.reports,
    log: state.log,
    screeningLog: state.screeningLog,
    screeningSeq: state.screeningSeq,
    briefs: new Set(state.briefs),
    counters: new Map(state.counters),
    storedBriefs: new Map(state.storedBriefs.map((brief) => [brief.need_id, brief])),
    clusters: new Map(state.clusters.map((cluster) => [cluster.id, cluster])),
  };
}

/** The state in the file, or the fresh one when there is no file; a file that is not a store is moved aside. */
function load(file: string, fresh: () => MemoryState): { state: MemoryState; loaded: boolean } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: fresh(), loaded: false };
    throw error;
  }
  try {
    return { state: restore(text), loaded: true };
  } catch (error) {
    if (!(error instanceof UnreadableStore)) throw error;
    const aside = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    renameSync(file, aside);
    console.error(`[store] ${file} is ${error.message}; moved to ${aside}, starting afresh`);
    return { state: fresh(), loaded: false };
  }
}

/** Removes the temporary files of writes that never finished. */
function sweepTemporaries(file: string) {
  const prefix = `${path.basename(file)}.`;
  try {
    for (const name of readdirSync(path.dirname(file))) {
      if (name.startsWith(prefix) && name.endsWith(".tmp")) unlinkSync(path.join(path.dirname(file), name));
    }
  } catch {
    // Nothing to sweep.
  }
}

async function renameWithRetries(from: string, to: string) {
  let delay = 20;
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !RETRY_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
        await unlink(from).catch(() => {});
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/** Written whole to a temporary name, flushed to disk, then renamed into place. */
async function writeAtomic(file: string, text: string, temporary: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await renameWithRetries(temporary, file);
}

/** The same, for the exit of the process, where nothing asynchronous runs any more. */
function writeAtomicSync(file: string, text: string, temporary: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const fd = openSync(temporary, "w");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
}

function createSaver(file: string, snapshot: () => string) {
  let dirty = false;
  let running: Promise<void> | null = null;
  let seq = 0;
  const temporary = () => `${file}.${process.pid}.${++seq}.tmp`;

  async function run() {
    // The changes of one request land in one tick; the write follows it.
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      while (dirty) {
        dirty = false;
        await writeAtomic(file, snapshot(), temporary());
      }
    } catch (error) {
      // The next change tries again.
      dirty = true;
      console.error(`[store] not saved to ${file}: ${(error as Error).message}`);
    } finally {
      running = null;
    }
  }

  return {
    schedule() {
      dirty = true;
      running ??= run();
    },
    async flush() {
      await running;
      if (dirty) await (running ??= run());
    },
    flushSync() {
      if (!dirty && !running) return;
      try {
        writeAtomicSync(file, snapshot(), temporary());
        dirty = false;
      } catch (error) {
        console.error(`[store] not saved to ${file} on exit: ${(error as Error).message}`);
      }
    },
  };
}

export function createFileRepository(file: string, options: FileRepositoryOptions = {}): Repository {
  const { state, loaded } = load(file, options.fresh ?? createMemoryState);
  if (loaded) {
    // The recovery point of this start; the temporaries are writes that never finished.
    copyFileSync(file, `${file}.bak`);
    sweepTemporaries(file);
  }
  console.log(
    `[store] ${path.relative(process.cwd(), file)}: ${state.needs.length} needs, ${state.readiness.length} readiness, ${state.routes.size} routes`,
  );

  const saver = createSaver(file, () => serialise(state));
  let closed = false;
  const repo = createMemoryRepository(state, () => {
    if (closed) console.warn(`[store] a change after close is not saved to ${file}`);
    else saver.schedule();
  });
  const onExit = () => saver.flushSync();
  process.once("exit", onExit);

  const now = options.now ?? (() => new Date());
  const retain = () => {
    applyRetentionDefaults(repo, now()).catch((error: unknown) => console.error(`[store] retention failed: ${(error as Error).message}`));
  };
  retain();
  const timer = setInterval(retain, DAY_MS);
  timer.unref();

  return {
    ...repo,
    kind: "file",
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      process.off("exit", onExit);
      await saver.flush();
    },
  };
}
