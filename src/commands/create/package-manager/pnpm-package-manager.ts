import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createPackageSpecifier } from "./package-json-specifier.js";
import type { PackageSpecifier } from "./package-specifier.port.js";
import { runCmdForFiles, runCmdForStdout } from "./docker-runner.js";

const execFileAsync = promisify(execFile);

/**
 * These values are intrinsic to pnpm. If they change, also update
 * layer-composition/layers/package-manager.json (manifests/lockfile fields).
 */

const LOCKFILE = "pnpm-lock.yaml";
const MANIFESTS = ["package.json", "pnpm-workspace.yaml"];

interface PnpmRunner {
  installLockfileOnly(cwd: string): Promise<void>;
  list(cwd: string): Promise<string>;
}

interface ListedDependency {
  version: string;
}

interface ListedPackage {
  dependencies?: Record<string, ListedDependency>;
  devDependencies?: Record<string, ListedDependency>;
}

type PnpmRunnerFactory = (pmVersion: string) => PnpmRunner;

const isDockerAvailable = async (): Promise<boolean> => {
  try {
    await execFileAsync("docker", ["info"]);
    return true;
  } catch {
    return false;
  }
};

const dockerRunnerFactory: PnpmRunnerFactory = (pmVersion) => ({
  async installLockfileOnly(cwd) {
    await runCmdForFiles(
      cwd,
      ["sh", "-c", `corepack use pnpm@${pmVersion} && pnpm install --lockfile-only`],
      MANIFESTS,
      [LOCKFILE, "package.json"],
    );
  },
  list(cwd) {
    return runCmdForStdout(
      cwd,
      ["pnpm", "list", "--json", "--depth=0", "--lockfile-only"],
      [...MANIFESTS, LOCKFILE],
    );
  },
});

const setPackageManagerHint = async (cwd: string): Promise<void> => {
  const path = join(cwd, "package.json");
  const pkg = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (!pkg["packageManager"]) {
    pkg["packageManager"] = "pnpm";
    await writeFile(path, JSON.stringify(pkg, null, 2), "utf8");
  }
};

const hostRunnerFactory: PnpmRunnerFactory = (pmVersion) => ({
  async installLockfileOnly(cwd) {
    await setPackageManagerHint(cwd);
    await execFileAsync(
      "sh",
      ["-c", `corepack use pnpm@${pmVersion} && pnpm install --lockfile-only`],
      { cwd, encoding: "utf8" },
    );
  },
  async list(cwd) {
    const { stdout } = await execFileAsync(
      "pnpm",
      ["list", "--json", "--depth=0", "--lockfile-only"],
      { cwd, encoding: "utf8" },
    );
    return stdout;
  },
});

const defaultRunnerFactory: PnpmRunnerFactory = (pmVersion) => {
  let resolvedRunner: PnpmRunner | undefined;

  const resolve = async (): Promise<PnpmRunner> => {
    if (resolvedRunner === undefined) {
      const useDocker = await isDockerAvailable();
      resolvedRunner = useDocker
        ? dockerRunnerFactory(pmVersion)
        : hostRunnerFactory(pmVersion);
    }
    return resolvedRunner;
  };

  return {
    async installLockfileOnly(cwd) {
      const runner = await resolve();
      await runner.installLockfileOnly(cwd);
    },
    async list(cwd) {
      const runner = await resolve();
      return runner.list(cwd);
    },
  };
};

const extractVersions = (listOutput: string): Record<string, string> => {
  const packages = JSON.parse(listOutput) as ListedPackage[];
  const root = packages[0] ?? {};
  const versions: Record<string, string> = {};

  for (const [name, dep] of Object.entries(root.dependencies ?? {})) {
    versions[name] = dep.version;
  }

  for (const [name, dep] of Object.entries(root.devDependencies ?? {})) {
    versions[name] = dep.version;
  }

  return versions;
};

class PnpmPackageManager implements PackageSpecifier {
  private readonly createRunner: PnpmRunnerFactory;

  constructor(createRunner: PnpmRunnerFactory = defaultRunnerFactory) {
    this.createRunner = createRunner;
  }

  async specifyDeps(projectDirectory: string, pmVersion: string): Promise<void> {
    const runner = this.createRunner(pmVersion);
    const specifier = createPackageSpecifier({
      deleteBeforeFirstInstall: false,
      extractVersions,
      lockfileName: LOCKFILE,
      runner,
    });
    await specifier.run(projectDirectory);
  }
}

export { dockerRunnerFactory, hostRunnerFactory, PnpmPackageManager };
export type { PnpmRunnerFactory };
