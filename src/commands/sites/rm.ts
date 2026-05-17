import { log } from "@clack/prompts";
import { wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope, buildErrorEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import {
  emitJson,
  setupClient,
  UsageError,
  type SitesCommandDeps,
} from "./_shared.js";

export interface RmOptions {
  json: boolean;
  slug: string;
}

export async function rm(
  options: RmOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
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
          `Deleted ${options.slug}`,
          ``,
          `  Note: R2 deploy bytes are NOT removed; they age out via the`,
          `        post-GA cleanup cron.`,
        ].join("\n"),
      );
    }
  } catch (err) {
    const { code, message } = wrapProxyError(command, err);
    if (options.json) {
      emitJson(buildErrorEnvelope(command, code, message));
    } else {
      error(message);
    }
    exit(code);
  }
}
