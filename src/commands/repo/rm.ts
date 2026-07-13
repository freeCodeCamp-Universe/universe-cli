import { log } from "@clack/prompts";
import { ConfirmError } from "../../errors.js";
import { wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import {
  defaultRepoPrompts,
  type RepoCommandDeps,
  setupClient,
  UsageError,
} from "./_shared.js";

export interface RepoRmOptions {
  json: boolean;
  id: string;
  yes?: boolean;
}

export async function rm(
  options: RepoRmOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo rm";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const prompts = deps.prompts ?? defaultRepoPrompts;
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);

  let identitySource: string | undefined;
  try {
    if (!options.id || options.id.trim().length === 0) {
      throw new UsageError("request id is required (positional argument)");
    }
    const setup = await setupClient(deps);
    const client = setup.client;
    identitySource = setup.identitySource;

    if (!options.json && !options.yes) {
      if (!isTTY) {
        throw new UsageError(
          "non-interactive session: pass --yes to delete without confirmation",
        );
      }
      const cur = await client.getRepoRequest(options.id);
      const ok = await prompts.confirm({
        message: `Delete the ${cur.status} request for "${cur.name}" (${cur.id})? This frees the repo name.`,
      });
      if (prompts.isCancel(ok) || ok === false) {
        throw new ConfirmError("repo rm cancelled");
      }
    }

    await client.deleteRepoRequest({ id: options.id });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          id: options.id,
          deleted: true,
          identitySource,
        }),
      );
    } else {
      success(
        `Deleted request ${options.id} — the repo name is free to request again`,
      );
    }
  } catch (err) {
    const { code, message, kind, requestId } = wrapProxyError(command, err);
    outputError({ json: options.json, command }, code, message, {
      logError: error,
      kind,
      requestId,
      extras: identitySource ? { identitySource } : undefined,
    });
    exit(code);
  }
}
