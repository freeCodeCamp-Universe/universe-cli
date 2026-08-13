import { log } from "@clack/prompts";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { parseTeamsFlag, setupClient, UsageError, type SitesCommandDeps, type SitesSdkDeps } from "./_shared.js";

interface SitesUpdateOptions {
  slug: string;
  /** `--team=staff` or `--team=staff,news-editors`. REQUIRED — server
   * rejects empty teams with 400; CLI rejects with EXIT_USAGE first
   * for fast feedback. */
  team?: string | string[];
}

interface SitesUpdateHandlerOptions {
  json: boolean;
  slug: string;
  team?: string | string[];
}

/** Update a site's team membership in the proxy registry. */
async function sitesUpdate(
  options: SitesUpdateOptions,
  deps: SitesSdkDeps = {},
): Promise<CommandResult> {
  if (!options.slug || options.slug.trim().length === 0) {
    throw new UsageError("slug is required (positional argument)");
  }
  const teams = parseTeamsFlag(options.team);
  if (teams.length === 0) {
    throw new UsageError(
      "--team is required with at least one slug; use `sites rm` to remove a site",
    );
  }
  const { client, identitySource } = await setupClient(deps);

  const row = await client.updateSite({
    slug: options.slug,
    teams,
  });

  const format = [
    `Updated ${row.slug}`,
    ``,
    `  Slug:        ${row.slug}`,
    `  Teams:       ${row.teams.join(", ")}`,
    `  Updated at:  ${row.updatedAt}`,
  ].join("\n");

  return {
    data: buildEnvelope("sites update", true, {
      slug: row.slug,
      teams: row.teams,
      updatedAt: row.updatedAt,
      identitySource,
    }),
    format,
  };
}

async function sitesUpdateHandler(
  options: SitesUpdateHandlerOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await sitesUpdate(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "sites update" }, err, { logError: error }));
  }
}

export { sitesUpdate, sitesUpdateHandler };
export type { SitesUpdateOptions, SitesUpdateHandlerOptions };
