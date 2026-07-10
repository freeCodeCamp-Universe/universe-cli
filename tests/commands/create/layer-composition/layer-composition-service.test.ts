import { describe, expect, it } from "vitest";
import type { CreateSelections } from "../../../../src/commands/create/prompt/prompt.port.js";
import { LayerCompositionService } from "../../../../src/commands/create/layer-composition/layer-composition-service.js";
import type { TemplateProvider } from "../../../../src/commands/create/layer-composition/template-provider.js";
import { RemoteTemplateProvider } from "../../../../src/commands/create/layer-composition/template-provider.js";
import { resolve } from "node:path";

const FIXTURES_DIR = resolve("tests/fixtures/templates");

const fixtureProvider: TemplateProvider = new RemoteTemplateProvider(() => ({
  UNIVERSE_TEMPLATES_DIR: FIXTURES_DIR,
}));

describe(LayerCompositionService, () => {
  const service = new LayerCompositionService(fixtureProvider);

  const nodeExpressSelection: CreateSelections = {
    confirmed: true,
    databases: [],
    framework: "express",
    name: "test",
    packageManager: "pnpm",
    platformServices: [],
    runtime: "node",
  };

  const staticSelection: CreateSelections = {
    confirmed: true,
    databases: [],
    framework: "html-css-js",
    name: "test",
    packageManager: "pnpm",
    platformServices: [],
    runtime: "static_web",
  };

  it("emits a Dockerfile for node + express + pnpm", async () => {
    const result = await service.resolveLayers(nodeExpressSelection);

    expect(result.files["Dockerfile"]).toBeDefined();
    expect(result.files["Dockerfile"]).toContain("FROM node:24-slim AS base");
    expect(result.files["Dockerfile"]).toContain("FROM package-manager AS dev");
    expect(result.files["Dockerfile"]).toContain('CMD ["pnpm"]');
  });

  it("derives devInstall from manifests and lockfile for pnpm", async () => {
    const result = await service.resolveLayers(nodeExpressSelection);
    expect(result.files["Dockerfile"]).toContain("COPY package.json pnpm-lock.yaml ./");
    expect(result.files["Dockerfile"]).toContain("RUN pnpm install");
  });

  it("derives devInstall from manifests and lockfile for bun", async () => {
    const result = await service.resolveLayers({
      ...nodeExpressSelection,
      packageManager: "bun",
    });
    expect(result.files["Dockerfile"]).toContain("COPY package.json bun.lockb ./");
    expect(result.files["Dockerfile"]).toContain("RUN bun install");
  });

  it("emits a docker-compose.dev.yml for node + express + pnpm", async () => {
    const result = await service.resolveLayers(nodeExpressSelection);

    expect(result.files["docker-compose.dev.yml"]).toBeDefined();
    expect(result.files["docker-compose.dev.yml"]).toContain("3000:3000");
    expect(result.files["docker-compose.dev.yml"]).toContain("target: dev");
  });

  it("emits a Dockerfile for node + typescript + pnpm", async () => {
    const result = await service.resolveLayers({
      ...nodeExpressSelection,
      framework: "typescript",
    });

    expect(result.files["Dockerfile"]).toBeDefined();
    expect(result.files["Dockerfile"]).toContain("FROM node:24-slim AS base");
    expect(result.files["Dockerfile"]).toContain('CMD ["pnpm"]');
  });

  it("emits a docker-compose.dev.yml for node + typescript + pnpm", async () => {
    const result = await service.resolveLayers({
      ...nodeExpressSelection,
      framework: "typescript",
    });

    expect(result.files["docker-compose.dev.yml"]).toBeDefined();
    expect(result.files["docker-compose.dev.yml"]).toContain("3000:3000");
  });

  it("emits a .dockerignore for node scaffold", async () => {
    const result = await service.resolveLayers(nodeExpressSelection);

    expect(result.files[".dockerignore"]).toBeDefined();
  });

  it("emits a Dockerfile and docker-compose.dev.yml for static scaffold", async () => {
    const result = await service.resolveLayers(staticSelection);

    expect(result.files["Dockerfile"]).toBeDefined();
    expect(result.files[".dockerignore"]).toBeDefined();
    expect(result.files["docker-compose.dev.yml"]).toBeDefined();
  });
});
