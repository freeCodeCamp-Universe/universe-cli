import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { dispatch } from "../dispatch.js";
import { createAdapterStubs } from "../integration-tests/adapter-stubs.js";
import { LocalFilesystemWriter } from "../io/local-filesystem-writer.js";
import { LocalProjectReader } from "../io/local-project-reader.js";
import { BunPackageManager } from "../commands/create/package-manager/bun-package-manager.js";
import { PackageManagerService } from "../commands/create/package-manager/package-manager.service.js";
import { PnpmPackageManager } from "../commands/create/package-manager/pnpm-package-manager.js";
import type { CreateSelections, Prompt } from "../commands/create/prompt/prompt.port.js";
import { CreateInputValidationService } from "../commands/create/create-input-validation-service.js";
import { LayerCompositionService } from "../commands/create/layer-composition/layer-composition-service.js";
import { PlatformManifestService } from "../services/platform-manifest-service.js";

const assertDockerAvailable = (): void => {
  try {
    execFileSync("docker", ["info"], { stdio: "pipe" });
  } catch {
    throw new Error("Docker engine not found, please install it before running this test.");
  }
};

const createPromptPort = (selection: CreateSelections): Prompt => ({
  promptForCreateInputs() {
    return Promise.resolve(selection);
  },
});

const pollUntilReady = (url: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  const attempt = async (): Promise<void> => {
    console.log(`Checking if service is ready at ${url}...`);
    if (Date.now() >= deadline) {
      throw new Error(`Service at ${url} did not become ready within ${timeoutMs}ms.`);
    }

    try {
      const response = await fetch(url);
      console.log(`Received response with status ${response.status} from ${url}`);
      if (response.ok) {
        return;
      }
    } catch {
      // Service not ready yet
    }

    await delay(1_000);
    return attempt();
  };

  return attempt();
};

describe("create e2e — docker", () => {
  let rootDirectory: string;

  beforeAll(() => {
    assertDockerAvailable();
  });

  beforeEach(() => {
    rootDirectory = mkdtempSync(join(tmpdir(), "universe-e2e-"));
  });

  afterEach(() => {
    rmSync(rootDirectory, { force: true, recursive: true });
  });

  it("node + express + pnpm scaffold produces a reachable container on port 3000", async () => {
    const selection: CreateSelections = {
      confirmed: true,
      databases: [],
      framework: "express",
      name: "e2e-express-app",
      packageManager: "pnpm",
      platformServices: [],
      runtime: "node",
    };

    const { observability, ...adapterStubs } = createAdapterStubs();
    const result = await dispatch(
      ["create"],
      {
        ...adapterStubs,
        filesystemWriter: new LocalFilesystemWriter(),
        layerResolver: new LayerCompositionService(),
        logger: { error: () => {}, info: () => {}, success: () => {}, warn: () => {} },
        packageManager: new PackageManagerService({
          bun: new BunPackageManager(),
          pnpm: new PnpmPackageManager(),
        }),
        platformManifestGenerator: new PlatformManifestService(),
        projectReader: new LocalProjectReader(),
        prompt: createPromptPort(selection),
        validator: new CreateInputValidationService((path) =>
          existsSync(join(rootDirectory, path)),
        ),
      },
      { cwd: rootDirectory },
      observability,
    );

    expect(result.exitCode).toBe(0);

    const projectDirectory = join(rootDirectory, selection.name);

    execFileSync("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "--build", "-d"], {
      cwd: projectDirectory,
      stdio: "inherit",
    });

    try {
      await pollUntilReady("http://localhost:3000", 10_000);

      const response = await fetch("http://localhost:3000");

      expect(response.status).toBe(200);
    } finally {
      // To help debugging, we output the compose logs.
      try {
        execFileSync("docker", ["compose", "-f", "docker-compose.dev.yml", "logs"], {
          cwd: projectDirectory,
          stdio: "inherit",
        });
      } catch {
        // Container may not have started
      }
      execFileSync("docker", ["compose", "-f", "docker-compose.dev.yml", "down"], {
        cwd: projectDirectory,
        stdio: "inherit",
      });
    }
  });

  it("static + tanstack + bun scaffold produces a reachable container on port 5173", async () => {
    const selection: CreateSelections = {
      confirmed: true,
      databases: [],
      framework: "tanstack-shadcn",
      name: "e2e-tanstack-app",
      packageManager: "bun",
      platformServices: [],
      runtime: "static_web",
    };

    const { observability, ...adapterStubs } = createAdapterStubs();
    const result = await dispatch(
      ["create"],
      {
        ...adapterStubs,
        filesystemWriter: new LocalFilesystemWriter(),
        layerResolver: new LayerCompositionService(),
        logger: { error: () => {}, info: () => {}, success: () => {}, warn: () => {} },
        packageManager: new PackageManagerService({
          bun: new BunPackageManager(),
          pnpm: new PnpmPackageManager(),
        }),
        platformManifestGenerator: new PlatformManifestService(),
        projectReader: new LocalProjectReader(),
        prompt: createPromptPort(selection),
        validator: new CreateInputValidationService((path) =>
          existsSync(join(rootDirectory, path)),
        ),
      },
      { cwd: rootDirectory },
      observability,
    );

    expect(result.exitCode).toBe(0);

    const projectDirectory = join(rootDirectory, selection.name);

    execFileSync("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "--build", "-d"], {
      cwd: projectDirectory,
      stdio: "inherit",
    });

    try {
      await pollUntilReady("http://localhost:5173", 10_000);

      const response = await fetch("http://localhost:5173");

      const body = await response.text();
      expect(body).toContain("e2e-tanstack-app");
      expect(response.status).toBe(200);
    } finally {
      // To help debugging, we output the compose logs.
      try {
        execFileSync("docker", ["compose", "-f", "docker-compose.dev.yml", "logs"], {
          cwd: projectDirectory,
          stdio: "inherit",
        });
      } catch {
        // Container may not have started
      }
      execFileSync("docker", ["compose", "-f", "docker-compose.dev.yml", "down"], {
        cwd: projectDirectory,
        stdio: "inherit",
      });
    }
  });
});
