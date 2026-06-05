import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UsageError } from "../../../errors.js";
import type { ProjectWriter } from "./project-writer.port.js";

interface FilesystemApi {
  mkdir: typeof mkdir;
  rm: typeof rm;
  writeFile: typeof writeFile;
}

const defaultFilesystemApi: FilesystemApi = {
  mkdir,
  rm,
  writeFile,
};

class LocalProjectWriter implements ProjectWriter {
  private readonly filesystem: FilesystemApi;

  constructor(filesystem: FilesystemApi = defaultFilesystemApi) {
    this.filesystem = filesystem;
  }

  async writeProject(targetDirectory: string, files: Record<string, string>): Promise<void> {
    try {
      await this.filesystem.mkdir(targetDirectory, { recursive: true });

      await Promise.all(
        Object.entries(files)
          .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
          .map(async ([relativePath, content]) => {
            const filePath = join(targetDirectory, relativePath);

            await this.filesystem.mkdir(dirname(filePath), { recursive: true });
            await this.filesystem.writeFile(filePath, content, "utf8");
          }),
      );
    } catch (error) {
      await this.filesystem.rm(targetDirectory, { force: true, recursive: true });

      throw new UsageError(`Failed to write scaffold to "${targetDirectory}": ${(error as Error).message}`);
    }
  }
}

export { LocalProjectWriter };
export type { FilesystemApi };
