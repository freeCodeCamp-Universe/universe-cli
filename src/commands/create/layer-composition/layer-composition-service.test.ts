import type { CreateSelections } from "../prompt/prompt.port.js";
import { LayerCompositionService } from "./layer-composition-service.js";

describe(LayerCompositionService, () => {
  const service = new LayerCompositionService();

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

  it("emits a Dockerfile for node + express + pnpm", () => {
    const result = service.resolveLayers(nodeExpressSelection);

    expect(result.files["Dockerfile"]).toBeDefined();
    expect(result.files["Dockerfile"]).toContain("FROM node:22-alpine AS base");
    expect(result.files["Dockerfile"]).toContain("FROM package-manager AS dev");
    expect(result.files["Dockerfile"]).toContain('CMD ["pnpm","run","dev"]');
  });

  it("derives devInstall from manifests and lockfile for pnpm", () => {
    const result = service.resolveLayers(nodeExpressSelection);
    expect(result.files["Dockerfile"]).toContain("COPY package.json pnpm-lock.yaml ./");
    expect(result.files["Dockerfile"]).toContain("RUN pnpm install");
  });

  it("derives devInstall from manifests and lockfile for bun", () => {
    const result = service.resolveLayers({ ...nodeExpressSelection, packageManager: "bun" });
    expect(result.files["Dockerfile"]).toContain("COPY package.json bun.lock ./");
    expect(result.files["Dockerfile"]).toContain("RUN bun install");
  });

  it("emits a docker-compose.dev.yml for node + express + pnpm", () => {
    const result = service.resolveLayers(nodeExpressSelection);

    expect(result.files["docker-compose.dev.yml"]).toBeDefined();
    expect(result.files["docker-compose.dev.yml"]).toContain("3000:3000");
    expect(result.files["docker-compose.dev.yml"]).toContain("target: dev");
  });

  it("emits a Dockerfile for node + typescript + pnpm", () => {
    const result = service.resolveLayers({
      ...nodeExpressSelection,
      framework: "typescript",
    });

    expect(result.files["Dockerfile"]).toBeDefined();
    expect(result.files["Dockerfile"]).toContain("FROM node:22-alpine AS base");
    expect(result.files["Dockerfile"]).toContain('CMD ["pnpm","run","dev"]');
  });

  it("emits a docker-compose.dev.yml for node + typescript + pnpm", () => {
    const result = service.resolveLayers({
      ...nodeExpressSelection,
      framework: "typescript",
    });

    expect(result.files["docker-compose.dev.yml"]).toBeDefined();
    expect(result.files["docker-compose.dev.yml"]).toContain("3000:3000");
  });

  it("emits a .dockerignore containing node_modules for node scaffold", () => {
    const result = service.resolveLayers(nodeExpressSelection);

    expect(result.files[".dockerignore"]).toContain("node_modules");
  });

  it("emits pnpm-workspace.yaml for node + pnpm", () => {
    const result = service.resolveLayers(nodeExpressSelection);

    expect(result.files["pnpm-workspace.yaml"]).toBeDefined();
  });

  it("emits pnpm-workspace.yaml for static + pnpm scaffold", () => {
    const result = service.resolveLayers(staticSelection);

    expect(result.files["pnpm-workspace.yaml"]).toBeDefined();
  });

  it("emits Dockerfile, .dockerignore, and docker-compose.dev.yml for static scaffold", () => {
    const result = service.resolveLayers(staticSelection);

    expect(result.files["Dockerfile"]).toBeDefined();
    expect(result.files[".dockerignore"]).toBeDefined();
    expect(result.files["docker-compose.dev.yml"]).toBeDefined();
  });

  it("emits a client folder for the tanstack-shadcn framework", () => {
    const result = service.resolveLayers({
      ...staticSelection,
      framework: "tanstack-shadcn",
    });

    expect(result.files["client/app.tsx"]).toBeDefined();
  });
});
