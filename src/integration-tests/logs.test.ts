import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAdapterStubs } from "./adapter-stubs.js";
import { LocalFilesystemWriter } from "../io/local-filesystem-writer.js";
import { LocalProjectReader } from "../io/local-project-reader.js";
import { CreateInputValidationService } from "../commands/create/create-input-validation-service.js";
import { LayerCompositionService } from "../commands/create/layer-composition/layer-composition-service.js";
import { PlatformManifestService } from "../services/platform-manifest-service.js";
import { dispatch } from "../dispatch.js";
import type { CreateSelections, Prompt } from "../commands/create/prompt/prompt.port.js";
import { PackageManagerService } from "../commands/create/package-manager/package-manager.service.js";
import { StubPackageSpecifier } from "../commands/create/package-manager/package-specifier.stub.js";
import type { MockedFunction } from "vitest";

const createNodeSelection = (name: string): CreateSelections => ({
  confirmed: true,
  databases: [],
  framework: "express",
  name,
  packageManager: "pnpm",
  platformServices: [],
  runtime: "node",
});

const createPromptPort = (selection: CreateSelections | null): Prompt => ({
  promptForCreateInputs() {
    return Promise.resolve(selection);
  },
});

const makeDeps = (cwd: string, prompt: Prompt) => {
  const { observability, ...adapters } = createAdapterStubs();
  return {
    ...adapters,
    filesystemWriter: new LocalFilesystemWriter(),
    layerResolver: new LayerCompositionService(),
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    observability,
    packageManager: new PackageManagerService({
      bun: new StubPackageSpecifier(),
      pnpm: new StubPackageSpecifier(),
    }),
    platformManifestGenerator: new PlatformManifestService(),
    projectReader: new LocalProjectReader(),
    prompt,
    validator: new CreateInputValidationService((path) => existsSync(join(cwd, path))),
  };
};

describe("logs", () => {
  let rootDirectory: string;
  let stderrSpy: MockedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    rootDirectory = mkdtempSync(join(tmpdir(), "universe-logs-"));
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true) as MockedFunction<
      typeof process.stdout.write
    >;
  });

  afterEach(() => {
    rmSync(rootDirectory, { force: true, recursive: true });
    stderrSpy.mockRestore();
  });

  it("retrieves logs for a project scaffolded by universe create", async () => {
    const projectName = "logs-app";
    const { observability, ...deps } = makeDeps(
      rootDirectory,
      createPromptPort(createNodeSelection(projectName)),
    );
    const projectDir = join(rootDirectory, projectName);

    const createResult = await dispatch(["create"], deps, { cwd: rootDirectory }, observability);
    expect(createResult.exitCode).toBe(0);

    const logsResult = await dispatch(
      ["logs", projectDir],
      deps,
      { cwd: rootDirectory },
      observability,
    );
    expect(logsResult.exitCode).toBe(0);
  });

  it("exits for the sentinel failure project name", async () => {
    const { observability, ...deps } = makeDeps(
      rootDirectory,
      createPromptPort(createNodeSelection("logs-failure")),
    );
    const projectDir = join(rootDirectory, "logs-failure");

    await dispatch(["create"], deps, { cwd: rootDirectory }, observability);

    const result = await dispatch(
      ["logs", projectDir],
      deps,
      { cwd: rootDirectory },
      observability,
    );
    expect(result.exitCode).toBeGreaterThan(0);
  });
});
