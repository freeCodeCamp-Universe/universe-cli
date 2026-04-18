import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/cli.ts"],
      // Thresholds set at baseline minus ~5% headroom (2026-04-18).
      // Baseline: stmts 96.68, branch 88.10, funcs 100, lines 96.68.
      // Ratchet up as coverage improves.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 95,
        branches: 80,
      },
    },
  },
});
