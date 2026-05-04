interface FilesystemWriter {
  writeProject(targetDirectory: string, files: Record<string, string>): Promise<void>;
}

export type { FilesystemWriter };
