import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "../../../src/commands/create/index.js";
import type {
  PackageManager,
  RunOptions,
} from "../../../src/commands/create/package-manager/package-manager.service.js";
import { CreateInputValidationService } from "../../../src/commands/create/create-input-validation-service.js";
import type { CreateSelections, Prompt } from "../../../src/commands/create/prompt/prompt.port.js";
import type { DonationConfigWriter } from "../../../src/commands/create/io/donation-config-writer.port.js";
import type { RepoInitialiser } from "../../../src/commands/create/io/repo-initialiser.port.js";
import type { SkillInstaller } from "../../../src/commands/create/io/skill-installer.port.js";
import { ResolvedLayerSet } from "../../../src/commands/create/layer-composition/layer-composition-service.js";
import { UsageError } from "../../../src/errors.js";
import { RemoteTemplateProvider } from "../../../src/commands/create/layer-composition/template-provider.js";
import {
  FrameworkSchema,
  PackageManagerSchema,
  RuntimeSchema,
} from "../../../src/commands/create/layer-composition/schemas/layers.js";
import type { TemplateProvider } from "../../../src/commands/create/layer-composition/template-provider.js";
import runtimeFixture from "../../fixtures/templates/layers/runtime.json";
import frameworkFixture from "../../fixtures/templates/layers/framework.json";
import packageManagerFixture from "../../fixtures/templates/layers/package-manager.json";

const FIXTURES_DIR = resolve("tests/fixtures/templates");
const runtimeData = RuntimeSchema.parse(runtimeFixture);
const fixtureProvider = new RemoteTemplateProvider(() => ({
  UNIVERSE_TEMPLATES_DIR: FIXTURES_DIR,
}));

class StubDonationConfigWriter implements DonationConfigWriter {
  async write(_projectDirectory: string): Promise<void> {
    // No-op
  }
}

interface MakeDepsOptions {
  packageManager?: PackageManager;
  repoInitialiser?: RepoInitialiser;
  skillInstaller?: SkillInstaller;
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
  "compose.yaml": "services:{}\n",
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
  const {
    packageManager = { specifyDeps: vi.fn(() => Promise.resolve()) },
    repoInitialiser = new StubRepoInitialiser(),
    skillInstaller = { installSkills: vi.fn(() => Promise.resolve()) },
  } = options;
  return {
    cwd,
    dockerCheck: () => true,
    donationConfigWriter: new StubDonationConfigWriter(),
    exit: vi.fn(),
    isTTY: true,
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    packageManager,
    prompt,
    repoInitialiser,
    skillInstaller,
    spinner: { message: vi.fn(), start: vi.fn(), stop: vi.fn(), error: vi.fn() },
    templateProvider: fixtureProvider,
    validator: new CreateInputValidationService((path) => existsSync(join(cwd, path)), runtimeData),
  };
};

describe("create", () => {
  let rootDirectory: string;

  beforeEach(() => {
    vi.stubEnv("UNIVERSE_NO_UPDATE_CHECK", "1");
    rootDirectory = mkdtempSync(join(tmpdir(), "universe-create-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      packageManager: { specifyDeps },
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(specifyDeps).toHaveBeenCalledWith({
      manager: "pnpm",
      pmVersion: "9.0.0",
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
      pmVersion: "9.0.0",
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
    expect(repoInitialiser.initialise).toHaveBeenCalledWith(join(rootDirectory, name));
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
    expect(repoInitialiser.initialise).toHaveBeenCalledWith(join(rootDirectory, name));
  });

  it("installs template-declared skills with the target directory", async () => {
    const name = "node-skills-spy";
    const selection = createNodeSelection({
      databases: [],
      framework: "express",
      name,
      platformServices: [],
    });

    const skillInstaller = {
      installSkills: vi.fn(() => Promise.resolve()),
    };

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      skillInstaller,
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(skillInstaller.installSkills).toHaveBeenCalledWith(
      [
        { repo: "freeCodeCamp/skills", skill: "express-basics" },
        { repo: "freeCodeCamp/skills", skill: "testing" },
      ],
      join(rootDirectory, name),
    );
  });

  it("installs skills before initialising the repo", async () => {
    const selection = createNodeSelection({
      databases: [],
      framework: "express",
      name: "node-skills-order",
      platformServices: [],
    });

    const callOrder: string[] = [];
    const skillInstaller = {
      installSkills: vi.fn(() => {
        callOrder.push("installSkills");
        return Promise.resolve();
      }),
    };
    const repoInitialiser = {
      initialise: vi.fn(() => {
        callOrder.push("initialise");
        return Promise.resolve();
      }),
    };

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      repoInitialiser,
      skillInstaller,
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(callOrder).toStrictEqual(["installSkills", "initialise"]);
  });

  it("does not install skills for a framework without a skills field", async () => {
    const selection = createNodeSelection({
      databases: [],
      framework: "typescript",
      name: "node-no-skills",
      platformServices: [],
    });

    const skillInstaller = {
      installSkills: vi.fn(() => Promise.resolve()),
    };

    const deps = makeDeps(rootDirectory, createPromptPort(selection), {
      skillInstaller,
    });
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(skillInstaller.installSkills).not.toHaveBeenCalled();
  });

  it("snapshots generated Static scaffold output", async () => {
    const selection = createStaticSelection("snapshot-static-app");

    const deps = makeDeps(rootDirectory, createPromptPort(selection));
    await create({ json: false }, deps);

    expect(deps.exit).not.toHaveBeenCalled();

    const generatedFiles = collectGeneratedFiles(join(rootDirectory, selection.name));

    expect(generatedFiles).toMatchSnapshot();
  });

  it("writes the resolved scaffold artifacts to disk when inputs are confirmed", async () => {
    const writerCalls: {
      files: Record<string, string>;
      targetDirectory: string;
    }[] = [];
    const deps = {
      ...makeDeps("/workspace", createPromptPort(createPromptResult)),
      donationConfigWriter: new StubDonationConfigWriter(),
      filesystemWriter: {
        writeProject(targetDirectory: string, files: Record<string, string>) {
          writerCalls.push({ files, targetDirectory });
          return Promise.resolve();
        },
      },
      layerResolver: {
        resolveLayers(_input: CreateSelections): Promise<ResolvedLayerSet> {
          return Promise.resolve({ files: resolvedLayerFiles, layers: [] });
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
      "Project scaffolded. cd into hello-universe and run " +
        "`docker compose up --watch` to start the project",
    );
  });

  it("returns non-zero when prompt flow is cancelled", async () => {
    const deps = makeDeps("/workspace", createPromptPort(null));

    await create({ json: false }, deps);
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
      donationConfigWriter: new StubDonationConfigWriter(),
      filesystemWriter: {
        writeProject(targetDirectory: string) {
          return Promise.reject(new Error(message(targetDirectory)));
        },
      },
      layerResolver: {
        resolveLayers(_input: CreateSelections): Promise<ResolvedLayerSet> {
          return Promise.resolve({ files: resolvedLayerFiles, layers: [] });
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

    expect(deps.logger.error).toHaveBeenCalledWith(message("/workspace/hello-universe"));
  });

  describe("non-interactive mode", () => {
    it("scaffolds with explicit flags and skips prompts", async () => {
      const prompt = createPromptPort(null);
      const promptSpy = vi.spyOn(prompt, "promptForCreateInputs");

      const deps = {
        ...makeDeps(rootDirectory, prompt),
        isTTY: false,
      };

      await create(
        {
          json: false,
          yes: true,
          name: "non-interactive-app",
          runtime: "node",
          framework: "express",
          databases: ["postgresql"],
          services: ["auth"],
          packageManager: "pnpm",
        },
        deps,
      );

      expect(promptSpy).not.toHaveBeenCalled();
      expect(deps.exit).not.toHaveBeenCalled();
      expect(existsSync(join(rootDirectory, "non-interactive-app"))).toBe(true);
      expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining("non-interactive-app"));
      expect(deps.logger.success).not.toHaveBeenCalled();
    });

    it("emits a JSON success envelope when --json is set", async () => {
      const written: string[] = [];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          written.push(String(chunk));
          return true;
        });

      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
      };

      await create(
        {
          json: true,
          yes: true,
          name: "json-app",
          runtime: "node",
          framework: "express",
          databases: [],
          services: [],
          packageManager: "pnpm",
        },
        deps,
      );

      writeSpy.mockRestore();

      expect(deps.exit).not.toHaveBeenCalled();
      expect(deps.logger.success).not.toHaveBeenCalled();

      expect(written).toHaveLength(1);
      const envelope = JSON.parse(written[0]);
      expect(envelope).toMatchObject({
        schemaVersion: "1",
        command: "create",
        success: true,
        name: "json-app",
        runtime: "node",
        framework: "express",
        databases: [],
        platformServices: [],
        packageManager: "pnpm",
      });
      expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(envelope.path).toMatch(/json-app$/);
    });

    it("defaults to the first recommended runtime when --runtime is omitted", async () => {
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
      };
      const validateSpy = vi.spyOn(deps.validator, "validateCreateInput");

      await create(
        {
          json: false,
          yes: true,
          name: "rec-default-app",
          framework: "express",
          packageManager: "pnpm",
        },
        deps,
      );

      expect(deps.exit).not.toHaveBeenCalled();
      expect(validateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: "node" }),
      );
    });

    it("defaults to the first recommended framework when --framework is omitted", async () => {
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
      };
      const validateSpy = vi.spyOn(deps.validator, "validateCreateInput");

      await create(
        {
          json: false,
          yes: true,
          name: "rec-fw-default",
          runtime: "node",
          packageManager: "pnpm",
        },
        deps,
      );

      expect(deps.exit).not.toHaveBeenCalled();
      expect(validateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ framework: "express" }),
      );
    });

    it("defaults to the first recommended PM when --packageManager is omitted", async () => {
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
      };
      const validateSpy = vi.spyOn(deps.validator, "validateCreateInput");

      await create(
        {
          json: false,
          yes: true,
          name: "rec-pm-default",
          runtime: "node",
          framework: "express",
        },
        deps,
      );

      expect(deps.exit).not.toHaveBeenCalled();
      expect(validateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ packageManager: "pnpm" }),
      );
    });

    it("honours an explicit non-recommended flag value", async () => {
      const partialPm = PackageManagerSchema.parse({
        pnpm: { ...packageManagerFixture["pnpm"], recommended: true },
        bun: { ...packageManagerFixture["bun"], recommended: false },
      });
      const modifiedProvider: TemplateProvider = {
        async loadLayers() {
          const base = await fixtureProvider.loadLayers();
          return {
            ...base,
            registry: { ...base.registry, "package-managers": partialPm },
          };
        },
      };
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
        templateProvider: modifiedProvider,
      };

      await create(
        {
          json: false,
          yes: true,
          name: "explicit-bun-app",
          runtime: "node",
          framework: "express",
          packageManager: "bun",
        },
        deps,
      );

      expect(deps.exit).not.toHaveBeenCalled();
      expect(existsSync(join(rootDirectory, "explicit-bun-app"))).toBe(true);
    });

    it("errors when no recommended runtimes and --runtime is omitted", async () => {
      const noRecRuntime = RuntimeSchema.parse({
        node: { ...runtimeFixture["node"], recommended: false },
        static_web: { ...runtimeFixture["static_web"], recommended: false },
      });
      const modifiedProvider: TemplateProvider = {
        async loadLayers() {
          const base = await fixtureProvider.loadLayers();
          return {
            ...base,
            registry: { ...base.registry, runtime: noRecRuntime },
          };
        },
      };
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
        templateProvider: modifiedProvider,
      };

      await create(
        { json: false, yes: true, name: "no-rec-runtime" },
        deps,
      );

      expect(deps.exit).toHaveBeenCalled();
      expect(deps.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("No recommended runtimes"),
      );
    });

    it("errors when no recommended frameworks and --framework is omitted", async () => {
      const noRecFramework = FrameworkSchema.parse({
        ...frameworkFixture,
        express: { ...frameworkFixture["express"], recommended: false },
        "html-css-js": { ...frameworkFixture["html-css-js"], recommended: false },
        "react-vite": { ...frameworkFixture["react-vite"], recommended: false },
        "tanstack-shadcn": { ...frameworkFixture["tanstack-shadcn"], recommended: false },
        typescript: { ...frameworkFixture["typescript"], recommended: false },
      });
      const modifiedProvider: TemplateProvider = {
        async loadLayers() {
          const base = await fixtureProvider.loadLayers();
          return {
            ...base,
            registry: { ...base.registry, frameworks: noRecFramework },
          };
        },
      };
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
        templateProvider: modifiedProvider,
      };

      await create(
        { json: false, yes: true, name: "no-rec-fw", runtime: "node" },
        deps,
      );

      expect(deps.exit).toHaveBeenCalled();
      expect(deps.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("No recommended frameworks"),
      );
    });

    it("errors when no recommended PMs and --packageManager is omitted", async () => {
      const noRecPm = PackageManagerSchema.parse({
        pnpm: { ...packageManagerFixture["pnpm"], recommended: false },
        bun: { ...packageManagerFixture["bun"], recommended: false },
      });
      const modifiedProvider: TemplateProvider = {
        async loadLayers() {
          const base = await fixtureProvider.loadLayers();
          return {
            ...base,
            registry: { ...base.registry, "package-managers": noRecPm },
          };
        },
      };
      const deps = {
        ...makeDeps(rootDirectory, createPromptPort(null)),
        isTTY: false,
        templateProvider: modifiedProvider,
      };

      await create(
        { json: false, yes: true, name: "no-rec-pm", runtime: "node", framework: "express" },
        deps,
      );

      expect(deps.exit).toHaveBeenCalled();
      expect(deps.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("No recommended package managers"),
      );
    });
  });

  it("exits with an error when Docker daemon is not running", async () => {
    const deps = {
      ...makeDeps(rootDirectory, createPromptPort(createPromptResult)),
      dockerCheck: () => false,
    };

    await create({ json: false }, deps);

    expect(deps.exit).toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Docker daemon is not running"),
    );
  });
});
