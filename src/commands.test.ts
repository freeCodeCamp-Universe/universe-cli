import type {
  AppPlatformManifest,
  PlatformManifest,
} from "./services/platform-manifest-service.js";
import {
  InvalidNameError,
  LogsError,
  ManifestInvalidError,
  ManifestNotFoundError,
  RegistrationError,
  ScaffoldWriteError,
  StatusError,
  TeardownError,
} from "./errors/cli-errors.js";
import type { CreateSelections } from "./commands/create/prompt/prompt.port.js";
import type { StatusResponse } from "./platform/status-client.port.js";
import type { TeardownReceipt } from "./platform/teardown-client.port.js";
import type { ResolvedLayerSet } from "./commands/create/layer-composition/layer-composition-service.js";
import { handleCreate } from "./commands/create/index.js";
import { handleRegister } from "./commands/register/index.js";
import { handleLogs } from "./commands/logs/index.js";
import { handleStatus } from "./commands/status/index.js";
import { handleTeardown } from "./commands/teardown/index.js";

const stubManifest: AppPlatformManifest = {
  domain: { preview: "my-app.preview.example.com", production: "my-app.example.com" },
  environments: { preview: { branch: "preview" }, production: { branch: "main" } },
  name: "my-app",
  owner: "platform-engineering",
  resources: [],
  schemaVersion: "1",
  services: [],
  stack: "app",
};

const successReader = {
  readFile(_filePath: string) {
    return Promise.resolve("stack: app\n");
  },
};

const successValidator = (_yaml: string): PlatformManifest => stubManifest;

const makeLogStub = () => ({
  error: vi.fn<(s: string) => void>(),
  info: vi.fn<(s: string) => void>(),
  success: vi.fn<(s: string) => void>(),
  warn: vi.fn<(s: string) => void>(),
});

const getDeps = <T extends object>(
  adapters: T,
  reader = successReader,
  validator = successValidator,
  logger = makeLogStub(),
) => ({
  logger,
  projectReader: reader,
  ...adapters,
  platformManifestGenerator: {
    generatePlatformManifest(_input: never): never {
      throw new Error("generatePlatformManifest not used");
    },
    validateManifest: validator,
  },
});

const createPromptResult: CreateSelections = {
  confirmed: true,
  databases: ["postgresql"],
  framework: "express",
  name: "hello-universe",
  packageManager: "pnpm",
  platformServices: ["auth", "email"],
  runtime: "node",
};

const resolvedLayerFiles = {
  ".gitignore": "node_modules\n",
  Procfile: "web: node dist/index.js\n",
  "README.md": "# hello-universe\n",
  "docker-compose.dev.yml": "services:{}\n",
  "package.json": '{"name":"hello-universe"}',
  "src/index.ts": "console.log('hello universe');\n",
  "tsconfig.json": '{"compilerOptions":{}}',
};

const successRegistrationClient = {
  register(_manifest: PlatformManifest) {
    return Promise.resolve({ name: "my-app", registrationId: "stub-my-app" });
  },
};

// Shared failing validator fixture for manifest validation error tests
const failingValidator: (yaml: string) => PlatformManifest = () => {
  throw new ManifestInvalidError("/workspace/platform.yaml", "");
};

// --- handleCreate ---

describe(handleCreate, () => {
  it("writes the resolved scaffold artifacts to disk when inputs are confirmed", async () => {
    const writerCalls: { files: Record<string, string>; targetDirectory: string }[] = [];
    const deps = {
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
      logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
      packageManager: {
        specifyDeps: () => Promise.resolve(),
      },
      platformManifestGenerator: {
        generatePlatformManifest(_input: CreateSelections) {
          return "name: hello-universe\n";
        },
        validateManifest(_yaml: never): never {
          throw new Error("validateManifest not used in create");
        },
      },
      prompt: {
        promptForCreateInputs() {
          return Promise.resolve(createPromptResult);
        },
      },
      repoInitialiser: {
        initialise: (_dir: string) => Promise.resolve(),
      },
      validator: {
        validateCreateInput(input: CreateSelections) {
          return input;
        },
      },
    };

    await handleCreate({ cwd: "/workspace" }, deps);

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
    const deps = {
      filesystemWriter: {
        writeProject(_targetDirectory: never): Promise<void> {
          return Promise.reject(new Error("filesystemWriter not used in this test"));
        },
      },
      layerResolver: {
        resolveLayers(_input: never): never {
          throw new Error("layerResolver not used in this test");
        },
      },
      logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
      packageManager: {
        specifyDeps(): never {
          throw new Error("packageManager not used in this test");
        },
      },
      platformManifestGenerator: {
        generatePlatformManifest(_input: never): never {
          throw new Error("generatePlatformManifest not used in this test");
        },
        validateManifest(_yaml: never): never {
          throw new Error("validateManifest not used in this test");
        },
      },
      prompt: {
        promptForCreateInputs() {
          return Promise.resolve(null);
        },
      },
      repoInitialiser: {
        initialise: (_dir: never): never => {
          throw new Error("repoInitialiser not used in this test");
        },
      },
      validator: {
        validateCreateInput(_input: never): never {
          throw new Error("validator not used in this test");
        },
      },
    };

    const result = await handleCreate({ cwd: "/workspace" }, deps);

    expect(result.exitCode).toBeGreaterThan(0);
  });

  it("returns actionable feedback for invalid input", async () => {
    await expect(
      handleCreate(
        { cwd: "/workspace" },
        {
          filesystemWriter: {
            writeProject(_targetDirectory: never): never {
              throw new Error("filesystemWriter not used in this test");
            },
          },
          layerResolver: {
            resolveLayers(_input: never): never {
              throw new Error("layerResolver not used in this test");
            },
          },
          logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
          packageManager: {
            specifyDeps(): never {
              throw new Error("packageManager not used in this test");
            },
          },
          platformManifestGenerator: {
            generatePlatformManifest(_input: never): never {
              throw new Error("generatePlatformManifest not used in this test");
            },
            validateManifest(_yaml: never): never {
              throw new Error("validateManifest not used in this test");
            },
          },
          prompt: {
            promptForCreateInputs() {
              return Promise.resolve(createPromptResult);
            },
          },
          repoInitialiser: {
            initialise: (_dir: never): never => {
              throw new Error("repoInitialiser not used in this test");
            },
          },
          validator: {
            validateCreateInput(_input: CreateSelections): never {
              throw new InvalidNameError("InvalidName");
            },
          },
        },
      ),
    ).rejects.toThrow(InvalidNameError);
  });

  it("throws a typed write failure when scaffold output cannot be written", async () => {
    await expect(
      handleCreate(
        { cwd: "/workspace" },
        {
          filesystemWriter: {
            writeProject(targetDirectory: string) {
              return Promise.reject(
                new ScaffoldWriteError(targetDirectory, new Error("disk full")),
              );
            },
          },
          layerResolver: {
            resolveLayers(_input: CreateSelections): ResolvedLayerSet {
              return { files: resolvedLayerFiles, layers: [] };
            },
          },
          logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
          packageManager: {
            specifyDeps(): never {
              throw new Error("packageManager not used in this test");
            },
          },
          platformManifestGenerator: {
            generatePlatformManifest(_input: CreateSelections) {
              return "name: hello-universe\n";
            },
            validateManifest(_yaml: never): never {
              throw new Error("validateManifest not used in this test");
            },
          },
          prompt: {
            promptForCreateInputs() {
              return Promise.resolve(createPromptResult);
            },
          },
          repoInitialiser: {
            initialise: (_dir: never): never => {
              throw new Error("repoInitialiser not used in this test");
            },
          },
          validator: {
            validateCreateInput(input: CreateSelections) {
              return input;
            },
          },
        },
      ),
    ).rejects.toThrow(ScaffoldWriteError);
  });
});

// --- handleLogs ---

const stubLogEntries = [
  { level: "info", message: "Application started", timestamp: "2026-01-01T00:00:00.000Z" },
];

const successLogsClient = {
  getLogs(_request: { environment: string; manifest: PlatformManifest }) {
    return Promise.resolve({ entries: stubLogEntries, environment: "preview", name: "my-app" });
  },
};

describe(handleLogs, () => {
  it("exits 0 on successful log retrieval", async () => {
    const result = await handleLogs(
      { environment: "preview", projectDirectory: "/workspace" },
      getDeps({ logsClient: successLogsClient }),
    );

    expect(result.exitCode).toBe(0);
  });

  it("output contains the project name, environment, and log entries", async () => {
    const log = makeLogStub();
    await handleLogs(
      { environment: "preview", projectDirectory: "/workspace" },
      getDeps({ logsClient: successLogsClient }, successReader, successValidator, log),
    );

    expect(log.success.mock.calls[0]?.[0]).toContain("my-app");
    expect(log.success.mock.calls[0]?.[0]).toContain("preview");
    expect(log.success.mock.calls[0]?.[0]).toContain("Application started");
  });

  it("reads platform.yaml from the given projectDirectory", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleLogs(
      { environment: "preview", projectDirectory: "/workspace" },
      getDeps({ logsClient: successLogsClient }, trackingReader),
    );

    expect(paths[0]).toBe("/workspace/platform.yaml");
  });

  it("reads platform.yaml from the given directory argument", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleLogs(
      { environment: "preview", projectDirectory: "/some/project" },
      getDeps({ logsClient: successLogsClient }, trackingReader),
    );

    expect(paths[0]).toBe("/some/project/platform.yaml");
  });

  it("exits when platform.yaml is missing", async () => {
    const missingReader = {
      readFile(filePath: string) {
        return Promise.reject(new ManifestNotFoundError(filePath));
      },
    };

    await expect(
      handleLogs(
        { environment: "preview", projectDirectory: "/workspace" },
        getDeps({ logsClient: successLogsClient }, missingReader),
      ),
    ).rejects.toThrow(ManifestNotFoundError);
  });

  it("exits when platform.yaml fails validation", async () => {
    await expect(
      handleLogs(
        { environment: "preview", projectDirectory: "/workspace" },
        getDeps({ logsClient: successLogsClient }, successReader, failingValidator),
      ),
    ).rejects.toThrow(ManifestInvalidError);
  });

  it("exits when log retrieval fails", async () => {
    const failingClient = {
      getLogs(request: { environment: string; manifest: PlatformManifest }) {
        return Promise.reject(new LogsError(request.manifest.name, "timeout"));
      },
    };

    await expect(
      handleLogs(
        { environment: "preview", projectDirectory: "/workspace" },
        getDeps({ logsClient: failingClient }),
      ),
    ).rejects.toThrow(LogsError);
  });

  it("passes the given environment to the logs client", async () => {
    const requests: { environment: string }[] = [];
    const trackingClient = {
      getLogs(request: { environment: string; manifest: PlatformManifest }) {
        requests.push(request);
        return Promise.resolve({ entries: [], environment: request.environment, name: "my-app" });
      },
    };

    await handleLogs(
      { environment: "production", projectDirectory: "/workspace" },
      getDeps({ logsClient: trackingClient }),
    );

    expect(requests[0]?.environment).toBe("production");
  });
});

// --- handleStatus ---

const successStatusClient = {
  getStatus(_request: {
    environment: string;
    manifest: PlatformManifest;
  }): Promise<StatusResponse> {
    return Promise.resolve({
      environment: "preview",
      name: "my-app",
      state: "ACTIVE",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  },
};

describe(handleStatus, () => {
  it("exits 0 on successful status retrieval", async () => {
    const result = await handleStatus(
      { environment: "preview", projectDirectory: "/workspace" },
      getDeps({ statusClient: successStatusClient }),
    );

    expect(result.exitCode).toBe(0);
  });

  it("output contains the project name, environment, and state", async () => {
    const log = makeLogStub();
    await handleStatus(
      { environment: "preview", projectDirectory: "/workspace" },
      getDeps({ statusClient: successStatusClient }, successReader, successValidator, log),
    );

    expect(log.success.mock.calls[0]?.[0]).toContain("my-app");
    expect(log.success.mock.calls[0]?.[0]).toContain("preview");
    expect(log.success.mock.calls[0]?.[0]).toContain("ACTIVE");
  });

  it("reads platform.yaml from the given projectDirectory", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleStatus(
      { environment: "preview", projectDirectory: "/workspace" },
      getDeps({ statusClient: successStatusClient }, trackingReader),
    );

    expect(paths[0]).toBe("/workspace/platform.yaml");
  });

  it("reads platform.yaml from the given directory argument", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleStatus(
      { environment: "preview", projectDirectory: "/some/project" },
      getDeps({ statusClient: successStatusClient }, trackingReader),
    );

    expect(paths[0]).toBe("/some/project/platform.yaml");
  });

  it("exits when platform.yaml is missing", async () => {
    const missingReader = {
      readFile(filePath: string) {
        return Promise.reject(new ManifestNotFoundError(filePath));
      },
    };

    await expect(
      handleStatus(
        { environment: "preview", projectDirectory: "/workspace" },
        getDeps({ statusClient: successStatusClient }, missingReader),
      ),
    ).rejects.toThrow(ManifestNotFoundError);
  });

  it("exits when platform.yaml fails validation", async () => {
    await expect(
      handleStatus(
        { environment: "preview", projectDirectory: "/workspace" },
        getDeps({ statusClient: successStatusClient }, successReader, failingValidator),
      ),
    ).rejects.toThrow(ManifestInvalidError);
  });

  it("exits when status retrieval fails", async () => {
    const failingClient = {
      getStatus(request: { environment: string; manifest: PlatformManifest }) {
        return Promise.reject(new StatusError(request.manifest.name, "unavailable"));
      },
    };

    await expect(
      handleStatus(
        { environment: "preview", projectDirectory: "/workspace" },
        getDeps({ statusClient: failingClient }),
      ),
    ).rejects.toThrow(StatusError);
  });

  it("passes the given environment to the status client", async () => {
    const requests: { environment: string }[] = [];
    const trackingClient = {
      getStatus(request: {
        environment: string;
        manifest: PlatformManifest;
      }): Promise<StatusResponse> {
        requests.push(request);
        return Promise.resolve({
          environment: request.environment,
          name: "my-app",
          state: "ACTIVE",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      },
    };

    await handleStatus(
      { environment: "production", projectDirectory: "/workspace" },
      getDeps({ statusClient: trackingClient }),
    );

    expect(requests[0]?.environment).toBe("production");
  });
});

// --- handleTeardown ---

const successTeardownClient = {
  teardown(_request: { manifest: PlatformManifest }): Promise<TeardownReceipt> {
    return Promise.resolve({ name: "my-app", teardownId: "stub-teardown-my-app-1" });
  },
};

describe(handleTeardown, () => {
  it("exits 0 on successful teardown", async () => {
    const result = await handleTeardown(
      { projectDirectory: "/workspace" },
      getDeps({ teardownClient: successTeardownClient }),
    );

    expect(result.exitCode).toBe(0);
  });

  it("output contains the project name and teardown ID", async () => {
    const log = makeLogStub();
    await handleTeardown(
      { projectDirectory: "/workspace" },
      getDeps({ teardownClient: successTeardownClient }, successReader, successValidator, log),
    );

    expect(log.success.mock.calls[0]?.[0]).toContain("my-app");
    expect(log.success.mock.calls[0]?.[0]).toContain("stub-teardown-my-app-1");
  });

  it("reads platform.yaml from the given projectDirectory", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleTeardown(
      { projectDirectory: "/workspace" },
      getDeps({ teardownClient: successTeardownClient }, trackingReader),
    );

    expect(paths[0]).toBe("/workspace/platform.yaml");
  });

  it("reads platform.yaml from the given directory argument", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleTeardown(
      { projectDirectory: "/some/project" },
      getDeps({ teardownClient: successTeardownClient }, trackingReader),
    );

    expect(paths[0]).toBe("/some/project/platform.yaml");
  });

  it("exits when platform.yaml is missing", async () => {
    const missingReader = {
      readFile(filePath: string) {
        return Promise.reject(new ManifestNotFoundError(filePath));
      },
    };

    await expect(
      handleTeardown(
        { projectDirectory: "/workspace" },
        getDeps({ teardownClient: successTeardownClient }, missingReader),
      ),
    ).rejects.toThrow(ManifestNotFoundError);
  });

  it("exits when platform.yaml fails validation", async () => {
    await expect(
      handleTeardown(
        { projectDirectory: "/workspace" },
        getDeps({ teardownClient: successTeardownClient }, successReader, failingValidator),
      ),
    ).rejects.toThrow(ManifestInvalidError);
  });

  it("exits when teardown fails", async () => {
    const failingClient = {
      teardown(request: { manifest: PlatformManifest }) {
        return Promise.reject(new TeardownError(request.manifest.name, "unavailable"));
      },
    };

    await expect(
      handleTeardown(
        { projectDirectory: "/workspace" },
        getDeps({ teardownClient: failingClient }),
      ),
    ).rejects.toThrow(TeardownError);
  });
});

// --- handleRegister ---

describe(handleRegister, () => {
  it("exits 0 on successful registration", async () => {
    const result = await handleRegister(
      { projectDirectory: "/workspace" },
      getDeps({ registrationClient: successRegistrationClient }),
    );

    expect(result.exitCode).toBe(0);
  });

  it("output contains the project name and registration ID", async () => {
    const log = makeLogStub();
    await handleRegister(
      { projectDirectory: "/workspace" },
      getDeps(
        { registrationClient: successRegistrationClient },
        successReader,
        successValidator,
        log,
      ),
    );

    expect(log.success.mock.calls[0]?.[0]).toContain("my-app");
    expect(log.success.mock.calls[0]?.[0]).toContain("stub-my-app");
  });

  it("reads platform.yaml from the given projectDirectory", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleRegister(
      { projectDirectory: "/workspace" },
      getDeps({ registrationClient: successRegistrationClient }, trackingReader),
    );

    expect(paths[0]).toBe("/workspace/platform.yaml");
  });

  it("reads platform.yaml from the given directory argument", async () => {
    const paths: string[] = [];
    const trackingReader = {
      readFile(filePath: string) {
        paths.push(filePath);
        return Promise.resolve("stack: app\n");
      },
    };

    await handleRegister(
      { projectDirectory: "/some/project" },
      getDeps({ registrationClient: successRegistrationClient }, trackingReader),
    );

    expect(paths[0]).toBe("/some/project/platform.yaml");
  });

  it("exits when platform.yaml is missing", async () => {
    const missingReader = {
      readFile(filePath: string) {
        return Promise.reject(new ManifestNotFoundError(filePath));
      },
    };

    await expect(
      handleRegister(
        { projectDirectory: "/workspace" },
        getDeps({ registrationClient: successRegistrationClient }, missingReader),
      ),
    ).rejects.toThrow(ManifestNotFoundError);
  });

  it("exits when platform.yaml fails validation", async () => {
    await expect(
      handleRegister(
        { projectDirectory: "/workspace" },
        getDeps({ registrationClient: successRegistrationClient }, successReader, failingValidator),
      ),
    ).rejects.toThrow(ManifestInvalidError);
  });

  it("exits when registration fails", async () => {
    const failingClient = {
      register(manifest: PlatformManifest) {
        return Promise.reject(new RegistrationError(manifest.name, "already registered"));
      },
    };

    await expect(
      handleRegister(
        { projectDirectory: "/workspace" },
        getDeps({ registrationClient: failingClient }),
      ),
    ).rejects.toThrow(RegistrationError);
  });
});
