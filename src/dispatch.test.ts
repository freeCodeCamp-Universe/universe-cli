import { dispatch } from "./dispatch.js";
import type { Dependencies } from "./dispatch.js";
import { StubDeviceFlow } from "./auth/stub-device-flow.js";
import { StubIdentityResolver } from "./auth/stub-identity-resolver.js";
import type { FilesystemWriter } from "./io/filesystem-writer.port.js";
import type { ObservabilityClient } from "./observability/observability-client.port.js";
import { StubProxyClient } from "./platform/proxy-client.stub.js";
import { StubTokenStore } from "./auth/stub-token-store.js";
import type { CreateSelections, Prompt } from "./commands/create/prompt/prompt.port.js";
import type { StatusResponse } from "./platform/status-client.port.js";
import type { ResolvedLayerSet } from "./commands/create/layer-composition/layer-composition-service.js";
import type { PlatformManifest } from "./services/platform-manifest-service.js";
import type { MockedFunction } from "vitest";
import { EXIT_USAGE } from "./errors/exit-codes.js";

// --- Test stubs and helpers ---
const client: ObservabilityClient = {
  error() {},
  safeError() {},
  safeTrack() {},
  track() {},
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

const createPrompt: Prompt = {
  promptForCreateInputs() {
    return Promise.resolve(createPromptResult);
  },
};

const passThroughValidator = {
  validateCreateInput(input: CreateSelections) {
    return input;
  },
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

const passThroughLayerResolver = {
  resolveLayers(_input: CreateSelections): ResolvedLayerSet {
    return { files: resolvedLayerFiles, layers: [] };
  },
};

const manifestGenerator = {
  generatePlatformManifest(_input: CreateSelections) {
    return "name: hello-universe\n";
  },
  validateManifest(_yaml: string): PlatformManifest {
    return defaultManifest;
  },
};

const recordingWriter: FilesystemWriter = {
  writeProject() {
    return Promise.resolve();
  },
};

const defaultProjectReader = {
  readFile() {
    return Promise.resolve("");
  },
};

const defaultRegistrationClient = {
  register() {
    return Promise.resolve({ name: "", registrationId: "" });
  },
};

const defaultLogsClient = {
  getLogs() {
    return Promise.resolve({ entries: [], environment: "", name: "" });
  },
};

const defaultStatusClient = {
  getStatus(): Promise<StatusResponse> {
    return Promise.resolve({ environment: "", name: "", state: "INACTIVE", updatedAt: "" });
  },
};

const defaultTeardownClient = {
  teardown() {
    return Promise.resolve({ name: "", teardownId: "" });
  },
};

const defaultManifest: PlatformManifest = {
  domain: { preview: "my-app.preview.example.com", production: "my-app.example.com" },
  environments: { preview: { branch: "preview" }, production: { branch: "main" } },
  name: "my-app",
  owner: "platform-engineering",
  resources: [],
  schemaVersion: "1",
  services: [],
  stack: "app",
};

const defaultRepoInitialiser = {
  initialise: (_dir: string) => Promise.resolve(),
};

const createDependencies = (overrides: Partial<Dependencies> = {}): Dependencies => ({
  deviceFlow: new StubDeviceFlow(),
  filesystemWriter: recordingWriter,
  identityResolver: new StubIdentityResolver(null),
  layerResolver: passThroughLayerResolver,
  logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
  logsClient: defaultLogsClient,
  packageManager: { specifyDeps: () => Promise.resolve() },
  platformManifestGenerator: manifestGenerator,
  projectReader: defaultProjectReader,
  prompt: createPrompt,
  proxyClient: new StubProxyClient(),
  registrationClient: defaultRegistrationClient,
  repoInitialiser: defaultRepoInitialiser,
  statusClient: defaultStatusClient,
  teardownClient: defaultTeardownClient,
  tokenStore: new StubTokenStore(),
  validator: passThroughValidator,
  ...overrides,
});

const ctx = { cwd: "/workspace" };

describe(dispatch, () => {
  let stdoutSpy: MockedFunction<typeof process.stdout.write>;
  let stderrSpy: MockedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true) as MockedFunction<
      typeof process.stdout.write
    >;
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true) as MockedFunction<
      typeof process.stderr.write
    >;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe("--help", () => {
    it("exits with code 0", async () => {
      const result = await dispatch(["--help"], createDependencies(), ctx, client);
      expect(result.exitCode).toBe(0);
    });

    it("output contains static and auth commands", async () => {
      const deps = createDependencies();
      await dispatch(["--help"], deps, ctx, client);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("static"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("auth"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("login"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("logout"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("whoami"));
    });

    it("does not call observability for help", async () => {
      const tracked: string[] = [];
      const trackingObs: ObservabilityClient = {
        error() {},
        safeError() {},
        safeTrack(event: string) {
          tracked.push(event);
        },
        track() {},
      };
      await dispatch(["--help"], createDependencies(), ctx, trackingObs);
      expect(tracked).toHaveLength(0);
    });
  });

  describe("-h", () => {
    it("exits with code 0", async () => {
      const result = await dispatch(["-h"], createDependencies(), ctx, client);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("no arguments", () => {
    it("exits with code 0", async () => {
      const result = await dispatch([], createDependencies(), ctx, client);
      expect(result.exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    });
  });

  describe("unknown command", () => {
    it("exits with a non-zero code", async () => {
      const result = await dispatch(["unknown-cmd"], createDependencies(), ctx, client);
      expect(result.exitCode).toBe(EXIT_USAGE);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown command"));
    });

    it("does not call observability for unknown commands", async () => {
      const tracked: string[] = [];
      const trackingObs: ObservabilityClient = {
        error() {},
        safeError() {},
        safeTrack(event: string) {
          tracked.push(event);
        },
        track() {},
      };
      await dispatch(["unknown-cmd"], createDependencies(), ctx, trackingObs);
      expect(tracked).toHaveLength(0);
    });
  });

  describe("create", () => {
    it("is interactive-only and rejects extra args", async () => {
      const result = await dispatch(["create", "my-app"], createDependencies(), ctx, client);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("interactive-only"));
    });

    it("does not call observability on bad args", async () => {
      const tracked: string[] = [];
      const trackingObs: ObservabilityClient = {
        error() {},
        safeError() {},
        safeTrack(event: string) {
          tracked.push(event);
        },
        track() {},
      };
      await dispatch(["create", "my-app"], createDependencies(), ctx, trackingObs);
      expect(tracked).toHaveLength(0);
    });
  });

  describe("register", () => {
    it("exits when more than one argument is provided", async () => {
      const result = await dispatch(
        ["register", "/dir", "extra"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("too many arguments"));
    });
  });

  describe("static deploy", () => {
    it("is recognised (not an unknown command error)", async () => {
      await dispatch(["static", "deploy"], createDependencies(), ctx, client);
      expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining("unknown command"));
    });

    it("exits when extra args are provided", async () => {
      const result = await dispatch(
        ["static", "deploy", "extra"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe("deploy without static prefix", () => {
    it("exits with a non-zero code", async () => {
      const result = await dispatch(["deploy"], createDependencies(), ctx, client);
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe("static promote", () => {
    it("exits when extra args are provided", async () => {
      const result = await dispatch(
        ["static", "promote", "extra"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe("static rollback", () => {
    it("exits when --to is not provided", async () => {
      const result = await dispatch(["static", "rollback"], createDependencies(), ctx, client);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--to"));
    });
  });

  describe("static list", () => {
    it("exits when an unknown argument is provided", async () => {
      const result = await dispatch(
        ["static", "list", "bad-arg"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe("--version", () => {
    it("exits with code 0", async () => {
      const result = await dispatch(["--version"], createDependencies(), ctx, client);
      expect(result.exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringMatching(/\d+\.\d+\.\d+/));
    });
  });

  describe("login", () => {
    it("is recognised (not an unknown command error)", async () => {
      await dispatch(["login"], createDependencies(), ctx, client);
      expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining("unknown command"));
    });

    it("rejects unrecognised arguments", async () => {
      const result = await dispatch(["login", "--foo"], createDependencies(), ctx, client);
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe("logout", () => {
    it("exits with code 0", async () => {
      const result = await dispatch(["logout"], createDependencies(), ctx, client);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("whoami", () => {
    it("is recognised (not an unknown command error)", async () => {
      await dispatch(["whoami"], createDependencies(), ctx, client);
      expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining("unknown command"));
    });
  });

  describe("logs", () => {
    it("exits when more than two arguments are provided", async () => {
      const result = await dispatch(
        ["logs", "/dir", "preview", "extra"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("too many arguments"));
    });

    it("exits when environment is not preview or production", async () => {
      const result = await dispatch(["logs", "/dir", "staging"], createDependencies(), ctx, client);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('"staging"'));
    });

    it("defaults to the preview environment when no environment argument is given", async () => {
      const requests: { environment: string }[] = [];
      const trackingLogsClient = {
        getLogs(request: { environment: string; manifest: PlatformManifest }) {
          requests.push(request);
          return Promise.resolve({
            entries: [],
            environment: request.environment,
            name: "my-app",
          });
        },
      };
      await dispatch(["logs"], createDependencies({ logsClient: trackingLogsClient }), ctx, client);
      expect(requests[0]?.environment).toBe("preview");
    });
  });

  describe("status", () => {
    it("exits when more than two arguments are provided", async () => {
      const result = await dispatch(
        ["status", "/dir", "preview", "extra"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("too many arguments"));
    });

    it("exits when environment is not preview or production", async () => {
      const result = await dispatch(
        ["status", "/dir", "staging"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('"staging"'));
    });

    it("defaults to the preview environment when no environment argument is given", async () => {
      const requests: { environment: string }[] = [];
      const trackingStatusClient = {
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
      await dispatch(
        ["status"],
        createDependencies({ statusClient: trackingStatusClient }),
        ctx,
        client,
      );
      expect(requests[0]?.environment).toBe("preview");
    });
  });

  describe("teardown", () => {
    it("exits when more than one argument is provided", async () => {
      const result = await dispatch(
        ["teardown", "/dir", "extra"],
        createDependencies(),
        ctx,
        client,
      );
      expect(result.exitCode).toBeGreaterThan(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("too many arguments"));
    });
  });
});
