// Throws UsageError when the file does not exist.
// Any other filesystem error propagates as-is.
interface ProjectReader {
  readFile(filePath: string): Promise<string>;
}

export type { ProjectReader };
