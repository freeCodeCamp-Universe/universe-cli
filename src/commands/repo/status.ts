import { log } from "@clack/prompts";
import { type RepoRow } from "../../lib/proxy-client.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { type RepoCommandDeps, type RepoSdkDeps, setupClient, UsageError } from "./_shared.js";

interface RepoStatusOptions {
  id: string;
}

interface RepoStatusHandlerOptions {
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

/** Fetch the status of a single repo request by ID. */
async function repoStatus(
  options: RepoStatusOptions,
  deps: RepoSdkDeps = {},
): Promise<CommandResult> {
  if (!options.id || options.id.trim().length === 0) {
    throw new UsageError("request id is required (positional argument)");
  }
  const { client, identitySource } = await setupClient(deps);
  let row;
  try {
    row = await client.getRepoRequest(options.id);
  } catch (err) {
    if (err instanceof Error) (err as Error & { identitySource?: string }).identitySource = identitySource;
    throw err;
  }

  return {
    data: buildEnvelope("repo status", true, { request: row, identitySource }),
    format: humanRow(row),
  };
}

async function repoStatusHandler(
  options: RepoStatusHandlerOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await repoStatus(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      message(result.format);
    }
  } catch (err) {
    const identitySource = (err as { identitySource?: string }).identitySource;
    exit(outputError({ json: options.json, command: "repo status" }, err, {
      logError: error,
      extras: identitySource ? { identitySource } : undefined,
    }));
  }
}

export { repoStatus, repoStatusHandler };
export type { RepoStatusOptions, RepoStatusHandlerOptions };
