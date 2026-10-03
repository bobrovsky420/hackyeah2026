import { DEFAULT_PROBLEMS_DIR } from "./problems";
import type { GateLevel } from "./summary";

/*
 * The command lines of 9.6: `pnpm eval [--provider ...]` and
 * `pnpm cache:warm`, with the flags of the harness. Pure, so the tests pin
 * them; a wrong flag is a usage error (exit code 2), never a silent default.
 */

export const PROVIDERS = ["openai-compatible", "anthropic", "replay"] as const;
export type ProviderFlag = (typeof PROVIDERS)[number];

export interface EvalArgs {
  command: "eval" | "cache:warm";
  /** Null: LLM_PROVIDER from the environment or .env.dev, default openai-compatible. */
  provider: ProviderFlag | null;
  problemsDir: string;
  /** eval --no-cache: bypass the route cache, store nothing. */
  noCache: boolean;
  /** cache:warm --refresh: recompute every route and overwrite the cache ("Policz ponownie"). */
  refresh: boolean;
  concurrency: number;
  gate: GateLevel;
  exceptions: string[];
  fairnessAll: boolean;
  only: string[];
  outDir: string;
  runTag: boolean;
  verbose: boolean;
  help: boolean;
}

export const EVAL_USAGE = `pnpm eval [options]

Runs the test problems of tests/problems/ through the route pipeline and
writes reports/eval-<timestamp>.md and .json (specification 13.2).

  --provider <p>        openai-compatible (default), anthropic or replay
  --problems <dir>      problem folder (default ${DEFAULT_PROBLEMS_DIR}), e.g. a draft set
  --no-cache            bypass the route cache: every route computed, nothing stored
  --concurrency <n>     problems in parallel (default 1)
  --gate draft|final    the exit rule of 13.5 (default final)
  --except <ids>        final: test problems whose failure the report records as an exception
  --fairness-all        also the role and place pairs of every route case (diagnostics)
  --only <ids>          run only these problems (comma-separated)
  --out <dir>           report folder (default reports)
  --no-run-id           no run id in live prompts
  --verbose             keep the pipeline's log lines
Exit code 0 when every checked MUST item of 13.5 holds, 1 when one fails, 2 on a usage error.`;

export const WARM_USAGE = `pnpm cache:warm [options]

Runs every test problem (the demo path of 13.4 included) through the route
pipeline so the route cache (.local/route-cache/) and the per-call
recording (.local/llm-replay/) hold them; reports hits and misses.
Idempotent: a second run only hits.

  --provider <p>        openai-compatible (default), anthropic or replay
  --problems <dir>      problem folder (default ${DEFAULT_PROBLEMS_DIR})
  --refresh             recompute every route and overwrite its cache entry
  --concurrency <n>     problems in parallel (default 1)
  --only <ids>          warm only these problems (comma-separated)
  --verbose             keep the pipeline's log lines`;

export class UsageError extends Error {}

function list(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseArgs(argv: readonly string[], command: EvalArgs["command"]): EvalArgs {
  const args: EvalArgs = {
    command,
    provider: null,
    problemsDir: DEFAULT_PROBLEMS_DIR,
    noCache: false,
    refresh: false,
    concurrency: 1,
    gate: "final",
    exceptions: [],
    fairnessAll: false,
    only: [],
    outDir: "reports",
    runTag: true,
    verbose: false,
    help: false,
  };
  const evalOnly = new Set(["--no-cache", "--gate", "--except", "--fairness-all", "--out", "--no-run-id"]);
  const warmOnly = new Set(["--refresh"]);

  for (let i = 0; i < argv.length; i++) {
    // pnpm may pass the separator through.
    if (argv[i] === "--") continue;
    const [flag, inline] = argv[i].startsWith("--") && argv[i].includes("=") ? [argv[i].slice(0, argv[i].indexOf("=")), argv[i].slice(argv[i].indexOf("=") + 1)] : [argv[i], undefined];
    if ((command === "eval" && warmOnly.has(flag)) || (command === "cache:warm" && evalOnly.has(flag))) {
      throw new UsageError(`${flag} is not an option of pnpm ${command}`);
    }
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case "--provider": {
        const provider = value();
        if (!(PROVIDERS as readonly string[]).includes(provider)) throw new UsageError(`--provider must be one of ${PROVIDERS.join(", ")}`);
        args.provider = provider as ProviderFlag;
        break;
      }
      case "--problems":
        args.problemsDir = value();
        break;
      case "--no-cache":
        args.noCache = true;
        break;
      case "--refresh":
        args.refresh = true;
        break;
      case "--concurrency": {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 1 || n > 8) throw new UsageError("--concurrency must be a whole number from 1 to 8");
        args.concurrency = n;
        break;
      }
      case "--gate": {
        const gate = value();
        if (gate !== "draft" && gate !== "final") throw new UsageError("--gate must be draft or final");
        args.gate = gate;
        break;
      }
      case "--except":
        args.exceptions = list(value());
        break;
      case "--fairness-all":
        args.fairnessAll = true;
        break;
      case "--only":
        args.only = list(value());
        break;
      case "--out":
        args.outDir = value();
        break;
      case "--no-run-id":
        args.runTag = false;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new UsageError(`unknown option ${argv[i]}`);
    }
  }
  return args;
}
