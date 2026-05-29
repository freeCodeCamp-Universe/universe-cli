import { log } from "@clack/prompts";
import { ConfirmError } from "../../errors.js";
import { wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { outputError } from "../../output/format.js";
import {
  defaultRepoPrompts,
  emitJson,
  type RepoCommandDeps,
  setupClient,
  UsageError,
} from "./_shared.js";

export interface RepoRejectOptions {
  json: boolean;
  id: string;
  reason?: string;
  /** Skip the confirm prompt (required for non-TTY / CI). */
  yes?: boolean;
}

export async function reject(
  options: RepoRejectOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo reject";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const prompts = deps.prompts ?? defaultRepoPrompts;
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);

  try {
    if (!options.id || options.id.trim().length === 0) {
      throw new UsageError("request id is required (positional argument)");
    }
    const { client, identitySource } = await setupClient(deps);

    // Confirmation required unless --yes / --json; a non-TTY human
    // session must pass --yes rather than silently rejecting.
    if (!options.json && !options.yes) {
      if (!isTTY) {
        throw new UsageError(
          "non-interactive session: pass --yes to reject without confirmation",
        );
      }
      const cur = await client.getRepoRequest(options.id);
      const ok = await prompts.confirm({
        message: `Reject the request for "${cur.name}" by ${cur.requestedBy}?`,
      });
      if (prompts.isCancel(ok) || ok === false) {
        throw new ConfirmError("repo reject cancelled");
      }
    }

    const row = await client.rejectRepoRequest({
      id: options.id,
      reason: options.reason,
    });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          id: row.id,
          status: row.status,
          repo: `${row.owner}/${row.name}`,
          rejectReason: row.rejectReason,
          identitySource,
        }),
      );
    } else {
      success(
        [
          `Rejected ${row.name}`,
          ``,
          `  Repository: ${row.owner}/${row.name}`,
          ...(row.rejectReason ? [`  Reason:     ${row.rejectReason}`] : []),
        ].join("\n"),
      );
    }
  } catch (err) {
    const { code, message } = wrapProxyError(command, err);
    outputError({ json: options.json, command }, code, message, {
      logError: error,
    });
    exit(code);
  }
}
