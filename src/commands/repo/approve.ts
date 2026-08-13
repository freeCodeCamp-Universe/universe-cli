import { log } from "@clack/prompts";
import { ConfirmError, StorageError } from "../../errors.js";
import { clackDriver } from "../../interaction/clack-driver.js";
import { silentDrive } from "../../interaction/silent-driver.js";
import type { Step, StepResponse } from "../../interaction/step.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { type RepoCommandDeps, type RepoSdkDeps, setupClient, UsageError } from "./_shared.js";

interface RepoApproveOptions {
  id: string;
  yes?: boolean;
}

interface RepoApproveHandlerOptions {
  json: boolean;
  id: string;
  yes?: boolean;
}


/** Approve a pending repo request. Yields a confirm step unless `yes` is set. */
async function* repoApprove(
  options: RepoApproveOptions,
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
      field: "approve",
      message: `Approve ${cur.visibility} repo "${cur.name}" requested by ${cur.requestedBy}? This creates the repository.`,
    }) as boolean;
    if (!ok) {
      throw new ConfirmError("repo approve cancelled");
    }
  }

  const res = await client.approveRepoRequest({ id: options.id });
  const row = res.request;

  if (res.outcome === "approved_failed") {
    const err = new StorageError(
      `approved, but repository creation failed: ${row.error ?? "unknown"} (${row.owner}/${row.name}, requested by ${row.requestedBy})`,
    );
    (err as StorageError & { creationFailure: Record<string, unknown> }).creationFailure = {
      outcome: res.outcome,
      id: row.id,
      repo: `${row.owner}/${row.name}`,
      status: row.status,
      creationError: row.error ?? "unknown",
      requestedBy: row.requestedBy,
      identitySource,
    };
    throw err;
  }

  const format = [
    `Approved ${row.name}`,
    ``,
    `  Repository:  ${row.url ?? `${row.owner}/${row.name}`}`,
    `  Visibility:  ${row.visibility}`,
    `  Approved by: ${row.approver ?? "you"}`,
  ].join("\n");

  return {
    data: buildEnvelope("repo approve", true, {
      id: row.id,
      outcome: res.outcome,
      repo: `${row.owner}/${row.name}`,
      url: row.url,
      visibility: row.visibility,
      approver: row.approver,
      identitySource,
    }),
    format,
  };
}

async function repoApproveHandler(
  options: RepoApproveHandlerOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo approve";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const sdkOpts: RepoApproveOptions = {
      id: options.id,
      yes: options.json || options.yes,
    };

    let result: CommandResult;
    if (options.json || options.yes) {
      result = await silentDrive(repoApprove(sdkOpts, deps));
    } else {
      const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);
      if (!isTTY) {
        throw new UsageError("non-interactive session: pass --yes to approve without confirmation");
      }
      result = await clackDriver(repoApprove(sdkOpts, deps));
    }

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    const creationFailure = (err as { creationFailure?: Record<string, unknown> }).creationFailure;
    const identitySource = creationFailure?.identitySource as string | undefined;
    const extras = creationFailure ?? (identitySource ? { identitySource } : undefined);
    exit(outputError({ json: options.json, command }, err, { logError: error, extras }));
  }
}

export { repoApprove, repoApproveHandler };
export type { RepoApproveOptions, RepoApproveHandlerOptions };
