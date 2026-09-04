import { log } from "@clack/prompts";
import { ConfirmError } from "@freecodecamp/universe-core";
import { buildEnvelope } from "@freecodecamp/universe-core";
import { exitWithCode } from "@freecodecamp/universe-core";
import { emitJson, outputError } from "@freecodecamp/universe-core";
import { defaultRepoPrompts, type RepoCommandDeps, setupClient, UsageError } from "./_shared.js";

export interface RepoRemoveOptions {
  json: boolean;
  id: string;
  yes?: boolean;
}

export async function remove(
  options: RepoRemoveOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo remove";
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
        throw new UsageError("non-interactive session: pass --yes to delete without confirmation");
      }
      const cur = await client.getRepoRequest(options.id);
      const ok = await prompts.confirm({
        message: `Delete the ${cur.status} request for "${cur.name}" (${cur.id})? This frees the repo name.`,
      });
      if (prompts.isCancel(ok) || ok === false) {
        throw new ConfirmError("repo remove cancelled");
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
      success(`Deleted request ${options.id} — the repo name is free to request again`);
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
