import { log } from "@clack/prompts";
import { UsageError } from "../../errors.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { formatRepoTable, type RepoCommandDeps, type RepoSdkDeps, setupClient } from "./_shared.js";
import { repoStatusSchema } from "./schema.js";

/** Closed set accepted by `--status`: the row statuses plus `all`. */
const LS_STATUSES = [...repoStatusSchema.options, "all"] as const;

interface RepoLsOptions {
  /** pending (default) | approved | active | rejected | failed | all */
  status?: string;
  /** Filter to the caller's own requests. */
  mine?: boolean;
  all?: boolean;
}

interface RepoLsHandlerOptions {
  json: boolean;
  status?: string;
  mine?: boolean;
  all?: boolean;
}

/** List repo requests, optionally filtered by status or ownership. */
async function repoLs(
  options: RepoLsOptions,
  deps: RepoSdkDeps = {},
): Promise<CommandResult> {
  const requestedStatus = options.all ? "all" : options.status;
  if (
    requestedStatus !== undefined &&
    !(LS_STATUSES as readonly string[]).includes(requestedStatus)
  ) {
    throw new UsageError(
      `invalid --status "${requestedStatus}": must be one of ${LS_STATUSES.join(", ")}`,
    );
  }
  const { client, identitySource } = await setupClient(deps);
  let rows;
  try {
    rows = await client.listRepoRequests({
      status: requestedStatus,
      mine: options.mine ?? false,
    });
  } catch (err) {
    if (err instanceof Error) (err as Error & { identitySource?: string }).identitySource = identitySource;
    throw err;
  }
  const status = requestedStatus ?? "pending";

  const empty = status === "all" ? "No repo requests." : `No ${status} repo requests.`;
  const format = formatRepoTable(rows, empty);

  return {
    data: buildEnvelope("repo ls", true, {
      count: rows.length,
      status,
      mine: options.mine ?? false,
      requests: rows,
      identitySource,
    }),
    format,
  };
}

async function repoLsHandler(
  options: RepoLsHandlerOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await repoLs(options, deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      message(result.format);
    }
  } catch (err) {
    const identitySource = (err as { identitySource?: string }).identitySource;
    exit(outputError({ json: options.json, command: "repo ls" }, err, {
      logError: error,
      extras: identitySource ? { identitySource } : undefined,
    }));
  }
}

export { repoLs, repoLsHandler };
export type { RepoLsOptions, RepoLsHandlerOptions };
