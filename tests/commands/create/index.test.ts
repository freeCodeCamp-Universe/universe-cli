import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "../../../src/commands/create/index.js";
import type {
  PackageManager,
  RunOptions,
} from "../../../src/commands/create/package-manager/package-manager.service.js";
import { CreateInputValidationService } from "../../../src/commands/create/create-input-validation-service.js";
import type {
  CreateSelections,
  Prompt,
} from "../../../src/commands/create/prompt/prompt.port.js";
import type { RepoInitialiser } from "../../../src/commands/create/io/repo-initialiser.port.js";
import { ResolvedLayerSet } from "../../../src/commands/create/layer-composition/layer-composition-service.js";
import { UsageError } from "../../../src/errors.js";

interface MakeDepsOptions {
  packageManager?: PackageManager;
  repoInitialiser?: RepoInitialiser;
}

const createPromptPort = (selection: CreateSelections | null): Prompt => ({
  promptForCreateInputs() {
    return Promise.resolve(selection);
  },
});

class StubRepoInitialiser implements RepoInitialiser {
  async initialise(_projectDirectory: string): Promise<void> {
    // No-op
  }
}

const resolvedLayerFiles = {
  ".gitignore": "node_modules\n",
  Procfile: "web: node dist/index.js\n",
  "README.md": "# hello-universe\n",
  "docker-compose.dev.yml": "services:{}\n",
  "package.json": '{"name":"hello-universe"}',
  "src/index.ts": "console.log('hello universe');\n",
  "tsconfig.json": '{"compilerOptions":{}}',
};

const createPromptResult: CreateSelections = {
  confirmed: true,
  databases: ["postgresql"],
  framework: "express",
  name: "hello-universe",
  packageManager: "pnpm",
  platformServices: ["auth", "email"],
  runtime: "node",
};

const createNodeSelection = (selection: {
  databases: CreateSelections["databases"];
  framework: "express" | "typescript";
  name: string;
  platformServices: CreateSelections["platformServices"];
}): CreateSelections => ({
  confirmed: true,
  databases: selection.databases,
  framework: selection.framework,
  name: selection.name,
  packageManager: "pnpm",
  platformServices: selection.platformServices,
  runtime: "node",
});

const createStaticSelection = (name: string): CreateSelections => ({
  confirmed: true,
  databases: [],
  framework: "html-css-js",
  name,
  packageManager: "pnpm",
  platformServices: [],
  runtime: "static_web",
});

const collectGeneratedFiles = (directory: string): Record<string, string> => {
  const files: Record<string, string> = {};
  const stack = [directory];

  while (stack.length > 0) {
    const currentPath = stack.pop();

    if (currentPath !== undefined) {
      const entries = readdirSync(currentPath, { withFileTypes: true }).sort(
        (left, right) => left.name.localeCompare(right.name),
      );

      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          stack.push(entryPath);
        } else {
          const relativePath = relative(directory, entryPath).replaceAll(
            "\\",
            "/",
          );

          files[relativePath] = readFileSync(entryPath, "utf8");
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
  );
};

const makeDeps = (
  cwd: string,
  prompt: Prompt,
  options: MakeDepsOptions = {},
) => {
  const {
    packageManager = { specifyDeps: vi.fn(() => Promise.resolve()) },
    repoInitialiser = new StubRepoInitialiser(),
  } = options;
  return {
    cwd,
    exit: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    packageManager,
    prompt,
    repoInitialiser,
    validator: new CreateInputValidationService((path) =>
      existsSync(join(cwd, path)),
    ),
  };
};

describe("create", () => {
  let rootDirectory: string;

  beforeEach(() => {
    rootDirectory = mkdtempSync(join(tmpdir(), "universe-create-"));
  });

  afterEach(() => {
    rmSync(rootDirectory, { force: true, recursive: true });
  });

  it("scaffolds Node.js + typescript + no services", async () => {
    const selection = createNodeSelection({
      databases: [],
      framework: "typescript",
      name: "node-bare",
      platformServices: [],
    });

    const deps = makeDeps(rootDirectory, createPromptPort(selection));
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(existsSync(join(rootDirectory, selection.name))).toBe(true);
  });

  it("snapshots generated Node.js scaffold output", async () => {
    const selection = createNodeSelection({
      databases: ["postgresql", "redis"],
      framework: "express",
      name: "snapshot-node-app",
      platformServices: ["analytics", "auth", "email"],
    });

    const deps = makeDeps(rootDirectory, createPromptPort(selection));
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();

    const generatedFiles = collectGeneratedFiles(
      join(rootDirectory, selection.name),
    );

    expect(generatedFiles).toMatchSnapshot();
  });

  it("calls packageManager.specifyDeps with the target directory for Node.js scaffold", async () => {
    const name = "node-install-spy";
    const selection = createNodeSelection({
      databases: [],
      framework: "typescript",
      name,
      platformServices: [],
    });

    const specifyDeps = vi.fn((_opts: RunOptions) => Promise.resolve());

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      packageManager: { specifyDeps },
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(specifyDeps).toHaveBeenCalledWith({
      manager: "pnpm",
      projectDirectory: join(rootDirectory, name),
    });
  });

  it("calls packageManager.specifyDeps with the target directory for Static scaffold", async () => {
    const name = "static-no-install-spy";
    const selection = createStaticSelection(name);

    const specifyDeps = vi.fn((_opts: RunOptions) => Promise.resolve());

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      packageManager: { specifyDeps },
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(specifyDeps).toHaveBeenCalledWith({
      manager: "pnpm",
      projectDirectory: join(rootDirectory, name),
    });
  });

  it("calls repoInitialiser.initialise with the target directory for Node.js scaffold", async () => {
    const name = "node-repo-init-spy";
    const selection = createNodeSelection({
      databases: [],
      framework: "typescript",
      name,
      platformServices: [],
    });

    const repoInitialiser = {
      initialise: vi.fn((_dir: string) => Promise.resolve()),
    };

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      repoInitialiser,
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(repoInitialiser.initialise).toHaveBeenCalledWith(
      join(rootDirectory, name),
    );
  });

  it("calls repoInitialiser.initialise with the target directory for Static scaffold", async () => {
    const name = "static-repo-init-spy";
    const selection = createStaticSelection(name);

    const repoInitialiser = {
      initialise: vi.fn((_dir: string) => Promise.resolve()),
    };

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      repoInitialiser,
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(repoInitialiser.initialise).toHaveBeenCalledWith(
      join(rootDirectory, name),
    );
  });

  it("snapshots generated Static scaffold output", async () => {
    const selection = createStaticSelection("snapshot-static-app");

    const deps = makeDeps(rootDirectory, createPromptPort(selection));
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();

    const generatedFiles = collectGeneratedFiles(
      join(rootDirectory, selection.name),
    );

    expect(generatedFiles).toMatchSnapshot();
  });

  it("writes the resolved scaffold artifacts to disk when inputs are confirmed", async () => {
    const writerCalls: {
      files: Record<string, string>;
      targetDirectory: string;
    }[] = [];
    const deps = {
      ...makeDeps("/workspace", createPromptPort(createPromptResult)),
      filesystemWriter: {
        writeProject(targetDirectory: string, files: Record<string, string>) {
          writerCalls.push({ files, targetDirectory });
          return Promise.resolve();
        },
      },
      layerResolver: {
        resolveLayers(_input: CreateSelections): ResolvedLayerSet {
          return { files: resolvedLayerFiles, layers: [] };
        },
      },
      platformManifestGenerator: {
        generatePlatformManifest(_input: CreateSelections) {
          return "name: hello-universe\n";
        },
        validateManifest(_yaml: never): never {
          throw new Error("validateManifest not used in create");
        },
      },
    };

    await create({ json: true }, deps);

    expect(writerCalls).toStrictEqual([
      {
        files: {
          ...resolvedLayerFiles,
          "platform.yaml": "name: hello-universe\n",
        },
        targetDirectory: "/workspace/hello-universe",
      },
    ]);
    expect(deps.logger.success).toHaveBeenCalledWith(
      "Scaffolded project at /workspace/hello-universe",
    );
  });

  it("returns non-zero when prompt flow is cancelled", async () => {
    const deps = makeDeps("/workspace", createPromptPort(null));

    await create({ json: true }, deps);
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("returns actionable feedback for invalid input", async () => {
    // 'json' should be false since we're interested in user-facing errors.
    const deps = {
      ...makeDeps("/workspace", createPromptPort(createPromptResult)),
      validator: {
        validateCreateInput(_input: CreateSelections): never {
          throw new UsageError("InvalidName");
        },
      },
    };

    await create({ json: false }, deps);

    expect(deps.logger.error).toHaveBeenCalledWith("InvalidName");
  });

  it("throws a typed write failure when scaffold output cannot be written", async () => {
    const message = (target: string) => `Failed to write files to ${target}`;
    const deps = {
      ...makeDeps("/workspace", createPromptPort(createPromptResult)),
      filesystemWriter: {
        writeProject(targetDirectory: string) {
          return Promise.reject(new Error(message(targetDirectory)));
        },
      },
      layerResolver: {
        resolveLayers(_input: CreateSelections): ResolvedLayerSet {
          return { files: resolvedLayerFiles, layers: [] };
        },
      },
      platformManifestGenerator: {
        generatePlatformManifest(_input: CreateSelections) {
          return "name: hello-universe\n";
        },
        validateManifest(_yaml: never): never {
          throw new Error("validateManifest not used in create");
        },
      },
    };

    await create({ json: false }, deps);

    expect(deps.logger.error).toHaveBeenCalledWith(
      message("/workspace/hello-universe"),
    );
  });
});
