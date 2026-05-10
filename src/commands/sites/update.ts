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

export interface UpdateOptions {
  json: boolean;
  slug: string;
  /** `--team=staff` or `--team=staff,news-editors`. REQUIRED — server
   * rejects empty teams with 400; CLI rejects with EXIT_USAGE first
   * for fast feedback. */
  team?: string | string[];
}

export async function update(
  options: UpdateOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const command = "sites update";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    if (!options.slug || options.slug.trim().length === 0) {
      throw new UsageError("slug is required (positional argument)");
    }
    const teams = parseTeamsFlag(options.team);
    if (teams.length === 0) {
      throw new UsageError(
        "--team is required with at least one slug; use `sites rm` to remove a site",
      );
    }
    const { client } = await setupClient(deps);

    const row = await client.updateSite({
      slug: options.slug,
      teams,
    });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          slug: row.slug,
          teams: row.teams,
          updatedAt: row.updatedAt,
        }),
      );
    } else {
      success(
        [
          `Updated ${row.slug}`,
          ``,
          `  Slug:        ${row.slug}`,
          `  Teams:       ${row.teams.join(", ")}`,
          `  Updated at:  ${row.updatedAt}`,
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
    exit(code, message);
  }
}
