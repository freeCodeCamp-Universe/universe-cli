import {
  databaseOptions,
  frameworkOptions,
  packageManagerOptions,
  runtimeOptions,
  serviceOptions,
} from "./allowed-configuration.js";

const RUNTIMES = runtimeOptions().map((runtime) => [runtime]);

describe("allowed-configuration", () => {
  describe(runtimeOptions, () => {
    it("should return an array with all supported runtimes", () => {
      expect(runtimeOptions()).toStrictEqual(expect.arrayContaining(["node", "static_web"]));
    });
  });

  describe(frameworkOptions, () => {
    it.each(RUNTIMES)("should return non-empty arrays for runtime '%s'", (runtime) => {
      expect(frameworkOptions(runtime).length).toBeGreaterThan(0);
    });
  });

  describe(packageManagerOptions, () => {
    it.each(RUNTIMES)("should return non-empty arrays for runtime '%s'", (runtime) => {
      expect(packageManagerOptions(runtime).length).toBeGreaterThan(0);
    });
  });

  describe(databaseOptions, () => {
    it("should return a non-empty array for runtime 'node'", () => {
      expect(databaseOptions("node").length).toBeGreaterThan(0);
    });

    it("should return an empty array with for runtime 'static_web'", () => {
      expect(databaseOptions("static_web")).toHaveLength(0);
    });
  });

  describe(serviceOptions, () => {
    it.each(RUNTIMES)("should return non-empty arrays for runtime '%s'", (runtime) => {
      expect(serviceOptions(runtime).length).toBeGreaterThan(0);
    });
  });
});
