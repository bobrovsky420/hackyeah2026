import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * Unit tests (13.3): pure server modules, next to nothing of Next.js. The
 * "server-only" guard throws outside a React server build, so tests load an
 * empty module in its place.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      { find: "server-only", replacement: fileURLToPath(new URL("./tests/unit/server-only.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
