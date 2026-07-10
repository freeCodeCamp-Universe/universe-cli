import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globalSetup: ["./scripts/vitest-setup.mjs"],
    include: ["tests/**/*.test.ts"],
  },
});
