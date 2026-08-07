interface ProjectWriter {
  createSymlinks(targetDirectory: string, symlinks: Record<string, string>): Promise<void>;
  writeProject(targetDirectory: string, files: Record<string, string>): Promise<void>;
}

export type { ProjectWriter };
