import { defineConfig } from "tsdown";

export default defineConfig({
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: ["src/index.ts"],
  format: "esm",
  outDir: "dist",
});
