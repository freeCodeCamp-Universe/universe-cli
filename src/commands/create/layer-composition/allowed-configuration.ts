import type { Framework, PackageManager, PackageManagerOption, Runtime } from "./schemas/layers.js";

const runtimeOptions = (runtimeData: Runtime) => Object.keys(runtimeData);
const frameworkOptions = (runtimeData: Runtime, runtime: string) => runtimeData[runtime].frameworks;
const packageManagerOptions = (runtimeData: Runtime, runtime: string) =>
  runtimeData[runtime].packageManagers;
const databaseOptions = (runtimeData: Runtime, runtime: string) => runtimeData[runtime].databases;
const serviceOptions = (runtimeData: Runtime, runtime: string) => runtimeData[runtime].services;

const recommendedRuntimeOptions = (runtimeData: Runtime): string[] =>
  Object.entries(runtimeData)
    .filter(([, entry]) => entry.recommended !== false)
    .map(([key]) => key);

const recommendedFrameworkOptions = (
  runtimeData: Runtime,
  runtime: string,
  frameworks: Framework,
): string[] =>
  runtimeData[runtime].frameworks.filter((f) => frameworks[f]?.recommended !== false);

const recommendedPackageManagerOptions = (
  runtimeData: Runtime,
  runtime: string,
  packageManagers: PackageManager,
): string[] =>
  runtimeData[runtime].packageManagers.filter(
    (pm) => packageManagers[pm as PackageManagerOption]?.recommended !== false,
  );

interface RuntimeCombinations {
  databases: string[];
  frameworks: string[];
  packageManagers: string[];
  platformServices: string[];
}

export {
  databaseOptions,
  frameworkOptions,
  packageManagerOptions,
  recommendedFrameworkOptions,
  recommendedPackageManagerOptions,
  recommendedRuntimeOptions,
  runtimeOptions,
  serviceOptions,
};
export type { RuntimeCombinations };
