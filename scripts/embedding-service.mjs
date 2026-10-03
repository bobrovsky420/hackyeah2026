/*
 * Start the embedding service (scripts/embedding-service.py, FR-3.7) with the
 * Python of .venv (docs/quick-start.md). Arguments are passed on, the exit
 * code is returned.
 *
 * Usage, from the repository root:
 *   npx pnpm@12.6.0 embeddings [--self-test] [--port 8765]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python");
const python = path.join(root, ".venv", bin);

if (!existsSync(python)) {
  console.error("embeddings: no Python environment; create .venv first (docs/quick-start.md, step 2)");
  process.exit(1);
}

const child = spawn(python, [path.join(root, "scripts", "embedding-service.py"), ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
