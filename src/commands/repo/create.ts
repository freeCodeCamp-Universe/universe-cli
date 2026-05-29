import { log } from "@clack/prompts";
import { ConfirmError } from "../../errors.js";
import { type ProxyClient, wrapProxyError } from "../../lib/proxy-client.js";
import { buildEnvelope } from "../../output/envelope.js";
import { exitWithCode } from "../../output/exit-codes.js";
import { outputError } from "../../output/format.js";
import {
  defaultRepoPrompts,
  emitJson,
  type RepoCommandDeps,
  type RepoPrompts,
  setupClient,
  UsageError,
} from "./_shared.js";
import { createRepoRequestSchema } from "./schema.js";

export interface RepoCreateOptions {
  json: boolean;
  name?: string;
  visibility?: string;
  description?: string;
  template?: string;
  /** Skip interactive prompts + confirm (required for non-TTY / CI). */
  yes?: boolean;
}

function blankToUndefined(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

/**
 * Resolve the template via prompt. When the proxy returns a non-empty
 * allowlist, present a select with a "None (blank repo)" first option;
 * otherwise (fetch failed / empty) fall back to free text (the Chat
 * flow's fail-soft behaviour). Returns undefined for a blank repo.
 */
async function promptTemplate(
  client: ProxyClient,
  prompts: RepoPrompts,
): Promise<string | undefined> {
  let templates: string[] = [];
  try {
    templates = await client.listRepoTemplates();
  } catch {
    templates = [];
  }

  if (templates.length === 0) {
    const v = await prompts.text({
      message: "Template (optional)",
      placeholder: "name of an org template repo; blank for an empty repo",
    });
    if (prompts.isCancel(v)) throw new ConfirmError("repo create cancelled");
    return blankToUndefined(String(v));
  }

  const v = await prompts.select({
    message: "Template",
    options: [
      { value: "", label: "None (blank repo)" },
      ...templates.map((t) => ({ value: t, label: t })),
    ],
    initialValue: "",
  });
  if (prompts.isCancel(v)) throw new ConfirmError("repo create cancelled");
  return blankToUndefined(String(v));
}

export async function create(
  options: RepoCreateOptions,
  deps: RepoCommandDeps = {},
): Promise<void> {
  const command = "repo create";
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const prompts = deps.prompts ?? defaultRepoPrompts;
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);
  // canPrompt: a TTY human session that hasn't opted out (--yes) or into
  // automation (--json) — the only mode where we gather + confirm.
  const canPrompt = !options.json && !options.yes && isTTY;

  try {
    // Identity/client setup is deferred until after local validation and
    // the non-TTY `--yes` gate, so a missing name / bad option / missing
    // `--yes` reports a usage error rather than a credential error. The
    // interactive template prompt still needs a client, so prompting paths
    // set it up just before that prompt.
    let client: ProxyClient | undefined;
    let identitySource = "";
    const ensureClient = async (): Promise<ProxyClient> => {
      if (!client) {
        const setup = await setupClient(deps);
        client = setup.client;
        identitySource = setup.identitySource;
      }
      return client;
    };

    let name = blankToUndefined(options.name) ?? "";
    let visibility = options.visibility;
    let description = options.description;
    let template = options.template;

    if (canPrompt) {
      if (!name) {
        const v = await prompts.text({
          message: "Repository name",
          placeholder: "learn-python-rpg",
        });
        if (prompts.isCancel(v))
          throw new ConfirmError("repo create cancelled");
        name = String(v).trim();
      }
      if (visibility === undefined) {
        const v = await prompts.select({
          message: "Visibility",
          options: [
            { value: "private", label: "Private" },
            { value: "public", label: "Public" },
          ],
          initialValue: "private",
        });
        if (prompts.isCancel(v))
          throw new ConfirmError("repo create cancelled");
        visibility = String(v);
      }
      if (description === undefined) {
        const v = await prompts.text({
          message: "Description (optional)",
          placeholder: "What is this project about?",
        });
        if (prompts.isCancel(v))
          throw new ConfirmError("repo create cancelled");
        description = String(v);
      }
      if (template === undefined) {
        template = await promptTemplate(await ensureClient(), prompts);
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
      const issues = parsed.error.issues.map(
        (i) => `${i.path.join(".") || "input"}: ${i.message}`,
      );
      throw new UsageError(issues.join("; "));
    }
    const body = parsed.data;

    // Confirm required unless --yes / --json. A non-TTY human session
    // cannot prompt, so it must pass --yes rather than silently submitting.
    if (!options.json && !options.yes) {
      if (!isTTY) {
        throw new UsageError(
          "non-interactive session: pass --yes to submit without confirmation (or --json)",
        );
      }
      const ok = await prompts.confirm({
        message: `Submit request to create ${body.visibility} repo "${body.name}"${
          body.template ? ` from template ${body.template}` : ""
        }?`,
      });
      if (prompts.isCancel(ok) || ok === false) {
        throw new ConfirmError("repo create cancelled");
      }
    }

    const activeClient = await ensureClient();
    const row = await activeClient.createRepoRequest({
      name: body.name,
      visibility: body.visibility,
      description: body.description,
      template: body.template,
    });

    if (options.json) {
      emitJson(
        buildEnvelope(command, true, {
          id: row.id,
          name: row.name,
          owner: row.owner,
          visibility: row.visibility,
          template: row.template,
          status: row.status,
          identitySource,
        }),
      );
    } else {
      success(
        [
          `Request submitted`,
          ``,
          `  Request id:  ${row.id}`,
          `  Repository:  ${row.owner}/${row.name}`,
          `  Visibility:  ${row.visibility}`,
          ...(row.template ? [`  Template:    ${row.template}`] : []),
          `  Status:      ${row.status} — run \`universe repo ls\` to review`,
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
