/*
 * `pnpm eval:tasks [--provider anthropic|openai-compatible|replay] [...]`:
 * the golden cases of the model tasks beyond the route (decision A.17,
 * src/server/eval/tasks.ts), run with tsx. The provider is set in
 * LLM_PROVIDER before the model chain is built, which happens on the first
 * import of the harness.
 */

import { parseTasksArgs, TASKS_USAGE, TasksUsageError } from "../src/server/eval/tasks-cli";

async function main(): Promise<number> {
  let args;
  try {
    args = parseTasksArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof TasksUsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${TASKS_USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${TASKS_USAGE}\n`);
    return 0;
  }
  if (args.provider) process.env.LLM_PROVIDER = args.provider;
  // A script never shares the store file with a running server.
  process.env.STORE_FILE ??= "memory";
  const { tasksMain } = await import("../src/server/eval/tasks-cli");
  return tasksMain(args);
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`pnpm eval:tasks failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(2);
  },
);
