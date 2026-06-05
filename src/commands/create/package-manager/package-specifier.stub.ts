import type { PackageSpecifier } from "./package-specifier.port.js";

class StubPackageSpecifier implements PackageSpecifier {
  async specifyDeps(_projectDirectory: string): Promise<void> {
    // No-op
  }
}

export { StubPackageSpecifier };
