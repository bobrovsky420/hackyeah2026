/*
 * `pnpm eval [--provider anthropic|openai-compatible|replay] [...]`: the
 * evaluation harness of specification 13.2 (src/server/eval/). Runs with
 * `tsx --conditions=react-server`, so the server modules load outside
 * Next.js. The provider is set in LLM_PROVIDER before the model chain is
 * built, which happens on the first import of the harness.
 */

import { EVAL_USAGE, parseArgs, UsageError } from "../src/server/eval/args";

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), "eval");
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${EVAL_USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${EVAL_USAGE}\n`);
    return 0;
  }
  if (args.provider) process.env.LLM_PROVIDER = args.provider;
  const { evalMain } = await import("../src/server/eval/cli");
  return evalMain(args);
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`pnpm eval failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(2);
  },
);
