import { createPackageSpecifier } from "./package-json-specifier.js";
import type { PackageSpecifier } from "./package-specifier.port.js";
import { runCmdForFiles, runCmdForStdout } from "./docker-runner.js";

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

const defaultRunnerFactory: PnpmRunnerFactory = (pmVersion) => ({
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

  async specifyDeps(
    projectDirectory: string,
    pmVersion: string,
  ): Promise<void> {
    const runner = this.createRunner(pmVersion);
    const impl = createPackageSpecifier({
      deleteBeforeFirstInstall: false,
      extractVersions,
      lockfileName: LOCKFILE,
      runner,
    });
    await impl.specifyDeps(projectDirectory, pmVersion);
  }
}

export { PnpmPackageManager };
export type { PnpmRunnerFactory };
