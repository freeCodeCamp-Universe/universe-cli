import { log } from "@clack/prompts";
import { type SiteRow } from "../../lib/proxy-client.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { setupClient, type SitesCommandDeps, type SitesSdkDeps } from "./_shared.js";

interface SitesLsOptions {
  mine?: boolean;
}

interface SitesLsHandlerOptions {
  json: boolean;
  mine?: boolean;
}

function formatTable(rows: SiteRow[]): string {
  if (rows.length === 0) return "No registered sites.";
  const headers = ["SLUG", "TEAMS", "CREATED BY", "CREATED AT"];
  const cells: string[][] = rows.map((r) => [r.slug, r.teams.join(","), r.createdBy, r.createdAt]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]): string => row.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(headers), ...cells.map(fmt)].join("\n");
}

/** List registered sites. Pass `mine: true` to filter to the caller's authorized sites. */
async function sitesLs(
  options: SitesLsOptions,
  deps: SitesSdkDeps = {},
): Promise<CommandResult> {
  const { client, identitySource } = await setupClient(deps);
  let rows = await client.listSites();
  let scope: "all" | "mine" = "all";

  if (options.mine) {
    const me = await client.whoami();
    const allowed = new Set(me.authorizedSites);
    rows = rows.filter((r) => allowed.has(r.slug));
    scope = "mine";
  }

  const format = formatTable(rows);

  return {
    data: buildEnvelope("sites ls", true, {
      count: rows.length,
      scope,
      sites: rows,
      identitySource,
    }),
    format,
  };
}

async function sitesLsHandler(
  options: SitesLsHandlerOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await sitesLs(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "sites ls" }, err, { logError: error }));
  }
}

export { sitesLs, sitesLsHandler };
export type { SitesLsOptions, SitesLsHandlerOptions };
