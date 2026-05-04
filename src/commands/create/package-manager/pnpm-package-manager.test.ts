// oxlint-disable typescript/require-await
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PnpmPackageManager } from "./pnpm-package-manager.js";

const PNPM_LIST_OUTPUT_NO_LODASH = JSON.stringify([
  {
    dependencies: { express: { version: "5.1.2" } },
    devDependencies: { typescript: { version: "5.9.3" } },
    name: "my-app",
  },
]);

describe(PnpmPackageManager, () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pnpm-pm-test-"));
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^5" }, devDependencies: { typescript: "^5" } }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  describe("specifyDeps", () => {
    it("throws when pnpm list does not include an expected dependency (lodash, in this case)", async () => {
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({ dependencies: { express: "^5", lodash: "^4" } }),
        "utf8",
      );

      const runner = {
        async installLockfileOnly(cwd: string) {
          await writeFile(join(cwd, "pnpm-lock.yaml"), "", "utf8");
        },
        async list(_cwd: string) {
          return PNPM_LIST_OUTPUT_NO_LODASH;
        },
      };
      const adapter = new PnpmPackageManager(runner);

      await expect(async () => adapter.specifyDeps(tmpDir)).rejects.toThrow(
        /no pinned version found for package "lodash"/,
      );
    });
  });
});
