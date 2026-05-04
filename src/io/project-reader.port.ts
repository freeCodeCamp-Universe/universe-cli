// Throws ManifestNotFoundError when the file does not exist.
// Any other filesystem error propagates as-is.
interface ProjectReaderPort {
  readFile(filePath: string): Promise<string>;
}

export type { ProjectReaderPort };
