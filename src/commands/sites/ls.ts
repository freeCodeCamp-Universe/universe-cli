import { log } from "@clack/prompts";
import { wrapProxyError, type SiteRow } from "../../lib/proxy-client.js";
import { buildEnvelope, buildErrorEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, setupClient, type SitesCommandDeps } from "./_shared.js";

export interface SitesLsOptions {
  json: boolean;
}

function formatTable(rows: SiteRow[]): string {
  if (rows.length === 0) return "No registered sites.";
  const headers = ["SLUG", "TEAMS", "CREATED BY", "CREATED AT"];
  const cells: string[][] = rows.map((r) => [
    r.slug,
    r.teams.join(","),
    r.createdBy,
    r.createdAt,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]): string =>
    row.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(headers), ...cells.map(fmt)].join("\n");
}

export async function ls(
  options: SitesLsOptions,
  deps: SitesCommandDeps = {},
): Promise<void> {
  const command = "sites ls";
  const success = deps.logSuccess ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const { client } = await setupClient(deps);
    const rows = await client.listSites();

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          count: rows.length,
          sites: rows,
        }),
      );
    } else {
      success(formatTable(rows));
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
