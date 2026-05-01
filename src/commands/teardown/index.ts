import type { PlatformManifestGenerator } from "../../services/platform-manifest-service.js";
import type { ProjectReaderPort } from "../../io/project-reader.port.js";
import type { TeardownClient } from "../../platform/teardown-client.port.js";
import type { Logger } from "../../output/logger.js";
import type { HandlerResult } from "../create/index.js";
import { readAndValidateManifest } from "../../services/platform-manifest-service.js";

export const handleTeardown = async (
  { projectDirectory }: { projectDirectory: string },
  deps: {
    logger: Logger;
    platformManifestGenerator: PlatformManifestGenerator;
    projectReader: ProjectReaderPort;
    teardownClient: TeardownClient;
  },
): Promise<HandlerResult> => {
  const { logger } = deps;
  const manifest = await readAndValidateManifest(projectDirectory, deps);
  const receipt = await deps.teardownClient.teardown({ manifest });

  logger.success(`Tore down project "${receipt.name}". Teardown ID: ${receipt.teardownId}`);

  return {
    exitCode: 0,
    meta: { name: receipt.name },
  };
};
