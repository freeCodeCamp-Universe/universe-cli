import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  deps: {
    alwaysBundle: [/./],
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  dts: false,
  entry: ["src/index.ts"],
  format: "cjs",
  outDir: "dist",
});
