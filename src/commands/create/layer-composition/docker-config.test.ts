import { parse as parseYaml } from "yaml";
import { buildComposeDevYaml } from "./docker-config.js";
import type { FrameworkLayerData, PackageManagerLayerData } from "./schemas/layers.js";

const framework: FrameworkLayerData = {
  devCopySource: "COPY src/ ./src/",
  files: {},
  port: 3000,
  watchSync: [{ path: "./src", target: "/app/src" }],
};

const packageManager: PackageManagerLayerData = {
  devCmd: ["pnpm", "run", "dev"],
  files: {},
  lockfile: "pnpm-lock.yaml",
  manifests: ["package.json"],
  pmInstall: "RUN corepack enable pnpm",
};

const parseResult = (f: FrameworkLayerData, pm: PackageManagerLayerData) => {
  const yaml = parseYaml(buildComposeDevYaml(f, pm)) as Record<string, unknown>;
  const app = (yaml["services"] as Record<string, unknown>)["app"] as Record<string, unknown>;
  return app;
};

describe(buildComposeDevYaml, () => {
  it("sets build context to ./", () => {
    const app = parseResult(framework, packageManager);
    expect((app["build"] as Record<string, unknown>)["context"]).toBe("./");
  });

  it("sets build target to dev", () => {
    const app = parseResult(framework, packageManager);
    expect((app["build"] as Record<string, unknown>)["target"]).toBe("dev");
  });

  it("sets ports to [<port>:<port>]", () => {
    const app = parseResult(framework, packageManager);
    expect(app["ports"]).toStrictEqual(["3000:3000"]);
  });

  it("uses port from the framework", () => {
    const reactFramework: FrameworkLayerData = { ...framework, port: 5173 };
    const app = parseResult(reactFramework, packageManager);
    expect(app["ports"]).toStrictEqual(["5173:5173"]);
  });

  it("includes sync watch entries from framework.watchSync", () => {
    const app = parseResult(framework, packageManager);
    const watch = (app["develop"] as Record<string, unknown>)["watch"] as Record<string, unknown>[];
    const syncEntries = watch.filter((e) => e["action"] === "sync");
    expect(syncEntries).toStrictEqual([{ action: "sync", path: "./src", target: "/app/src" }]);
  });

  it("includes rebuild watch entries from packageManager.watchRebuild", () => {
    const app = parseResult(framework, packageManager);
    const watch = (app["develop"] as Record<string, unknown>)["watch"] as Record<string, unknown>[];
    const rebuildEntries = watch.filter((e) => e["action"] === "rebuild");
    expect(rebuildEntries).toStrictEqual([
      { action: "rebuild", path: "./package.json" },
      { action: "rebuild", path: "./pnpm-lock.yaml" },
    ]);
  });
});
