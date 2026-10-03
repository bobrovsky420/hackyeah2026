/*
 * `pnpm simulate --run <id> [--serve] [...]`: the simulated users of the
 * skill /simulate-users. Reads .local/simulation/<run>/requests.yaml,
 * drives the real UI in a browser for each persona (types the need, picks
 * the place and the role, waits for the route, then reads, rates,
 * downloads or saves as its behaviour says) and writes what happened to
 * .local/simulation/<run>/results.jsonl. Every request carries the
 * headers x-simulation-run and x-simulation-persona, so the request log
 * (docs/request-log.md) marks it synthetic and the analysis can join the
 * browser's view with the server's traces.
 *
 * --serve builds the app and serves it on --port with the request log in
 * .local/simulation/logs/, the page events on, its own store file, a
 * raised route limit, the live engine and the keys of .env.dev (which
 * `next start` does not read). Without it the app at --base-url (default
 * the developer's `next dev` on port 3000) is used as it is, its store
 * and its LOG_DIR included.
 * For testing and demos only: every live route costs model tokens.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { parse } from "yaml";
import { z } from "zod";
import { parseEnvFile } from "../src/lib/env";

// Run from the repository root, like every script here.
const ROOT = process.cwd();
const ROLES = ["pracownik-instytucji", "urzad-gminy", "organizacja-spoleczna", "mieszkaniec"] as const;
const FEEDBACK = ["tak", "czesciowo", "nie"] as const;

const range = z.tuple([z.number().min(0), z.number().min(0)]);

const personaSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  description_pl: z.string(),
  role: z.enum(ROLES).nullable().default(null),
  place_query: z.string().nullable().default(null),
  expected_terc: z.string().regex(/^\d{7}$/).nullable().default(null),
  // The mode the persona is written to reach: the route modes of src/lib/contracts.ts, and clarification (FR-2.3).
  intent: z.enum(["route", "partial", "none", "clarification", "redirected", "declined", "off_topic"]),
  text_pl: z.string().min(20).max(2000),
  behaviour: z
    .object({
      think_s: range.default([2, 5]),
      dwell_s: range.default([4, 10]),
      clarify_group: z.string().nullable().default(null),
      open_solutions: z.number().int().min(0).max(5).default(1),
      open_map: z.boolean().default(false),
      feedback: z.enum(FEEDBACK).nullable().default(null),
      download: z.boolean().default(false),
      save_need: z.boolean().default(false),
      recompute: z.boolean().default(false),
    })
    .prefault({}),
});

const requestsSchema = z.object({
  run: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/),
  personas: z.array(personaSchema).min(1),
});

type Persona = z.infer<typeof personaSchema>;
type Pace = "fast" | "normal" | "demo";

interface Args {
  run: string;
  check: boolean;
  baseUrl: string;
  port: number;
  serve: boolean;
  build: boolean;
  headed: boolean;
  pace: Pace;
  parallel: number;
  only: string[];
  channel: string;
}

const USAGE = `pnpm simulate --run <id> [options]

  --run <id>          the run folder .local/simulation/<id>/ with requests.yaml
  --check             only validate requests.yaml (schema, ids, gminas); no browser
  --serve             build the app and serve it for the run on --port, with its own store
  --no-build          with --serve: reuse the last build
  --port <n>          with --serve; default 3300
  --base-url <url>    the app to use without --serve; default http://localhost:3000
  --headed            show the browser
  --pace <p>          fast (no waiting), normal (default) or demo (typing letter by letter)
  --parallel <n>      personas at the same time; default 1
  --only <ids>        comma-separated persona ids
  --channel <name>    browser channel; default E2E_CHANNEL or msedge`;

function parseArgs(argv: string[]): Args {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const run = value("--run");
  if (!run || argv.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(run ? 0 : 2);
  }
  const port = Number(value("--port") ?? 3300);
  const pace = (value("--pace") ?? "normal") as Pace;
  if (!["fast", "normal", "demo"].includes(pace)) throw new Error(`--pace ${pace}: fast, normal or demo`);
  return {
    run,
    check: argv.includes("--check"),
    port,
    // Without --serve, the developer's own server (next dev on port 3000).
    baseUrl: (value("--base-url") ?? `http://localhost:${argv.includes("--serve") ? port : 3000}`).replace(/\/$/, ""),
    serve: argv.includes("--serve"),
    build: !argv.includes("--no-build"),
    headed: argv.includes("--headed"),
    pace,
    parallel: Math.max(1, Number(value("--parallel") ?? 1)),
    only: value("--only")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [],
    channel: value("--channel") ?? process.env.E2E_CHANNEL ?? "msedge",
  };
}

/** The problems of a requests file the schema cannot see: repeated ids, unknown gminas, a place without its code. */
function checkRequests(requests: z.infer<typeof requestsSchema>): string[] {
  const register = JSON.parse(readFileSync(path.join(ROOT, "data", "built", "places", "pl-register.json"), "utf8")) as {
    places: { terc: string; level: string; name: string }[];
  };
  const gminas = new Map(register.places.filter((place) => place.level === "gmina").map((place) => [place.terc, place.name]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const persona of requests.personas) {
    if (seen.has(persona.id)) problems.push(`${persona.id}: the id is used twice`);
    seen.add(persona.id);
    if (persona.expected_terc && !gminas.has(persona.expected_terc)) problems.push(`${persona.id}: ${persona.expected_terc} is not a gmina in the register`);
    if (persona.place_query && !persona.expected_terc) problems.push(`${persona.id}: place_query without expected_terc`);
    if (!persona.place_query && persona.expected_terc) problems.push(`${persona.id}: expected_terc without place_query`);
  }
  return problems;
}

// ------------------------------------------------------------------ server

const SERVER_ENV = {
  // The live engine or an error: a canned route would fill the log with examples.
  ROUTE_ENGINE: "live",
  LOG_DIR: ".local/simulation/logs",
  PAGE_EVENTS: "on",
  STORE_FILE: ".local/simulation/store.json",
  RATE_LIMIT_ROUTES_PER_MINUTE: "1000",
};

/** .env.dev, which `next start` does not read in production mode; the environment wins, as in the app. */
function devEnv(): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(path.join(ROOT, ".env.dev"), "utf8"));
  } catch {
    return {};
  }
}

function startServer(args: Args): ChildProcess {
  const env = { ...devEnv(), ...process.env, ...SERVER_ENV };
  if (args.build) {
    log("building the app (PAGE_EVENTS=on)");
    const built = spawnSync("npx next build", { cwd: ROOT, env, shell: true, stdio: "inherit" });
    if (built.status !== 0) throw new Error("next build failed");
  }
  log(`serving on port ${args.port}: log ${SERVER_ENV.LOG_DIR}, store ${SERVER_ENV.STORE_FILE}`);
  return spawn(`npx next start -p ${args.port}`, { cwd: ROOT, env, shell: true, stdio: ["ignore", "ignore", "inherit"] });
}

function stopServer(server: ChildProcess) {
  if (server.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}

async function waitForHealth(baseUrl: string, seconds = 120) {
  for (let tries = 0; tries < seconds; tries++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(1000);
  }
  throw new Error(`${baseUrl}/api/health did not answer within ${seconds} s`);
}

// ------------------------------------------------------------------ persona

interface Outcome {
  run: string;
  persona: string;
  intent: Persona["intent"];
  started_at: string;
  status: "ok" | "error";
  http_status: number | null;
  route_id: string | null;
  mode: string | null;
  repeated: boolean | null;
  place_terc: string | null;
  place_matches: boolean | null;
  wait_ms: number | null;
  clarified_route_id: string | null;
  recomputed_route_id: string | null;
  actions: string[];
  error: string | null;
  screenshot: string | null;
  total_ms: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function between([low, high]: [number, number]) {
  return (low + Math.random() * Math.max(0, high - low)) * 1000;
}

function routeIdOf(url: string): string | null {
  return /\/droga\/(rt-[A-Za-z0-9-]+)/.exec(url)?.[1] ?? null;
}

async function playPersona(browser: Browser, persona: Persona, args: Args, dir: string): Promise<Outcome> {
  const started = Date.now();
  const factor = args.pace === "fast" ? 0 : 1;
  const think = () => sleep(between(persona.behaviour.think_s) * factor);
  const dwell = () => sleep(between(persona.behaviour.dwell_s) * factor);
  const outcome: Outcome = {
    run: args.run,
    persona: persona.id,
    intent: persona.intent,
    started_at: new Date().toISOString(),
    status: "ok",
    http_status: null,
    route_id: null,
    mode: null,
    repeated: null,
    place_terc: null,
    place_matches: null,
    wait_ms: null,
    clarified_route_id: null,
    recomputed_route_id: null,
    actions: [],
    error: null,
    screenshot: null,
    total_ms: 0,
  };
  const context = await browser.newContext({
    baseURL: args.baseUrl,
    locale: "pl-PL",
    acceptDownloads: true,
    extraHTTPHeaders: { "x-simulation-run": args.run, "x-simulation-persona": persona.id },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const done = (action: string) => outcome.actions.push(action);

  try {
    await page.goto("/");
    await think();
    await typeInto(page, page.getByLabel("Co się dzieje i kogo dotyczy?"), persona.text_pl, args.pace);
    done("typed");

    if (persona.place_query) {
      const place = page.getByRole("combobox", { name: "Miejscowość lub gmina" });
      await typeInto(page, place, persona.place_query, args.pace);
      await page.getByRole("option").first().waitFor();
      await place.press("ArrowDown");
      await place.press("Enter");
      outcome.place_terc = (await page.locator('input[type="hidden"][name="miejsce"]').inputValue()) || null;
      outcome.place_matches = persona.expected_terc ? outcome.place_terc === persona.expected_terc : null;
      done("place");
    }
    if (persona.role) {
      await page.locator(`input[name="rola"][value="${persona.role}"]`).check();
      done("role");
    }
    await think();

    const submitted = Date.now();
    const [response] = await Promise.all([
      page.waitForResponse((answer) => answer.url().endsWith("/api/routes") && answer.request().method() === "POST", { timeout: 120_000 }),
      page.getByRole("button", { name: "Znajdź drogę" }).click(),
    ]);
    outcome.http_status = response.status();
    const body = (await response.json().catch(() => null)) as { id?: string; mode?: string; repeated?: boolean } | null;
    outcome.mode = body?.mode ?? null;
    outcome.repeated = body?.repeated ?? null;
    if (!response.ok() || !body?.id) throw new Error(`POST /api/routes answered ${response.status()}`);
    await page.waitForURL(/\/droga\/rt-/, { timeout: 60_000 });
    outcome.route_id = routeIdOf(page.url());
    outcome.wait_ms = Date.now() - submitted;
    done("route");
    await dwell();

    const clarify = page.locator(`input[name="grupa"][value="${persona.behaviour.clarify_group ?? ""}"]`);
    if (persona.behaviour.clarify_group && (await clarify.count()) > 0) {
      await clarify.check();
      await think();
      await page.getByRole("button", { name: "Szukaj ponownie" }).click();
      await page.waitForURL((url) => routeIdOf(url.toString()) !== outcome.route_id, { timeout: 120_000 });
      outcome.clarified_route_id = routeIdOf(page.url());
      done("clarified");
      await dwell();
    }

    const details = page.getByRole("region", { name: "Rozwiązania" }).getByRole("link", { name: "Zobacz szczegóły" });
    const cards = Math.min(persona.behaviour.open_solutions, await details.count());
    for (let index = 0; index < cards; index++) {
      const routeUrl = page.url();
      await details.nth(index).click();
      await page.waitForURL(/\/innowacja\//);
      done(`solution:${new URL(page.url()).pathname.split("/").pop()}`);
      await dwell();
      await page.goto(routeUrl);
    }

    if (persona.behaviour.feedback) {
      const vote = page.locator(`[data-track="feedback"][data-track-id="${persona.behaviour.feedback}"]`);
      if ((await vote.count()) > 0) {
        await think();
        await vote.click();
        done(`feedback:${persona.behaviour.feedback}`);
      }
    }

    const download = page.locator('[data-track="download"]').first();
    if (persona.behaviour.download && (await download.count()) > 0) {
      await Promise.all([page.waitForEvent("download"), download.click()]);
      done("download");
    }

    const recompute = page.getByRole("button", { name: "Policz ponownie" });
    if (persona.behaviour.recompute && (await recompute.count()) > 0) {
      const before = page.url();
      await recompute.click();
      await page.waitForURL((url) => url.toString() !== before && /\/droga\/rt-/.test(url.toString()), { timeout: 120_000 });
      outcome.recomputed_route_id = routeIdOf(page.url());
      done("recomputed");
      await dwell();
    }

    const bank = page.getByRole("link", { name: "Zapisz potrzebę w banku potrzeb", exact: true });
    if (persona.behaviour.save_need && (await bank.count()) > 0) {
      await bank.first().click();
      await page.getByRole("checkbox", { name: /przechowywał opis potrzeby/ }).check();
      await think();
      await page.getByRole("button", { name: "Zapisz potrzebę" }).click();
      await page.waitForLoadState("networkidle");
      done("need_saved");
    }

    if (persona.behaviour.open_map) {
      // The map can be switched off (src/lib/features.ts): it then answers 404.
      const map = await page.goto("/mapa");
      if (map?.ok()) {
        done("map");
        await dwell();
      } else {
        done("map:unavailable");
      }
    }
  } catch (error) {
    outcome.status = "error";
    outcome.error = error instanceof Error ? error.message.split("\n")[0] : String(error);
    outcome.screenshot = path.join(dir, "errors", `${persona.id}.png`);
    mkdirSync(path.dirname(outcome.screenshot), { recursive: true });
    await page.screenshot({ path: outcome.screenshot, fullPage: true }).catch(() => undefined);
  } finally {
    // Leaving the page sends its last page event (the time on it) before the context closes.
    await page.goto("about:blank").catch(() => undefined);
    await sleep(300);
    await context.close();
  }
  outcome.total_ms = Date.now() - started;
  return outcome;
}

async function typeInto(page: Page, field: ReturnType<Page["getByLabel"]>, text: string, pace: Pace) {
  if (pace === "demo") {
    await field.click();
    await field.pressSequentially(text, { delay: 25 });
  } else {
    await field.fill(text);
  }
}

// ------------------------------------------------------------------ main

function log(message: string) {
  process.stdout.write(`[simulate] ${message}\n`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.join(ROOT, ".local", "simulation", args.run);
  const file = path.join(dir, "requests.yaml");
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} does not exist`);
  const requests = requestsSchema.parse(parse(readFileSync(file, "utf8")));
  if (requests.run !== args.run) throw new Error(`requests.yaml names the run ${requests.run}, not ${args.run}`);
  const problems = checkRequests(requests);
  for (const problem of problems) log(`check: ${problem}`);
  if (args.check || problems.length > 0) {
    log(problems.length === 0 ? `${requests.personas.length} personas, no problems` : `${problems.length} problems`);
    return problems.length === 0 ? 0 : 1;
  }
  const personas = requests.personas.filter((persona) => args.only.length === 0 || args.only.includes(persona.id));
  if (personas.length === 0) throw new Error(`no persona matches --only ${args.only.join(",")}`);

  const server = args.serve ? startServer(args) : null;
  const results = path.join(dir, "results.jsonl");
  let failures = 0;
  try {
    await waitForHealth(args.baseUrl);
    const browser = await chromium.launch({ channel: args.channel, headless: !args.headed });
    try {
      const queue = [...personas];
      const worker = async () => {
        for (let persona = queue.shift(); persona; persona = queue.shift()) {
          log(`${persona.id} (${persona.intent}) starts`);
          const outcome = await playPersona(browser, persona, args, dir);
          appendFileSync(results, `${JSON.stringify(outcome)}\n`, "utf8");
          if (outcome.status === "error") failures += 1;
          log(
            `${persona.id} ${outcome.status} mode=${outcome.mode ?? "-"} route=${outcome.route_id ?? "-"} wait=${outcome.wait_ms ?? "-"}ms ` +
              `${outcome.actions.join(",")}${outcome.error ? ` error: ${outcome.error}` : ""}`,
          );
        }
      };
      await Promise.all(Array.from({ length: Math.min(args.parallel, personas.length) }, worker));
    } finally {
      await browser.close();
    }
  } finally {
    if (server) {
      // The server flushes its log lines as it goes; a moment lets the last page events land.
      await sleep(1000);
      stopServer(server);
    }
  }
  log(`${personas.length - failures} of ${personas.length} personas finished; results in ${path.relative(ROOT, results)}`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`pnpm simulate failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  },
);
