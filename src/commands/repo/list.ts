import { log } from "@clack/prompts";
import { UsageError } from "../../errors.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { formatRepoTable, type RepoCommandDeps, setupClient } from "./_shared.js";
import { repoStatusSchema } from "./schema.js";

/** Closed set accepted by `--status`: the row statuses plus `all`. */
const LIST_STATUSES = [...repoStatusSchema.options, "all"] as const;

export interface RepoListOptions {
  json: boolean;
  /** pending (default) | approved | active | rejected | failed | all */
  status?: string;
  /** Filter to the caller's own requests. */
  mine?: boolean;
  all?: boolean;
}

export async function list(options: RepoListOptions, deps: RepoCommandDeps = {}): Promise<void> {
  const command = "repo list";
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  let identitySource: string | undefined;
  try {
    const requestedStatus = options.all ? "all" : options.status;
    if (
      requestedStatus !== undefined &&
      !(LIST_STATUSES as readonly string[]).includes(requestedStatus)
    ) {
      throw new UsageError(
        `invalid --status "${requestedStatus}": must be one of ${LIST_STATUSES.join(", ")}`,
      );
    }
    const setup = await setupClient(deps);
    const client = setup.client;
    identitySource = setup.identitySource;
    const rows = await client.listRepoRequests({
      status: requestedStatus,
      mine: options.mine ?? false,
    });
    const status = requestedStatus ?? "pending";

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          count: rows.length,
          status,
          mine: options.mine ?? false,
          requests: rows,
          identitySource,
        }),
      );
    } else {
      const empty = status === "all" ? "No repo requests." : `No ${status} repo requests.`;
      message(formatRepoTable(rows, empty));
    }
  } catch (err) {
    exit(
      outputError({ json: options.json, command }, err, {
        logError: error,
        extras: identitySource ? { identitySource } : undefined,
      }),
    );
  }
}
