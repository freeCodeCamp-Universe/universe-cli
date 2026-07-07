import type { Runtime, RuntimeOption } from "./schemas/layers.js";

const runtimeOptions = (runtimeData: Runtime) => Object.keys(runtimeData) as RuntimeOption[];
const frameworkOptions = (runtimeData: Runtime, runtime: RuntimeOption) =>
  runtimeData[runtime].frameworks;
const packageManagerOptions = (runtimeData: Runtime, runtime: RuntimeOption) =>
  runtimeData[runtime].packageManagers;
const databaseOptions = (runtimeData: Runtime, runtime: RuntimeOption) =>
  runtimeData[runtime].databases;
const serviceOptions = (runtimeData: Runtime, runtime: RuntimeOption) =>
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
