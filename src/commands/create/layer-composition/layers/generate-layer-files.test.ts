import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { generateLayerFiles } from "../../../../../scripts/generate-layer-files.mjs";

const LAYERS_SUBDIR = join("src", "commands", "create", "layer-composition", "layers");

interface FolderOpts {
  extraFiles?: Record<string, string>;
  withGitkeep?: boolean;
}

const makeFolder = async (
  root: string,
  type: string,
  key: string,
  opts: FolderOpts = {},
): Promise<void> => {
  const { extraFiles = {}, withGitkeep = true } = opts;
  const keyDir = join(root, "files", type, key);
  await mkdir(keyDir, { recursive: true });
  if (withGitkeep) {
    await writeFile(join(keyDir, ".gitkeep"), "");
  }
  await Promise.all(
    Object.entries(extraFiles).map(async ([name, content]) => {
      const filePath = join(keyDir, name);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }),
  );
};

const makeBaseProject = async (root: string): Promise<void> => {
  const layersDir = join(root, LAYERS_SUBDIR);
  await mkdir(layersDir, { recursive: true });

  const types: [string, string, object][] = [
    ["always.json", "always", { always: {} }],
    ["runtime.json", "runtime", {}],
    ["package-manager.json", "package-manager", {}],
    ["framework.json", "framework", {}],
    ["service.json", "service", {}],
    ["database.json", "database", {}],
  ];

  await Promise.all(
    types.map(async ([filename, typeName, json]) => {
      await writeFile(join(layersDir, filename), JSON.stringify(json, null, 2));
      await mkdir(join(root, "files", typeName), { recursive: true });
    }),
  );

  await makeFolder(root, "always", "always");
};

const readRaw = (root: string, filename: string): Promise<string> =>
  readFile(join(root, LAYERS_SUBDIR, filename), "utf-8");

const readJson = async (root: string, filename: string): Promise<unknown> =>
  JSON.parse(await readRaw(root, filename));

describe(generateLayerFiles, () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "universe-codegen-"));
    await makeBaseProject(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("injects file content into the files key", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ node: {} }, null, 2),
    );
    await makeFolder(root, "runtime", "node", { extraFiles: { Procfile: "web: node index.js\n" } });

    await generateLayerFiles(root);

    const result = await readJson(root, "runtime.json");
    expect(result).toMatchObject({ node: { files: { Procfile: "web: node index.js\n" } } });
  });

  it("excludes .gitkeep from the files map", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ node: {} }, null, 2),
    );
    await makeFolder(root, "runtime", "node", { extraFiles: { "example.txt": "hello" } });

    await generateLayerFiles(root);

    const result = await readJson(root, "runtime.json");
    expect(JSON.stringify(result)).not.toContain(".gitkeep");
    expect(result).toMatchObject({ node: { files: { "example.txt": "hello" } } });
  });

  it("produces empty files object when folder contains only .gitkeep", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ node: {} }, null, 2),
    );
    await makeFolder(root, "runtime", "node");

    await generateLayerFiles(root);

    const result = await readJson(root, "runtime.json");
    expect(result).toMatchObject({ node: { files: {} } });
  });

  it("uses relative paths for files in subdirectories", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "framework.json"),
      JSON.stringify({ express: {} }, null, 2),
    );
    await makeFolder(root, "framework", "express", {
      extraFiles: { "src/index.ts": "export {};\n" },
    });

    await generateLayerFiles(root);

    const result = await readJson(root, "framework.json");
    expect(result).toMatchObject({
      express: { files: { "src/index.ts": "export {};\n" } },
    });
  });

  it("throws when a JSON entry has no corresponding folder", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ node: {} }, null, 2),
    );

    await expect(generateLayerFiles(root)).rejects.toThrow(
      'runtime.json entry "node" has no folder at files/runtime/node/',
    );
  });

  it("throws when a folder has no corresponding JSON entry", async () => {
    await makeFolder(root, "runtime", "node");

    await expect(generateLayerFiles(root)).rejects.toThrow(
      "files/runtime/node/ has no entry in runtime.json",
    );
  });

  it("throws when a folder with a JSON entry has no .gitkeep", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ node: {} }, null, 2),
    );
    await makeFolder(root, "runtime", "node", { withGitkeep: false });

    await expect(generateLayerFiles(root)).rejects.toThrow(
      "files/runtime/node/ is missing a .gitkeep. Please add one",
    );
  });

  it("throws when a folder with no JSON entry has no .gitkeep", async () => {
    await makeFolder(root, "runtime", "node", { withGitkeep: false });

    await expect(generateLayerFiles(root)).rejects.toThrow(
      "files/runtime/node/ has no .gitkeep and no entry in runtime.json. Add the JSON entry or remove the folder",
    );
  });

  it("does not modify any JSON when validation fails", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ missing: {}, node: {} }, null, 2),
    );
    await makeFolder(root, "runtime", "node");

    await expect(generateLayerFiles(root)).rejects.toThrow(
      'runtime.json entry "missing" has no folder at files/runtime/missing/',
    );

    const result = await readJson(root, "runtime.json");
    expect(result).toStrictEqual({ missing: {}, node: {} });
  });

  it("generates JSON files with consistent key ordering", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),

      /** This deliberately has keys in a different order than the expected
      output */
      // oxlint-disable-next-line sort-keys
      JSON.stringify({ node: {}, extra: {}, a: {} }, null, 2),
    );
    await makeFolder(root, "runtime", "node");
    await makeFolder(root, "runtime", "extra");
    await makeFolder(root, "runtime", "a");

    await generateLayerFiles(root);

    const result = await readRaw(root, "runtime.json");
    expect(result).toBe(`{
  "a": {
    "files": {}
  },
  "extra": {
    "files": {}
  },
  "node": {
    "files": {}
  }
}
`);
  });

  it("recursively orders the JSON keys", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),

      /** This deliberately has keys in a different order than the expected
      output */
      // oxlint-disable-next-line sort-keys
      JSON.stringify({ node: { files: { b: "", a: "" }, devCopySource: "" } }, null, 2),
    );
    // oxlint-disable-next-line sort-keys
    await makeFolder(root, "runtime", "node", { extraFiles: { b: "", a: "" } });

    await generateLayerFiles(root);

    const result = await readRaw(root, "runtime.json");
    expect(result).toBe(`{
  "node": {
    "devCopySource": "",
    "files": {
      "a": "",
      "b": ""
    }
  }
}
`);
  });

  it("handles json arrays without modification", async () => {
    await writeFile(
      join(root, LAYERS_SUBDIR, "runtime.json"),
      JSON.stringify({ node: { watchSync: [{ path: "src", target: "/app/src" }] } }, null, 2),
    );
    await makeFolder(root, "runtime", "node", {
      extraFiles: { "src/index.ts": "export {};\n" },
    });

    await generateLayerFiles(root);

    const result = await readJson(root, "runtime.json");
    expect(result).toMatchObject({
      node: {
        files: { "src/index.ts": "export {};\n" },
        watchSync: [{ path: "src", target: "/app/src" }],
      },
    });
  });
});
