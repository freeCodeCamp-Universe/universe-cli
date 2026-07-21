import { log } from "@clack/prompts";
import { UsageError } from "../../errors.js";
import { type AuditRow, wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { type AuditCommandDeps, setupClient } from "./_shared.js";

export interface AuditLsOptions {
  json: boolean;
  site?: string;
  actor?: string;
  action?: string;
  since?: string;
  limit?: number;
}

function formatTable(rows: AuditRow[]): string {
  if (rows.length === 0) return "No audit events.";
  const headers = ["OCCURRED AT", "ACTOR", "ACTION", "TARGET", "OUTCOME"];
  const cells: string[][] = rows.map((r) => [
    r.occurredAt,
    r.actor,
    r.action,
    targetOf(r),
    r.outcome,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]): string => row.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(headers), ...cells.map(fmt)].join("\n");
}

function targetFromDetail(r: AuditRow): string {
  const name = r.detail?.["name"];
  return typeof name === "string" ? name : "";
}

function targetOf(r: AuditRow): string {
  if (r.site && r.deployId) return `${r.site}/${r.deployId}`;
  return r.site || r.deployId || targetFromDetail(r);
}

export async function ls(options: AuditLsOptions, deps: AuditCommandDeps = {}): Promise<void> {
  const command = "audit ls";
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  let identitySource: string | undefined;
  try {
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
      throw new UsageError("--limit must be a non-negative integer");
    }
    const setup = await setupClient(deps);
    identitySource = setup.identitySource;
    const rows = await setup.client.listAudit({
      site: options.site,
      actor: options.actor,
      action: options.action,
      since: options.since,
      limit: options.limit,
    });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          count: rows.length,
          events: rows,
          identitySource,
        }),
      );
    } else {
      message(formatTable(rows));
    }
  } catch (err) {
    const { code, message: msg, kind, requestId } = wrapProxyError(command, err);
    outputError({ json: options.json, command }, code, msg, {
      logError: error,
      kind,
      requestId,
      extras: identitySource ? { identitySource } : undefined,
    });
    exit(code);
  }
}
