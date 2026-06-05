interface PackageSpecifier {
  specifyDeps(projectDirectory: string): Promise<void>;
}

export type { PackageSpecifier };
