import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Route } from "@/lib/contracts/route";

/*
 * The replay cache of FR-3.5: a finished route by a hash of (problem text,
 * place, role, target groups, data version, prompt versions). The
 * evaluation harness and the demo path hit it; "Policz ponownie" bypasses
 * it; when every provider fails, the pipeline serves a cached route
 * instead of an error (12.4). Files under .local/route-cache/ (git-ignored),
 * so a warmed cache survives a restart and travels to the offline laptop.
 * The text in the key is the gate's redacted text, never the original.
 */

export interface RouteCacheKey {
  text: string;
  placeTerc: string | null;
  role: string | null;
  targetGroups: string[];
  dataVersion: string;
  promptVersions: string[];
}

export interface RouteCache {
  get(key: RouteCacheKey): Route | null;
  set(key: RouteCacheKey, route: Route): void;
}

export function routeCacheHash(key: RouteCacheKey): string {
  const normalised = {
    text: key.text.trim().replace(/\s+/g, " "),
    placeTerc: key.placeTerc,
    role: key.role,
    targetGroups: [...key.targetGroups].sort(),
    dataVersion: key.dataVersion,
    promptVersions: [...key.promptVersions].sort(),
  };
  return createHash("sha256").update(JSON.stringify(normalised)).digest("hex");
}

export function createFileRouteCache(dir = path.join(process.cwd(), ".local", "route-cache")): RouteCache {
  const fileOf = (key: RouteCacheKey) => path.join(dir, `${routeCacheHash(key)}.json`);
  return {
    get(key) {
      try {
        return JSON.parse(readFileSync(fileOf(key), "utf8")) as Route;
      } catch {
        return null;
      }
    },
    set(key, route) {
      try {
        mkdirSync(dir, { recursive: true });
        const file = fileOf(key);
        // Written whole, then renamed: a reader never sees half a file.
        writeFileSync(`${file}.tmp`, JSON.stringify(route));
        renameSync(`${file}.tmp`, file);
      } catch (error) {
        console.warn(`[route-cache] not written: ${(error as Error).name}`);
      }
    },
  };
}

export function createMemoryRouteCache(): RouteCache {
  const routes = new Map<string, Route>();
  return {
    get: (key) => routes.get(routeCacheHash(key)) ?? null,
    set: (key, route) => void routes.set(routeCacheHash(key), route),
  };
}

/**
 * A cached route under a new id and date. The old id also sits inside the
 * links of the next steps ("/kontakt?droga=<id>"), so every occurrence moves.
 */
export function reissue(route: Route, id: string, createdAt: string): Route {
  const copy = JSON.parse(JSON.stringify(route).split(route.id).join(id)) as Route;
  copy.created_at = createdAt;
  copy.engine = { ...copy.engine, cached: true };
  return copy;
}
