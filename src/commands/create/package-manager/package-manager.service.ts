import type { PackageSpecifier } from "./package-specifier.port.js";

interface RunOptions {
  manager: "pnpm" | "bun";
  projectDirectory: string;
}

interface PackageManager {
  specifyDeps(options: RunOptions): Promise<void>;
}

class PackageManagerService implements PackageManager {
  private readonly adapters: Record<string, PackageSpecifier>;

  constructor(adapters: { pnpm: PackageSpecifier; bun: PackageSpecifier }) {
    this.adapters = adapters;
  }

  async specifyDeps(options: RunOptions): Promise<void> {
    const { manager, projectDirectory } = options;
    const adapter = this.adapters[manager];
    if (!adapter) {
      throw new Error(`Unknown package manager: ${manager}`);
    }
    await adapter.specifyDeps(projectDirectory);
  }
}

export { PackageManagerService };
export type { PackageManager, RunOptions };
