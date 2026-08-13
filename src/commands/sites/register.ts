import { log } from "@clack/prompts";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { parseTeamsFlag, setupClient, UsageError, type SitesCommandDeps, type SitesSdkDeps } from "./_shared.js";

interface SitesRegisterOptions {
  slug: string;
  /** `--team=staff` or `--team=staff,news-editors`. Optional — server
   * defaults to `[RegistryAuthzTeam]` (which is `staff`) when omitted. */
  team?: string | string[];
}

interface SitesRegisterHandlerOptions {
  json: boolean;
  slug: string;
  team?: string | string[];
}

/** Register a new site slug in the proxy registry. */
async function sitesRegister(
  options: SitesRegisterOptions,
  deps: SitesSdkDeps = {},
): Promise<CommandResult> {
  if (!options.slug || options.slug.trim().length === 0) {
    throw new UsageError("slug is required (positional argument)");
  }
  const teams = parseTeamsFlag(options.team);
  const { client, identitySource } = await setupClient(deps);

  const row = await client.registerSite({
    slug: options.slug,
    teams: teams.length > 0 ? teams : undefined,
  });

  const format = [
    `Registered ${row.slug}`,
    ``,
    `  Slug:        ${row.slug}`,
    `  Teams:       ${row.teams.join(", ")}`,
    `  Created by:  ${row.createdBy}`,
    `  Created at:  ${row.createdAt}`,
  ].join("\n");

  return {
    data: buildEnvelope("sites register", true, {
      slug: row.slug,
      teams: row.teams,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      identitySource,
    }),
    format,
  };
}

async function sitesRegisterHandler(
  options: SitesRegisterHandlerOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await sitesRegister(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "sites register" }, err, { logError: error }));
  }
}

export { sitesRegister, sitesRegisterHandler };
export type { SitesRegisterOptions, SitesRegisterHandlerOptions };
