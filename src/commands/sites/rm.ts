import { log } from "@clack/prompts";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { setupClient, UsageError, type SitesCommandDeps } from "./_shared.js";

export interface RmOptions {
  json: boolean;
  slug: string;
}

export async function rm(options: RmOptions, deps: SitesCommandDeps = {}): Promise<void> {
  const command = "sites rm";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    if (!options.slug || options.slug.trim().length === 0) {
      throw new UsageError("slug is required (positional argument)");
    }
    const { client, identitySource } = await setupClient(deps);

    await client.deleteSite({ slug: options.slug });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          slug: options.slug,
          deleted: true,
          identitySource,
        }),
      );
    } else {
      success(
        [
          `${options.slug} is offline. Its name is held, not freed.`,
          ``,
          `  Nobody can register this name until the hold expires — 72 hours`,
          `  unless this deployment sets SITE_RESERVATION_GRACE. After that the`,
          `  name frees itself and the files are cleaned up.`,
          ``,
          `  Changed your mind?  universe sites undelete ${options.slug}`,
        ].join("\n"),
      );
    }
  } catch (err) {
    exit(outputError({ json: options.json, command }, err, { logError: error }));
  }
}
