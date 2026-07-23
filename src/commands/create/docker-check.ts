import { execFileSync } from "node:child_process";

export const isDockerAvailable = (): boolean => {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
