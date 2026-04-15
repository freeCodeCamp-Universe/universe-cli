import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const shared = {
  entry: ["src/index.ts"],
  target: "node22",
  splitting: false,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
} as const;

export default defineConfig([
  {
    ...shared,
    format: ["esm"],
    clean: true,
  },
  {
    ...shared,
    format: ["cjs"],
    clean: false,
    noExternal: [/.*/],
  },
]);
