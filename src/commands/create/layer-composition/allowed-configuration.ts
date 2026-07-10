import type { Runtime } from "./schemas/layers.js";

const runtimeOptions = (runtimeData: Runtime) => Object.keys(runtimeData);
const frameworkOptions = (runtimeData: Runtime, runtime: string) =>
  runtimeData[runtime].frameworks;
const packageManagerOptions = (runtimeData: Runtime, runtime: string) =>
  runtimeData[runtime].packageManagers;
const databaseOptions = (runtimeData: Runtime, runtime: string) =>
  runtimeData[runtime].databases;
const serviceOptions = (runtimeData: Runtime, runtime: string) =>
  runtimeData[runtime].services;

interface RuntimeCombinations {
  databases: string[];
  frameworks: string[];
  packageManagers: string[];
  platformServices: string[];
}

export {
  databaseOptions,
  frameworkOptions,
  runtimeOptions,
  packageManagerOptions,
  serviceOptions,
};
export type { RuntimeCombinations };
