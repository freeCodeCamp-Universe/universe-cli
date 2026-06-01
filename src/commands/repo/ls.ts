import { log } from "@clack/prompts";
import { UsageError } from "../../errors.js";
import { wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { outputError } from "../../output/format.js";
import {
  emitJson,
  formatRepoTable,
  type RepoCommandDeps,
  setupClient,
} from "./_shared.js";
import { repoStatusSchema } from "./schema.js";

/** Closed set accepted by `--status`: the row statuses plus `all`. */
const LS_STATUSES = [...repoStatusSchema.options, "all"] as const;

export interface RepoLsOptions {
  json: boolean;
  /** pending (default) | approved | active | rejected | failed | all */
  status?: string;
  /** Filter to the caller's own requests. */
  mine?: boolean;
  all?: boolean;
}

export async function ls(
  options: RepoLsOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo ls";
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  let identitySource: string | undefined;
  try {
    const requestedStatus = options.all ? "all" : options.status;
    if (
      requestedStatus !== undefined &&
      !(LS_STATUSES as readonly string[]).includes(requestedStatus)
    ) {
      throw new UsageError(
        `invalid --status "${requestedStatus}": must be one of ${LS_STATUSES.join(", ")}`,
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
      const empty =
        status === "all" ? "No repo requests." : `No ${status} repo requests.`;
      message(formatRepoTable(rows, empty));
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
