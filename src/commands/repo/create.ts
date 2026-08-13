import { log } from "@clack/prompts";
import { ConfirmError } from "../../errors.js";
import { clackDriver } from "../../interaction/clack-driver.js";
import { silentDrive } from "../../interaction/silent-driver.js";
import type { Step, StepResponse } from "../../interaction/step.js";
import { ProxyError } from "../../lib/proxy-client.js";
import type { CommandResult } from "../../output/command-result.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { emitJson, outputError } from "../../output/format.js";
import { type RepoCommandDeps, type RepoSdkDeps, setupClient, UsageError } from "./_shared.js";
import { createRepoRequestSchema } from "./schema.js";

interface RepoCreateOptions {
  name?: string;
  visibility?: string;
  description?: string;
  template?: string;
  yes?: boolean;
}

interface RepoCreateHandlerOptions {
  json: boolean;
  name?: string;
  visibility?: string;
  description?: string;
  template?: string;
  yes?: boolean;
}

function blankToUndefined(s: unknown): string | undefined {
  if (s === undefined || s === null) return undefined;
  const t = String(s).trim();
  return t === "" ? undefined : t;
}

/** Submit a new repo creation request. Yields text/select/confirm steps for missing inputs. */
async function* repoCreate(
  options: RepoCreateOptions,
  deps: RepoSdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  const { client, identitySource } = await setupClient(deps);

  let name = blankToUndefined(options.name) ?? "";
  let visibility = options.visibility;
  let description = options.description;
  let template = options.template;

  // Interactive prompts for missing values when yes is not set
  if (!options.yes) {
    if (!name) {
      name = ((yield {
        type: "text",
        field: "name",
        message: "Repository name",
        placeholder: "learn-python-rpg",
      }) as string) ?? "";
      name = name.trim();
    }
    if (visibility === undefined) {
      visibility = (yield {
        type: "select",
        field: "visibility",
        message: "Visibility",
        options: [
          { value: "private", label: "Private" },
          { value: "public", label: "Public" },
        ],
      }) as string;
    }
    if (description === undefined) {
      description = ((yield {
        type: "text",
        field: "description",
        message: "Description (optional)",
        placeholder: "What is this project about?",
      }) as string) ?? "";
    }
    if (template === undefined) {
      // Fetch template list from proxy before yielding
      let templates: string[] = [];
      try {
        templates = await client.listRepoTemplates();
      } catch {
        templates = [];
      }

      if (templates.length === 0) {
        const v = (yield {
          type: "text",
          field: "template",
          message: "Template (optional)",
          placeholder: "name of an org template repo; blank for an empty repo",
        }) as string;
        template = blankToUndefined(v);
      } else {
        const v = (yield {
          type: "select",
          field: "template",
          message: "Template",
          options: [
            { value: "", label: "None (blank repo)" },
            ...templates.map((t) => ({ value: t, label: t })),
          ],
        }) as string;
        template = blankToUndefined(v);
      }
    }
  }

  if (!name) {
    throw new UsageError("repo name is required");
  }

  const candidate: Record<string, unknown> = { name };
  if (visibility !== undefined && visibility !== "") {
    candidate.visibility = visibility;
  }
  const desc = blankToUndefined(description);
  if (desc !== undefined) candidate.description = desc;
  const tmpl = blankToUndefined(template);
  if (tmpl !== undefined) candidate.template = tmpl;

  const parsed = createRepoRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
    throw new UsageError(issues.join("; "));
  }
  const body = parsed.data;

  // Confirm step
  if (!options.yes) {
    const ok = (yield {
      type: "confirm",
      field: "submit",
      message: `Submit request to create ${body.visibility} repo "${body.name}"${
        body.template ? ` from template ${body.template}` : ""
      }?`,
    }) as boolean;
    if (!ok) {
      throw new ConfirmError("repo create cancelled");
    }
  }
  const row = await client.createRepoRequest({
    name: body.name,
    visibility: body.visibility,
    description: body.description,
    template: body.template,
  });

  const format = [
    `Request submitted`,
    ``,
    `  Request id:  ${row.id}`,
    `  Repository:  ${row.owner}/${row.name}`,
    `  Visibility:  ${row.visibility}`,
    ...(row.template ? [`  Template:    ${row.template}`] : []),
    `  Status:      ${row.status} — run \`universe repo ls\` to review`,
  ].join("\n");

  return {
    data: buildEnvelope("repo create", true, {
      id: row.id,
      name: row.name,
      owner: row.owner,
      visibility: row.visibility,
      template: row.template,
      status: row.status,
      identitySource,
    }),
    format,
  };
}


async function repoCreateHandler(
  options: RepoCreateHandlerOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo create";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);

  const sdkOpts: RepoCreateOptions = {
    name: options.name,
    visibility: options.visibility,
    description: options.description,
    template: options.template,
    yes: options.json || options.yes,
  };

  let result: CommandResult;
  try {
    if (!options.json && !options.yes && isTTY) {
      result = await clackDriver(repoCreate(sdkOpts, deps));
    } else {
      if (!options.json && !options.yes && !isTTY) {
        throw new UsageError(
          "non-interactive session: pass --yes to submit without confirmation (or --json)",
        );
      }
      result = await silentDrive(repoCreate(sdkOpts, deps));
    }
  } catch (err) {
    // Enrich already_exists with a hint for non-JSON mode
    if (err instanceof ProxyError && err.code === "already_exists" && !options.json) {
      exit(outputError({ json: options.json, command }, new ProxyError(
        err.status,
        err.code,
        `${err.message}\n  → run \`universe repo ls --status all\` to find the existing request (it may be active or failed)`,
        err.requestId,
        err.hint,
      ), { logError: error }));
    } else {
      exit(outputError({ json: options.json, command }, err, { logError: error }));
    }
    return;
  }

  if (options.json) {
    emitJson(result.data);
  } else {
    success(result.format);
  }
}

export { repoCreate, repoCreateHandler };
export type { RepoCreateOptions, RepoCreateHandlerOptions };
