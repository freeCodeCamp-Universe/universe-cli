import { describe, expect, it } from "vitest";
import type { CreateSelections } from "../../../../src/commands/create/prompt/prompt.port.js";
import { resolveOrderedLayers } from "../../../../src/commands/create/layer-composition/resolve-ordered-layers.js";
import type { LayerRegistry } from "../../../../src/commands/create/layer-composition/resolve-ordered-layers.js";

// ---------------------------------------------------------------------------
// Minimal registry — empty files; only layer existence matters here
// ---------------------------------------------------------------------------

const minimalRegistry: LayerRegistry = {
  always: { always: { files: {}, symlinks: {} } },
  frameworks: {
    express: { devCopySource: "", files: {}, port: 3000, symlinks: {}, watchSync: [] },
    "html-css-js": { devCopySource: "", files: {}, port: 3000, symlinks: {}, watchSync: [] },
    typescript: { devCopySource: "", files: {}, port: 3000, symlinks: {}, watchSync: [] },
  },
  "package-managers": {
    bun: {
      devCmd: [],
      files: {},
      lockfile: "bun.lock",
      manifests: [],
      pmInstall: "",
      pmVersion: "0.0.0",
      symlinks: {},
    },
    pnpm: {
      devCmd: [],
      files: {},
      lockfile: "pnpm-lock.yaml",
      manifests: [],
      pmInstall: "",
      pmVersion: "0.0.0",
      symlinks: {},
    },
  },
  runtime: {
    node: {
      baseImage: "",
      databases: [],
      files: {},
      frameworks: [],
      packageManagers: [],
      services: [],
      symlinks: {},
    },
    static_web: {
      baseImage: "",
      databases: [],
      files: {},
      frameworks: [],
      packageManagers: [],
      services: [],
      symlinks: {},
    },
  },
  services: {
    analytics: { files: {}, symlinks: {} },
    auth: { files: {}, symlinks: {} },
    email: { files: {}, symlinks: {} },
    postgresql: { files: {}, symlinks: {} },
    redis: { files: {}, symlinks: {} },
  },
};

// ---------------------------------------------------------------------------
// Combination coverage helpers
// ---------------------------------------------------------------------------

const NODE_DATABASES = ["postgresql", "redis"] as const;
const NODE_SERVICES = ["auth", "email", "analytics"] as const;
const NODE_FRAMEWORKS = ["express", "typescript"] as const;
const NODE_PACKAGE_MANAGERS = ["pnpm", "bun"] as const;

const buildPowerSet = <T>(items: readonly T[]): T[][] => {
  const subsets: T[][] = [[]];

  for (const item of items) {
    const existing = [...subsets];

    for (const subset of existing) {
      subsets.push([...subset, item]);
    }
  }

  return subsets;
};

const toMultiSelect = <T extends string>(items: T[]): T[] =>
  items.length === 0 ? [] : [...items].sort();

const expectedNodeLayerNames = ({
  databases,
  framework,
  packageManager,
  platformServices,
}: {
  databases: CreateSelections["databases"];
  framework: (typeof NODE_FRAMEWORKS)[number];
  packageManager: (typeof NODE_PACKAGE_MANAGERS)[number];
  platformServices: CreateSelections["platformServices"];
}): string[] => [
  "always",
  "runtime/node",
  `package-managers/${packageManager}`,
  `frameworks/${framework}`,
  ...databases.map((v) => `services/${v}`),
  ...platformServices.map((v) => `services/${v}`),
];

interface NodeCase {
  databases: CreateSelections["databases"];
  databaseLabel: string;
  framework: (typeof NODE_FRAMEWORKS)[number];
  packageManager: (typeof NODE_PACKAGE_MANAGERS)[number];
  platformServices: CreateSelections["platformServices"];
  serviceLabel: string;
}

const databaseSubsets = buildPowerSet(NODE_DATABASES).map((s) => toMultiSelect([...s]));
const serviceSubsets = buildPowerSet(NODE_SERVICES).map((s) => toMultiSelect([...s]));

const nodeCombinations: NodeCase[] = NODE_PACKAGE_MANAGERS.flatMap((packageManager) =>
  NODE_FRAMEWORKS.flatMap((framework) =>
    databaseSubsets.flatMap((databases) =>
      serviceSubsets.map((platformServices) => ({
        databaseLabel: databases.join(","),
        databases,
        framework,
        packageManager,
        platformServices,
        serviceLabel: platformServices.join(","),
      })),
    ),
  ),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe(resolveOrderedLayers, () => {
  it("resolves node layers in stage order preserving input order for services", () => {
    const result = resolveOrderedLayers(
      {
        databases: ["redis", "postgresql"],
        framework: "express",
        name: "hello-universe",
        packageManager: "pnpm",
        platformServices: ["email", "auth"],
        runtime: "node",
      },
      minimalRegistry,
    );

    expect(result.map((layer) => layer.name)).toStrictEqual([
      "always",
      "runtime/node",
      "package-managers/pnpm",
      "frameworks/express",
      "services/redis",
      "services/postgresql",
      "services/email",
      "services/auth",
    ]);
  });

  it("resolves bun as the package manager layer", () => {
    const result = resolveOrderedLayers(
      {
        databases: [],
        framework: "express",
        name: "test",
        packageManager: "bun",
        platformServices: [],
        runtime: "node",
      },
      minimalRegistry,
    );

    expect(result.map((l) => l.name)).toStrictEqual([
      "always",
      "runtime/node",
      "package-managers/bun",
      "frameworks/express",
    ]);
  });

  it("resolves static_web runtime to always, runtime/static_web, package-managers/pnpm, and frameworks/html-css-js", () => {
    const result = resolveOrderedLayers(
      {
        databases: [],
        framework: "html-css-js",
        name: "test",
        packageManager: "pnpm",
        platformServices: [],
        runtime: "static_web",
      },
      minimalRegistry,
    );

    expect(result.map((l) => l.name)).toStrictEqual([
      "always",
      "runtime/static_web",
      "package-managers/pnpm",
      "frameworks/html-css-js",
    ]);
  });

  it.each(nodeCombinations)(
    "resolves Node.js + $framework + $packageManager + db:[$databaseLabel] + svc:[$serviceLabel]",
    ({ framework, packageManager, databases, platformServices }) => {
      const result = resolveOrderedLayers(
        {
          databases,
          framework,
          name: "test",
          packageManager,
          platformServices,
          runtime: "node",
        },
        minimalRegistry,
      );

      expect(result.map((l) => l.name)).toStrictEqual(
        expectedNodeLayerNames({ databases, framework, packageManager, platformServices }),
      );
    },
  );
});
