import { defineConfig } from "lint-staged/config";

export default defineConfig({
  "*.!(ts)": "oxfmt --no-error-on-unmatched-pattern",
  "*.{js,ts,mjs,cjs}": ["oxlint", "oxfmt", "vitest related --run"],
});
