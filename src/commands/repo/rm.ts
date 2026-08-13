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

interface RepoRmOptions {
  id: string;
  yes?: boolean;
}

interface RepoRmHandlerOptions {
  json: boolean;
  id: string;
  yes?: boolean;
}


/** Delete a repo request, freeing the name. Yields a confirm step unless `yes` is set. */
async function* repoRm(
  options: RepoRmOptions,
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
      field: "rm",
      message: `Delete the ${cur.status} request for "${cur.name}" (${cur.id})? This frees the repo name.`,
    }) as boolean;
    if (!ok) {
      throw new ConfirmError("repo rm cancelled");
    }
  }

  try {
    await client.deleteRepoRequest({ id: options.id });
  } catch (err) {
    // Attach identitySource so the handler can include it in error envelopes.
    if (err instanceof Error) {
      (err as Error & { identitySource?: string }).identitySource = identitySource;
    }
    throw err;
  }

  const format = `Deleted request ${options.id} — the repo name is free to request again`;

  return {
    data: buildEnvelope("repo rm", true, {
      id: options.id,
      deleted: true,
      identitySource,
    }),
    format,
  };
}

async function repoRmHandler(
  options: RepoRmHandlerOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo rm";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const sdkOpts: RepoRmOptions = {
      id: options.id,
      yes: options.json || options.yes,
    };

    let result: CommandResult;
    if (options.json || options.yes) {
      result = await silentDrive(repoRm(sdkOpts, deps));
    } else {
      const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);
      if (!isTTY) {
        throw new UsageError("non-interactive session: pass --yes to delete without confirmation");
      }
      result = await clackDriver(repoRm(sdkOpts, deps));
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

export { repoRm, repoRmHandler };
export type { RepoRmOptions, RepoRmHandlerOptions };
