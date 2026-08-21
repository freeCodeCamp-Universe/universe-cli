import { resolve } from "node:path";

import { drive, silentDrive } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

import { create } from "../src/index.js";
import type { CreateDeps, Step } from "../src/index.js";

const templatesDirectory = resolve(import.meta.dirname, "fixtures/templates");

function createDependencies(): CreateDeps {
  return {
    cwd: "/tmp",
    env: { UNIVERSE_TEMPLATES_DIR: templatesDirectory },
    donationConfigWriter: { write: vi.fn(() => Promise.resolve()) },
    filesystemWriter: {
      createSymlinks: vi.fn(() => Promise.resolve()),
      writeProject: vi.fn(() => Promise.resolve()),
    },
    packageManager: { specifyDeps: vi.fn(() => Promise.resolve()) },
    repoInitialiser: { initialise: vi.fn(() => Promise.resolve()) },
    skillInstaller: { installSkills: vi.fn(() => Promise.resolve()) },
  };
}

describe("create", () => {
  it("supports non-interactive invocation through the package API", async () => {
    const result = await silentDrive(
      create(
        {
          framework: "typescript",
          name: "package-create-test",
          packageManager: "pnpm",
          runtime: "node",
          yes: true,
        },
        createDependencies(),
      ),
    );

    expect(result).toMatchObject({
      data: {
        command: "create",
        framework: "typescript",
        name: "package-create-test",
        runtime: "node",
        success: true,
      },
      format: expect.stringContaining("package-create-test"),
    });
  });

  it("supports interactive invocation without CLI lifecycle policy", async () => {
    const responses: Record<string, string | string[]> = {
      databases: [],
      framework: "typescript",
      name: "interactive-create-test",
      packageManager: "pnpm",
      runtime: "node",
      services: [],
    };

    const result = await drive(
      create({}, createDependencies()),
      (step: Step) => Promise.resolve("field" in step ? responses[step.field] : undefined),
      () => undefined,
    );

    expect(result.data).toMatchObject({
      command: "create",
      name: "interactive-create-test",
      success: true,
    });
  });
});
