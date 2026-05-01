import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createAdapterStubs } from "./adapter-stubs.js";
import { StubPackageSpecifier } from "../commands/create/package-manager/package-specifier.stub.js";
import { LayerCompositionService } from "../commands/create/layer-composition/layer-composition-service.js";
import { PackageManagerService } from "../commands/create/package-manager/package-manager.service.js";
import type {
  PackageManager,
  RunOptions,
} from "../commands/create/package-manager/package-manager.service.js";
import { PlatformManifestService } from "../services/platform-manifest-service.js";
import { CreateInputValidationService } from "../commands/create/create-input-validation-service.js";
import { LocalFilesystemWriter } from "../io/local-filesystem-writer.js";
import { LocalProjectReader } from "../io/local-project-reader.js";
import { dispatch } from "../dispatch.js";
import type { CreateSelections, Prompt } from "../commands/create/prompt/prompt.port.js";
import type { RepoInitialiser } from "../io/repo-initialiser.port.js";

interface AdapterOverrides {
  repoInitialiser?: RepoInitialiser;
}

interface MakeDepsOptions {
  adapterOverrides?: AdapterOverrides;
  packageManagerService?: PackageManager;
}

const createPromptPort = (selection: CreateSelections | null): Prompt => ({
  promptForCreateInputs() {
    return Promise.resolve(selection);
  },
});

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
      const entries = readdirSync(currentPath, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          stack.push(entryPath);
        } else {
          const relativePath = relative(directory, entryPath).replaceAll("\\", "/");

          files[relativePath] = readFileSync(entryPath, "utf8");
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
  );
};

const makeDeps = (cwd: string, prompt: Prompt, options: MakeDepsOptions = {}) => {
  const { adapterOverrides = {}, packageManagerService } = options;
  const { observability, ...adapters } = createAdapterStubs();
  return {
    ...adapters,
    filesystemWriter: new LocalFilesystemWriter(),
    layerResolver: new LayerCompositionService(),
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    observability,
    packageManager:
      packageManagerService ??
      new PackageManagerService({
        bun: new StubPackageSpecifier(),
        pnpm: new StubPackageSpecifier(),
      }),
    platformManifestGenerator: new PlatformManifestService(),
    projectReader: new LocalProjectReader(),
    prompt,
    validator: new CreateInputValidationService((path) => existsSync(join(cwd, path))),
    ...adapterOverrides,
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

  it("scaffolds Node.js + Express with all services", async () => {
    const selection = createNodeSelection({
      databases: ["postgresql", "redis"],
      framework: "express",
      name: "node-express-full",
      platformServices: ["analytics", "auth", "email"],
    });

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection));
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(rootDirectory, selection.name))).toBe(true);
  });

  it("scaffolds Node.js + typescript + no services", async () => {
    const selection = createNodeSelection({
      databases: [],
      framework: "typescript",
      name: "node-bare",
      platformServices: [],
    });

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection));
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(rootDirectory, selection.name))).toBe(true);
  });

  it("scaffolds Static", async () => {
    const selection = createStaticSelection("static-smoke");

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection));
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(rootDirectory, selection.name))).toBe(true);
  });

  it("snapshots generated Node.js scaffold output", async () => {
    const selection = createNodeSelection({
      databases: ["postgresql", "redis"],
      framework: "express",
      name: "snapshot-node-app",
      platformServices: ["analytics", "auth", "email"],
    });

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection));
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);

    const generatedFiles = collectGeneratedFiles(join(rootDirectory, selection.name));

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

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection), {
      packageManagerService: { specifyDeps },
    });
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
    expect(specifyDeps).toHaveBeenCalledWith({
      manager: "pnpm",
      projectDirectory: join(rootDirectory, name),
    });
  });

  it("calls packageManager.specifyDeps with the target directory for Static scaffold", async () => {
    const name = "static-no-install-spy";
    const selection = createStaticSelection(name);

    const specifyDeps = vi.fn((_opts: RunOptions) => Promise.resolve());

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection), {
      packageManagerService: { specifyDeps },
    });
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
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

    const repoInitialiser = { initialise: vi.fn((_dir: string) => Promise.resolve()) };

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection), {
      adapterOverrides: { repoInitialiser },
    });
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
    expect(repoInitialiser.initialise).toHaveBeenCalledWith(join(rootDirectory, name));
  });

  it("calls repoInitialiser.initialise with the target directory for Static scaffold", async () => {
    const name = "static-repo-init-spy";
    const selection = createStaticSelection(name);

    const repoInitialiser = { initialise: vi.fn((_dir: string) => Promise.resolve()) };

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection), {
      adapterOverrides: { repoInitialiser },
    });
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);
    expect(repoInitialiser.initialise).toHaveBeenCalledWith(join(rootDirectory, name));
  });

  it("snapshots generated Static scaffold output", async () => {
    const selection = createStaticSelection("snapshot-static-app");

    const { observability, ...deps } = makeDeps(rootDirectory, createPromptPort(selection));
    const result = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    expect(result.exitCode).toBe(0);

    const generatedFiles = collectGeneratedFiles(join(rootDirectory, selection.name));

    expect(generatedFiles).toMatchSnapshot();
  });
});
