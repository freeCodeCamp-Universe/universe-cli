// oxlint-disable jest/no-conditional-in-test
// oxlint-disable typescript/require-await
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PackageInstallError } from "../../../errors/cli-errors.js";
import { createPackageSpecifier } from "./package-json-specifier.js";
import type { Runner } from "./package-json-specifier.js";

const LOCKFILE_NAME = "test.lock";
const LIST_OUTPUT = "list-output";
const PINNED_VERSIONS = { express: "5.1.2", typescript: "5.9.3" };

const extractVersions = (output: string): Record<string, string> => {
  if (output === LIST_OUTPUT) {
    return PINNED_VERSIONS;
  }

  return {};
};

const createAdapter = (runner: Runner) =>
  createPackageSpecifier({
    deleteBeforeFirstInstall: false,
    extractVersions,
    lockfileName: LOCKFILE_NAME,
    runner,
  });

describe(createPackageSpecifier, () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "package-json-specifier-test-"));
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^5" }, devDependencies: { typescript: "^5" } }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  const makeHappyRunner = (): Runner => ({
    async installLockfileOnly(cwd: string) {
      await writeFile(join(cwd, LOCKFILE_NAME), "", "utf8");
    },
    async list(_cwd: string) {
      return LIST_OUTPUT;
    },
  });

  describe("specifyDeps", () => {
    it("creates a lockfile", async () => {
      const adapter = createAdapter(makeHappyRunner());

      await adapter.specifyDeps(tmpDir);

      await expect(access(join(tmpDir, LOCKFILE_NAME))).resolves.toBeUndefined();
    });

    it("pins versions in package.json", async () => {
      const adapter = createAdapter(makeHappyRunner());

      await adapter.specifyDeps(tmpDir);

      const content = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(content.dependencies["express"]).toBe("5.1.2");
      expect(content.devDependencies["typescript"]).toBe("5.9.3");
    });

    it("installs a pinned lockfile", async () => {
      let installCount = 0;
      const runner: Runner = {
        async installLockfileOnly(cwd: string) {
          installCount++;
          await writeFile(join(cwd, LOCKFILE_NAME), "", "utf8");
        },
        async list(_cwd: string) {
          return LIST_OUTPUT;
        },
      };
      const adapter = createAdapter(runner);

      await adapter.specifyDeps(tmpDir);

      expect(installCount).toBe(2);
    });

    it("throws PackageInstallError when installLockfileOnly fails", async () => {
      const runner: Runner = {
        async installLockfileOnly(_cwd: string) {
          throw new Error("package manager exited with code 1");
        },
        async list(_cwd: string) {
          return "";
        },
      };
      const adapter = createAdapter(runner);

      await expect(adapter.specifyDeps(tmpDir)).rejects.toBeInstanceOf(PackageInstallError);
    });

    it("throws PackageInstallError if lockfile was not created after the first install", async () => {
      let listCalled = false;
      const runner: Runner = {
        async installLockfileOnly(_cwd: string) {
          // Deliberately does not create a lockfile
        },
        async list(_cwd: string) {
          listCalled = true;
          return LIST_OUTPUT;
        },
      };
      const adapter = createAdapter(runner);

      await expect(adapter.specifyDeps(tmpDir)).rejects.toBeInstanceOf(PackageInstallError);
      expect(listCalled).toBe(false);
    });

    it("throws PackageInstallError when the pinning install fails", async () => {
      let installCount = 0;
      const runner: Runner = {
        async installLockfileOnly(cwd: string) {
          installCount++;
          if (installCount === 1) {
            await writeFile(join(cwd, LOCKFILE_NAME), "", "utf8");
          } else {
            throw new Error("package manager exited with code 1");
          }
        },
        async list(_cwd: string) {
          return LIST_OUTPUT;
        },
      };
      const adapter = createAdapter(runner);

      await expect(adapter.specifyDeps(tmpDir)).rejects.toBeInstanceOf(PackageInstallError);
    });

    it("throws PackageInstallError if lockfile was not created after the pinning install", async () => {
      let installCount = 0;
      const runner: Runner = {
        async installLockfileOnly(cwd: string) {
          installCount++;
          if (installCount === 1) {
            await writeFile(join(cwd, LOCKFILE_NAME), "", "utf8");
          }
          // Second call: deliberately does not create a lockfile
        },
        async list(_cwd: string) {
          return LIST_OUTPUT;
        },
      };
      const adapter = createAdapter(runner);

      await expect(adapter.specifyDeps(tmpDir)).rejects.toBeInstanceOf(PackageInstallError);
    });
  });
});
