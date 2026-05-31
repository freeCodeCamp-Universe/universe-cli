import { log } from "@clack/prompts";
import { type RepoRow, wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { outputError } from "../../output/format.js";
import {
  emitJson,
  type RepoCommandDeps,
  setupClient,
  UsageError,
} from "./_shared.js";

export interface RepoStatusOptions {
  json: boolean;
  id: string;
}

function humanRow(row: RepoRow): string {
  const lines = [
    `Request ${row.id}`,
    ``,
    `  Repository:   ${row.owner}/${row.name}`,
    `  Visibility:   ${row.visibility}`,
    `  Status:       ${row.status}`,
    `  Requested by: ${row.requestedBy}`,
  ];
  if (row.template) lines.push(`  Template:     ${row.template}`);
  if (row.url) lines.push(`  URL:          ${row.url}`);
  if (row.approver) lines.push(`  Approver:     ${row.approver}`);
  if (row.rejectReason) lines.push(`  Reason:       ${row.rejectReason}`);
  if (row.error) lines.push(`  Error:        ${row.error}`);
  lines.push(`  Created:      ${row.createdAt}`);
  lines.push(`  Updated:      ${row.updatedAt}`);
  return lines.join("\n");
}

export async function status(
  options: RepoStatusOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo status";
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  let identitySource: string | undefined;
  try {
    if (!options.id || options.id.trim().length === 0) {
      throw new UsageError("request id is required (positional argument)");
    }
    const setup = await setupClient(deps);
    const client = setup.client;
    identitySource = setup.identitySource;
    const row = await client.getRepoRequest(options.id);

    if (options.json) {
      emitJson(buildEnvelope(command, true, { request: row, identitySource }));
    } else {
      message(humanRow(row));
    }
  } catch (err) {
    const {
      code,
      message: msg,
      kind,
      requestId,
    } = wrapProxyError(command, err);
    outputError({ json: options.json, command }, code, msg, {
      logError: error,
      kind,
      requestId,
      extras: identitySource ? { identitySource } : undefined,
    });
    exit(code);
  }
}
