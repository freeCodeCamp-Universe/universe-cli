import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node20",
  clean: true,
  splitting: false,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
});
