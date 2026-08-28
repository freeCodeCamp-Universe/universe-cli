import { log } from "@clack/prompts";
import { ProxyError, wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { setupClient, UsageError, type SitesCommandDeps } from "./_shared.js";

export interface UndeleteOptions {
  json: boolean;
  slug: string;
}

export async function undelete(
  options: UndeleteOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const command = "sites undelete";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    if (!options.slug || options.slug.trim().length === 0) {
      throw new UsageError("slug is required (positional argument)");
    }
    const { client, identitySource } = await setupClient(deps);

    const result = await client.undeleteSite({ slug: options.slug });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          slug: result.slug,
          prevProduction: result.prevProduction,
          prevPreview: result.prevPreview,
          identitySource,
        }),
      );
    } else {
      success(
        [
          `Restored ${result.slug}`,
          ``,
          `  production  ${result.prevProduction || "(none)"}`,
          `  preview     ${result.prevPreview || "(none)"}`,
          ``,
          `  The site is serving again at these deploys. The server returns`,
          `  these two pointers once and then forgets them, so keep this output`,
          `  if you need to audit what was restored.`,
        ].join("\n"),
      );
    }
  } catch (err) {
    const { code, message } = wrapProxyError(command, err);
    const hinted =
      err instanceof ProxyError && err.status === 404
        ? `${message}\n  hint: the hold may have expired, or the slug may be wrong. Run \`universe sites list --held\` to see the names still recoverable.`
        : message;
    outputError({ json: options.json, command }, code, hinted, {
      logError: error,
    });
    exit(code);
  }
}
