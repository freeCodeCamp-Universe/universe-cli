interface PackageSpecifier {
  specifyDeps(projectDirectory: string, pmVersion: string): Promise<void>;
}

export type { PackageSpecifier };
