import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/* Unit tests (13.3): pure server modules, next to nothing of Next.js. */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
