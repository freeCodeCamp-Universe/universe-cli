import { defaultExclude, defineConfig } from "vitest/config";

// oxlint-disable-next-line import/no-default-export
export default defineConfig({
  test: {
    dir: "src",
    exclude: [...defaultExclude, "**/e2e-tests/**"],
    globalSetup: ["./scripts/vitest-setup.mjs"],
    globals: true,
  },
});
