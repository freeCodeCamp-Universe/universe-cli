import { log } from "@clack/prompts";
import { UsageError } from "../../errors.js";
import { type AuditRow } from "../../lib/proxy-client.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { type AuditCommandDeps, type AuditSdkDeps, setupClient } from "./_shared.js";

interface AuditLsOptions {
  site?: string;
  actor?: string;
  action?: string;
  since?: string;
  limit?: number;
}

interface AuditLsHandlerOptions {
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

/** Query the audit log, optionally filtered by site, actor, action, or time range. */
async function auditLs(
  options: AuditLsOptions,
  deps: AuditSdkDeps = {},
): Promise<CommandResult> {
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
    throw new UsageError("--limit must be a non-negative integer");
  }
  const setup = await setupClient(deps);
  let rows;
  try {
    rows = await setup.client.listAudit({
      site: options.site,
      actor: options.actor,
      action: options.action,
      since: options.since,
      limit: options.limit,
    });
  } catch (err) {
    if (err instanceof Error) (err as Error & { identitySource?: string }).identitySource = setup.identitySource;
    throw err;
  }

  return {
    data: buildEnvelope("audit ls", true, {
      count: rows.length,
      events: rows,
      identitySource: setup.identitySource,
    }),
    format: formatTable(rows),
  };
}

async function auditLsHandler(
  options: AuditLsHandlerOptions,
  deps: AuditCommandDeps = {},
): Promise<void> {
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await auditLs(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      message(result.format);
    }
  } catch (err) {
    const identitySource = (err as { identitySource?: string }).identitySource;
    exit(outputError({ json: options.json, command: "audit ls" }, err, {
      logError: error,
      extras: identitySource ? { identitySource } : undefined,
    }));
  }
}

export { auditLs, auditLsHandler };
export type { AuditLsOptions, AuditLsHandlerOptions };
