interface ProjectWriter {
  writeProject(targetDirectory: string, files: Record<string, string>): Promise<void>;
}

export type { ProjectWriter };
