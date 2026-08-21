import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(path)
        : Promise.resolve(path.endsWith(".ts") ? [path] : []);
    }),
  );
  return nested.flat();
}

describe("create package boundaries", () => {
  it("does not import root source or escape the package", async () => {
    const sourceDirectory = "src";
    const violations: string[] = [];

    for (const file of await sourceFiles(sourceDirectory)) {
      const source = await readFile(file, "utf8");
      const specifiers = source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g);

      for (const match of specifiers) {
        const specifier = match[1];
        if (
          specifier !== undefined &&
          (specifier.includes("/src/") || specifier.startsWith("../../"))
        ) {
          violations.push(`${relative(sourceDirectory, file)}: ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("imports core only by its package name", async () => {
    const sourceDirectory = "src";
    const sources = await Promise.all(
      (await sourceFiles(sourceDirectory)).map((file) => readFile(file, "utf8")),
    );
    const coreImports = sources.flatMap((source) =>
      [...source.matchAll(/(?:from\s+|import\s*)["']([^"']*core[^"']*)["']/g)].map(
        (match) => match[1],
      ),
    );

    expect(coreImports.length).toBeGreaterThan(0);
    expect(new Set(coreImports)).toEqual(new Set(["@freecodecamp/universe-core"]));
  });
});
