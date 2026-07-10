import { readFile } from "node:fs/promises";
import { UsageError } from "../../../errors.js";
import type { ProjectReader } from "./project-reader.port.js";

class LocalProjectReader implements ProjectReader {
  async readFile(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new UsageError(`Platform manifest not found at "${filePath}"`);
      }

      throw error;
    }
  }
}

export { LocalProjectReader };
