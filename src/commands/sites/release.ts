import { confirm as clackConfirm, isCancel, log } from "@clack/prompts";
import { ConfirmError } from "../../errors.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { setupClient, UsageError, type SitesCommandDeps } from "./_shared.js";

export interface ReleaseOptions {
  json: boolean;
  slug: string;
  yes: boolean;
}

async function defaultConfirm(message: string): Promise<boolean> {
  const answer = await clackConfirm({ message, initialValue: false });
  if (isCancel(answer)) return false;
  return answer === true;
}

export async function release(options: ReleaseOptions, deps: SitesCommandDeps = {}): Promise<void> {
  const command = "sites release";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const ask = deps.confirm ?? defaultConfirm;
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);

  try {
    if (!options.slug || options.slug.trim().length === 0) {
      throw new UsageError("slug is required (positional argument)");
    }
    if (options.json && !options.yes) {
      throw new ConfirmError("--json cannot prompt: pass --yes to release without confirmation");
    }
    const { client, identitySource } = await setupClient(deps);

    if (!options.json && !options.yes) {
      if (!isTTY) {
        throw new ConfirmError(
          "non-interactive session: pass --yes to release without confirmation",
        );
      }
      const ok = await ask(
        `Release "${options.slug}" now? This frees the name AND trashes the site's files. It cannot be undone.`,
      );
      if (!ok) {
        throw new ConfirmError("sites release cancelled");
      }
    }
    const result = await client.releaseSite({ slug: options.slug });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          slug: result.slug,
          status: result.status,
          moved: result.moved,
          identitySource,
        }),
      );
    } else {
      success(
        [
          `Released ${result.slug}`,
          ``,
          `  ${result.moved} object(s) moved to trash. The name is free to register again.`,
          `  This is not recoverable through undelete.`,
        ].join("\n"),
      );
    }
  } catch (err) {
    exit(
      outputError({ json: options.json, command }, err, {
        logError: error,
      }),
    );
  }
}
