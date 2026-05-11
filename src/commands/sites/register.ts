import { log } from "@clack/prompts";
import { wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope, buildErrorEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import {
  emitJson,
  parseTeamsFlag,
  setupClient,
  UsageError,
  type SitesCommandDeps,
} from "./_shared.js";

export interface RegisterOptions {
  json: boolean;
  slug: string;
  /** `--team=staff` or `--team=staff,news-editors`. Optional — server
   * defaults to `[RegistryAuthzTeam]` (which is `staff`) when omitted. */
  team?: string | string[];
}

export async function register(
  options: RegisterOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const command = "sites register";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    if (!options.slug || options.slug.trim().length === 0) {
      throw new UsageError("slug is required (positional argument)");
    }
    const teams = parseTeamsFlag(options.team);
    const { client } = await setupClient(deps);

    const row = await client.registerSite({
      slug: options.slug,
      teams: teams.length > 0 ? teams : undefined,
    });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          slug: row.slug,
          teams: row.teams,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
        }),
      );
    } else {
      success(
        [
          `Registered ${row.slug}`,
          ``,
          `  Slug:        ${row.slug}`,
          `  Teams:       ${row.teams.join(", ")}`,
          `  Created by:  ${row.createdBy}`,
          `  Created at:  ${row.createdAt}`,
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
