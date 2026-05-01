import type { PlatformManifestGenerator } from "../../services/platform-manifest-service.js";
import type { ProjectReaderPort } from "../../io/project-reader.port.js";
import type { RegistrationClient } from "../../platform/registration-client.port.js";
import type { Logger } from "../../output/logger.js";
import type { HandlerResult } from "../create/index.js";
import { readAndValidateManifest } from "../../services/platform-manifest-service.js";

export const handleRegister = async (
  { projectDirectory }: { projectDirectory: string },
  deps: {
    logger: Logger;
    platformManifestGenerator: PlatformManifestGenerator;
    projectReader: ProjectReaderPort;
    registrationClient: RegistrationClient;
  },
): Promise<HandlerResult> => {
  const { logger } = deps;
  const manifest = await readAndValidateManifest(projectDirectory, deps);
  const receipt = await deps.registrationClient.register(manifest);

  logger.success(
    `Registered project "${receipt.name}". Registration ID: ${receipt.registrationId}`,
  );

  return {
    exitCode: 0,
    meta: { name: receipt.name },
  };
};
