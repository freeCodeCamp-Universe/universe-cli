import { readFile } from "node:fs/promises";
import { ManifestNotFoundError } from "../errors/cli-errors.js";
import type { ProjectReaderPort } from "./project-reader.port.js";

class LocalProjectReader implements ProjectReaderPort {
  async readFile(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new ManifestNotFoundError(filePath);
      }

      throw error;
    }
  }
}

export { LocalProjectReader };
