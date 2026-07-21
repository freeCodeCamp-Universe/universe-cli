// oxlint-disable typescript/require-await
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PnpmPackageManager } from "../../../../src/commands/create/package-manager/pnpm-package-manager.js";
import type { PnpmRunnerFactory } from "../../../../src/commands/create/package-manager/pnpm-package-manager.js";

const PNPM_LIST_OUTPUT_NO_LODASH = JSON.stringify([
  {
    dependencies: { express: { version: "5.1.2" } },
    devDependencies: { typescript: { version: "5.9.3" } },
    name: "my-app",
  },
]);

const makeRunnerFactory =
  (overrides?: {
    installLockfileOnly?: (cwd: string) => Promise<void>;
    list?: (cwd: string) => Promise<string>;
  }): PnpmRunnerFactory =>
  (_pmVersion) => ({
    installLockfileOnly:
      overrides?.installLockfileOnly ??
      (async (cwd: string) => {
        await writeFile(join(cwd, "pnpm-lock.yaml"), "", "utf8");
      }),
    list: overrides?.list ?? (async (_cwd: string) => PNPM_LIST_OUTPUT_NO_LODASH),
  });

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

      const factory = makeRunnerFactory();
      const adapter = new PnpmPackageManager(factory);

      await expect(async () => adapter.specifyDeps(tmpDir, "10.0.0")).rejects.toThrow(
        /no pinned version found for package "lodash"/,
      );
    });

    it("creates runner with the provided pmVersion", async () => {
      const factorySpy = vi.fn(makeRunnerFactory());
      const adapter = new PnpmPackageManager(factorySpy);

      await adapter.specifyDeps(tmpDir, "10.12.1");

      expect(factorySpy).toHaveBeenCalledWith("10.12.1");
    });

    it("calls installLockfileOnly via the factory-created runner", async () => {
      const installSpy = vi.fn(async (cwd: string) => {
        await writeFile(join(cwd, "pnpm-lock.yaml"), "", "utf8");
      });
      const factory = makeRunnerFactory({ installLockfileOnly: installSpy });
      const adapter = new PnpmPackageManager(factory);

      await adapter.specifyDeps(tmpDir, "10.0.0");

      expect(installSpy).toHaveBeenCalled();
    });
  });
});
