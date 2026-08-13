import { log } from "@clack/prompts";
import { ConfirmError } from "../../errors.js";
import { clackDriver } from "../../interaction/clack-driver.js";
import { silentDrive } from "../../interaction/silent-driver.js";
import type { Step, StepResponse } from "../../interaction/step.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { type RepoCommandDeps, type RepoSdkDeps, setupClient, UsageError } from "./_shared.js";

interface RepoRejectOptions {
  id: string;
  reason?: string;
  yes?: boolean;
}

interface RepoRejectHandlerOptions {
  json: boolean;
  id: string;
  reason?: string;
  yes?: boolean;
}


/** Reject a pending repo request. Yields a confirm step unless `yes` is set. */
async function* repoReject(
  options: RepoRejectOptions,
  deps: RepoSdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  if (!options.id || options.id.trim().length === 0) {
    throw new UsageError("request id is required (positional argument)");
  }
  const setup = await setupClient(deps);
  const client = setup.client;
  const identitySource = setup.identitySource;

  if (!options.yes) {
    const cur = await client.getRepoRequest(options.id);
    const ok = (yield {
      type: "confirm",
      field: "reject",
      message: `Reject the request for "${cur.name}" by ${cur.requestedBy}?`,
    }) as boolean;
    if (!ok) {
      throw new ConfirmError("repo reject cancelled");
    }
  }

  const reason =
    options.reason === undefined ? undefined : String(options.reason).trim() || undefined;
  const row = await client.rejectRepoRequest({
    id: options.id,
    reason,
  });

  const format = [
    `Rejected ${row.name}`,
    ``,
    `  Repository: ${row.owner}/${row.name}`,
    ...(row.rejectReason ? [`  Reason:     ${row.rejectReason}`] : []),
  ].join("\n");

  return {
    data: buildEnvelope("repo reject", true, {
      id: row.id,
      status: row.status,
      repo: `${row.owner}/${row.name}`,
      rejectReason: row.rejectReason,
      identitySource,
    }),
    format,
  };
}

async function repoRejectHandler(
  options: RepoRejectHandlerOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo reject";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const sdkOpts: RepoRejectOptions = {
      id: options.id,
      reason: options.reason,
      yes: options.json || options.yes,
    };

    let result: CommandResult;
    if (options.json || options.yes) {
      result = await silentDrive(repoReject(sdkOpts, deps));
    } else {
      const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);
      if (!isTTY) {
        throw new UsageError("non-interactive session: pass --yes to reject without confirmation");
      }
      result = await clackDriver(repoReject(sdkOpts, deps));
    }

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    const identitySource = (err as { identitySource?: string }).identitySource;
    exit(outputError({ json: options.json, command }, err, {
      logError: error,
      extras: identitySource ? { identitySource } : undefined,
    }));
  }
}

export { repoReject, repoRejectHandler };
export type { RepoRejectOptions, RepoRejectHandlerOptions };
