import runtimeData from "./layers/runtime.json" with { type: "json" };

type RuntimeData = typeof runtimeData;
type Runtime = keyof RuntimeData;

const runtimeOptions = () => Object.keys(runtimeData) as Runtime[];
const frameworkOptions = (runtime: Runtime) => runtimeData[runtime].frameworks;
const packageManagerOptions = (runtime: Runtime) => runtimeData[runtime].packageManagers;
const databaseOptions = (runtime: Runtime) => runtimeData[runtime].databases;
const serviceOptions = (runtime: Runtime) => runtimeData[runtime].services;

interface RuntimeCombinations {
  databases: string[];
  frameworks: string[];
  packageManagers: string[];
  platformServices: string[];
}

export { databaseOptions, frameworkOptions, runtimeOptions, packageManagerOptions, serviceOptions };
export type { RuntimeCombinations };
