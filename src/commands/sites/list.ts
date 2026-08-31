import { log } from "@clack/prompts";
import { heldFilterUnanswered, type SiteRow } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { setupClient, UsageError, type SitesCommandDeps } from "./_shared.js";

export interface SitesListOptions {
  json: boolean;
  /** When true, intersect the registry with the caller's authorized sites. */
  mine?: boolean;
  held?: boolean;
}

function formatTable(rows: SiteRow[], held = false): string {
  if (rows.length === 0) return held ? "No names are held by a delete." : "No registered sites.";
  const anyState = rows.some((r) => r.state !== undefined && r.state !== "active");
  const headers = anyState
    ? ["SLUG", "TEAMS", "CREATED BY", "CREATED AT", "STATE", "HELD UNTIL"]
    : ["SLUG", "TEAMS", "CREATED BY", "CREATED AT"];
  const cells: string[][] = rows.map((r) => {
    const base = [r.slug, r.teams.join(","), r.createdBy, r.createdAt];
    return anyState ? [...base, r.state ?? "", r.reservedUntil ?? ""] : base;
  });
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]): string => row.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(headers), ...cells.map(fmt)].join("\n");
}

export async function list(options: SitesListOptions, deps: SitesCommandDeps = {}): Promise<void> {
  const command = "sites list";
  const success = deps.logSuccess ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    if (options.held && options.mine) {
      throw new UsageError(
        "--held cannot combine with --mine: the authorized-site cache never carries held names",
      );
    }
    const { client, identitySource } = await setupClient(deps);

    let rows = await client.listSites(options.held ? { state: "reserved" } : undefined);
    let scope: "all" | "mine" | "held" = options.held ? "held" : "all";

    if (options.held && rows.length > 0 && heldFilterUnanswered(rows)) {
      throw new UsageError(
        "this artemis did not filter the list, so --held cannot be answered; the ?state= filter needs 1.10.2 or newer",
      );
    }

    if (options.mine) {
      const me = await client.whoami();
      const allowed = new Set(me.authorizedSites);
      rows = rows.filter((r) => allowed.has(r.slug));
      scope = "mine";
    }

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          count: rows.length,
          scope,
          sites: rows,
          identitySource,
        }),
      );
    } else {
      success(formatTable(rows, options.held ?? false));
    }
  } catch (err) {
    exit(outputError({ json: options.json, command }, err, { logError: error }));
  }
}
