import { describe, expect, it } from "vitest";
import { PackageManagerSchema } from "../../../../../src/commands/create/layer-composition/schemas/layers.js";

const layer = (pmVersion: string) => ({
  devCmd: ["run", "dev"],
  files: {},
  lockfile: "lock",
  manifests: ["package.json"],
  pmInstall: "RUN install@{{pmVersion}}",
  pmVersion,
});

const validPackageManager = (pmVersion: string) => ({
  bun: layer(pmVersion),
  pnpm: layer(pmVersion),
});

describe("PackageManagerSchema", () => {
  it.each(["1.2.3", "0.0.0", "10.12.1"])("accepts semver version %s", (version) => {
    expect(() => PackageManagerSchema.parse(validPackageManager(version))).not.toThrow();
  });

  it.each(["9", "9.0", "^9.0.0", "9.0.0-beta.1", "v9.0.0", "latest", ""])(
    "rejects non-semver version %s",
    (version) => {
      expect(() => PackageManagerSchema.parse(validPackageManager(version))).toThrow(
        /major\.minor\.patch/,
      );
    },
  );
});
