/*
 * `pnpm cache:warm [--refresh] [...]` (specification 9.6, 12.4): runs every
 * test problem, and with them the demo path of 13.4, through the route
 * pipeline, so the route cache (.local/route-cache/) and the per-call
 * recording (.local/llm-replay/) hold them. Idempotent: routes already
 * cached are hits. Run after every prompt or data change and at the freeze.
 */

import { parseArgs, UsageError, WARM_USAGE } from "../src/server/eval/args";

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), "cache:warm");
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${WARM_USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${WARM_USAGE}\n`);
    return 0;
  }
  if (args.provider) process.env.LLM_PROVIDER = args.provider;
  // The screening log of the runs stays in this process: a script never shares the store file with a running server.
  process.env.STORE_FILE ??= "memory";
  const { warmMain } = await import("../src/server/eval/cli");
  return warmMain(args);
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`pnpm cache:warm failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(2);
  },
);
