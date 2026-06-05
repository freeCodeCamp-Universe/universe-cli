import { createPackageSpecifier } from "./package-json-specifier.js";
import type { PackageSpecifier } from "./package-specifier.port.js";
import { runCmdForFiles, runCmdForStdout } from "./docker-runner.js";

/**
 * These values are intrinsic to pnpm. If they change, also update
 * layer-composition/layers/package-manager.json (manifests/lockfile fields).
 */

const LOCKFILE = "pnpm-lock.yaml";
const MANIFESTS = ["package.json"];

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

const defaultPnpmRunner: PnpmRunner = {
  async installLockfileOnly(cwd) {
    await runCmdForFiles(cwd, ["pnpm", "install", "--lockfile-only"], MANIFESTS, [LOCKFILE]);
  },
  list(cwd) {
    return runCmdForStdout(
      cwd,
      ["pnpm", "list", "--json", "--depth=0", "--lockfile-only"],
      [...MANIFESTS, LOCKFILE],
    );
  },
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
  private readonly impl: PackageSpecifier;

  constructor(runner: PnpmRunner = defaultPnpmRunner) {
    this.impl = createPackageSpecifier({
      deleteBeforeFirstInstall: false,
      extractVersions,
      lockfileName: LOCKFILE,
      runner,
    });
  }

  specifyDeps(projectDirectory: string): Promise<void> {
    return this.impl.specifyDeps(projectDirectory);
  }
}

export { PnpmPackageManager };
