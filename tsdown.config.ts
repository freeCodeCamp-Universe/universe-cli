import { defineConfig } from "tsdown";

export default defineConfig({
  deps: {
    alwaysBundle: [/./],
  },
  dts: false,
  entry: ["src/index.ts"],
  format: "cjs",
  outDir: "dist",
});