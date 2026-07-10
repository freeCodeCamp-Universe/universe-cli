import { describe, expect, it } from "vitest";
import {
  databaseOptions,
  frameworkOptions,
  packageManagerOptions,
  runtimeOptions,
  serviceOptions,
} from "../../../../src/commands/create/layer-composition/allowed-configuration.js";
import { RuntimeSchema } from "../../../../src/commands/create/layer-composition/schemas/layers.js";
import runtimeFixture from "../../../fixtures/templates/layers/runtime.json";

const runtimeData = RuntimeSchema.parse(runtimeFixture);
const RUNTIMES = runtimeOptions(runtimeData).map((runtime) => [runtime]);

describe("allowed-configuration", () => {
  describe(runtimeOptions, () => {
    it("should return an array with all supported runtimes", () => {
      expect(runtimeOptions(runtimeData)).toStrictEqual(
        expect.arrayContaining(["node", "static_web"]),
      );
    });
  });

  describe(frameworkOptions, () => {
    it.each(RUNTIMES)("should return non-empty arrays for runtime '%s'", (runtime) => {
      expect(frameworkOptions(runtimeData, runtime).length).toBeGreaterThan(0);
    });
  });

  describe(packageManagerOptions, () => {
    it.each(RUNTIMES)("should return non-empty arrays for runtime '%s'", (runtime) => {
      expect(packageManagerOptions(runtimeData, runtime).length).toBeGreaterThan(0);
    });
  });

  describe(databaseOptions, () => {
    it("should return a non-empty array for runtime 'node'", () => {
      expect(databaseOptions(runtimeData, "node").length).toBeGreaterThan(0);
    });

    it("should return an empty array with for runtime 'static_web'", () => {
      expect(databaseOptions(runtimeData, "static_web")).toHaveLength(0);
    });
  });

  describe(serviceOptions, () => {
    it.each(RUNTIMES)("should return non-empty arrays for runtime '%s'", (runtime) => {
      expect(serviceOptions(runtimeData, runtime).length).toBeGreaterThan(0);
    });
  });
});
