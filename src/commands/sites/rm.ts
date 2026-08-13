import { log } from "@clack/prompts";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { setupClient, UsageError, type SitesCommandDeps, type SitesSdkDeps } from "./_shared.js";

interface SitesRmOptions {
  slug: string;
}

interface SitesRmHandlerOptions {
  json: boolean;
  slug: string;
}

/** Soft-delete a site from the proxy registry. */
async function sitesRm(
  options: SitesRmOptions,
  deps: SitesSdkDeps = {},
): Promise<CommandResult> {
  if (!options.slug || options.slug.trim().length === 0) {
    throw new UsageError("slug is required (positional argument)");
  }
  const { client, identitySource } = await setupClient(deps);

  await client.deleteSite({ slug: options.slug });

  const format = [
    `Deleted ${options.slug}`,
    ``,
    `  Note: R2 deploy bytes are NOT removed; they age out via the`,
    `        post-GA cleanup cron.`,
  ].join("\n");

  return {
    data: buildEnvelope("sites rm", true, {
      slug: options.slug,
      deleted: true,
      identitySource,
    }),
    format,
  };
}

async function sitesRmHandler(
  options: SitesRmHandlerOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await sitesRm(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "sites rm" }, err, { logError: error }));
  }
}

export { sitesRm, sitesRmHandler };
export type { SitesRmOptions, SitesRmHandlerOptions };
