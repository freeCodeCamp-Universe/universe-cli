import { log } from "@clack/prompts";
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

export interface RepoLsOptions {
  json: boolean;
  /** pending (default) | approved | active | rejected | failed | all */
  status?: string;
  /** Filter to the caller's own requests. */
  mine?: boolean;
}

export async function ls(
  options: RepoLsOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo ls";
  const message = deps.logMessage ?? ((s: string) => log.message(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const { client, identitySource } = await setupClient(deps);
    const rows = await client.listRepoRequests({
      status: options.status,
      mine: options.mine ?? false,
    });
    const status = options.status ?? "pending";

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
    const { code, message: msg } = wrapProxyError(command, err);
    outputError({ json: options.json, command }, code, msg, {
      logError: error,
    });
    exit(code);
  }
}
