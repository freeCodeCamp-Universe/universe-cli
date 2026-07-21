import { log } from "@clack/prompts";
import { ConfirmError, StorageError } from "../../errors.js";
import { wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { EXIT_STORAGE, exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { defaultRepoPrompts, type RepoCommandDeps, setupClient, UsageError } from "./_shared.js";

export interface RepoApproveOptions {
  json: boolean;
  id: string;
  /** Skip the confirm prompt (required for non-TTY / CI). */
  yes?: boolean;
}

export async function approve(
  options: RepoApproveOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo approve";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const prompts = deps.prompts ?? defaultRepoPrompts;
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);

  let creationFailure: Record<string, unknown> | undefined;
  let identitySource: string | undefined;
  try {
    if (!options.id || options.id.trim().length === 0) {
      throw new UsageError("request id is required (positional argument)");
    }
    const setup = await setupClient(deps);
    const client = setup.client;
    identitySource = setup.identitySource;

    // Confirmation is required unless --yes (explicit opt-out) or --json
    // (automation path). A non-TTY human session cannot prompt, so it
    // must pass --yes rather than silently approving.
    if (!options.json && !options.yes) {
      if (!isTTY) {
        throw new UsageError("non-interactive session: pass --yes to approve without confirmation");
      }
      const cur = await client.getRepoRequest(options.id);
      const ok = await prompts.confirm({
        message: `Approve ${cur.visibility} repo "${cur.name}" requested by ${cur.requestedBy}? This creates the repository.`,
      });
      if (prompts.isCancel(ok) || ok === false) {
        throw new ConfirmError("repo approve cancelled");
      }
    }

    const res = await client.approveRepoRequest({ id: options.id });
    const row = res.request;

    if (res.outcome === "approved_failed") {
      if (!options.json) {
        throw new StorageError(
          `approved, but repository creation failed: ${row.error ?? "unknown"} (${row.owner}/${row.name}, requested by ${row.requestedBy})`,
        );
      }
      creationFailure = {
        outcome: res.outcome,
        id: row.id,
        repo: `${row.owner}/${row.name}`,
        status: row.status,
        creationError: row.error ?? "unknown",
        requestedBy: row.requestedBy,
        identitySource,
      };
    } else if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          id: row.id,
          outcome: res.outcome,
          repo: `${row.owner}/${row.name}`,
          url: row.url,
          visibility: row.visibility,
          approver: row.approver,
          identitySource,
        }),
      );
    } else {
      success(
        [
          `Approved ${row.name}`,
          ``,
          `  Repository:  ${row.url ?? `${row.owner}/${row.name}`}`,
          `  Visibility:  ${row.visibility}`,
          `  Approved by: ${row.approver ?? "you"}`,
        ].join("\n"),
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
    return;
  }

  if (creationFailure) {
    outputError({ json: true, command }, EXIT_STORAGE, "approved, but repository creation failed", {
      logError: error,
      extras: creationFailure,
    });
    exit(EXIT_STORAGE);
  }
}
