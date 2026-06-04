import { Command } from "commander";
import { create } from "./commands/create/index.js";
import { deploy } from "./commands/deploy.js";
import { init } from "./commands/init.js";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { ls } from "./commands/ls.js";
import { promote } from "./commands/promote.js";
import { rollback } from "./commands/rollback.js";
import { whoami } from "./commands/whoami.js";
import { ls as sitesLs } from "./commands/sites/ls.js";
import { register as sitesRegister } from "./commands/sites/register.js";
import { rm as sitesRm } from "./commands/sites/rm.js";
import { update as sitesUpdate } from "./commands/sites/update.js";
import { approve as repoApprove } from "./commands/repo/approve.js";
import { create as repoCreate } from "./commands/repo/create.js";
import { ls as repoLs } from "./commands/repo/ls.js";
import { reject as repoReject } from "./commands/repo/reject.js";
import { rm as repoRm } from "./commands/repo/rm.js";
import { status as repoStatus } from "./commands/repo/status.js";
import { type OutputContext, outputError } from "./output/format.js";
import { EXIT_USAGE, exitWithCode } from "./output/exit-codes.js";
import { CliError } from "./errors.js";
import {
  installExitNotice,
  refreshIfStale,
  spawnRefresh,
} from "./lib/update-notifier.js";

declare const __VERSION__: string;
const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0";

function handleActionError(command: string, json: boolean, err: unknown): void {
  const ctx: OutputContext = { json, command };
  const message = err instanceof Error ? err.message : "unknown error";
  const code = err instanceof CliError ? err.exitCode : EXIT_USAGE;
  outputError(ctx, code, message);
  exitWithCode(code);
}

export function isVersionRequest(args: readonly string[]): boolean {
  return args.includes("--version") || args.includes("-v");
}

function jsonOf(cmd: Command): boolean {
  return cmd.optsWithGlobals<{ json?: boolean }>().json ?? false;
}

function namespaceGroup(name: string, description: string): Command {
  return new Command(name)
    .description(description)
    .configureHelp({ showGlobalOptions: true })
    .option("--json", "Output as JSON")
    .exitOverride()
    .action((_opts: unknown, cmd: Command): void => {
      const json = jsonOf(cmd);
      if (json) {
        outputError(
          { json: true, command: name },
          EXIT_USAGE,
          `missing ${name} subcommand — run \`universe ${name} --help\``,
        );
      } else {
        cmd.outputHelp();
      }
      exitWithCode(EXIT_USAGE);
    });
}

function firstPositional(args: readonly string[]): string {
  for (const a of args) {
    if (typeof a === "string" && !a.startsWith("-")) return a;
  }
  return "cli";
}

export async function run(argv = process.argv): Promise<void> {
  installExitNotice(version);

  const args = argv.slice(2);
  const versionRequested = isVersionRequest(args);
  if (!versionRequested) {
    spawnRefresh();
  }

  const cli = new Command("universe");
  cli.exitOverride();
  cli.configureHelp({ showGlobalOptions: true });
  cli.version(version, "-v, --version", "Show version number");
  cli.option("--json", "Output as JSON");

  const sitesCli = namespaceGroup("sites", "Static site registry commands");
  const staticCli = namespaceGroup("static", "Static site deployment commands");
  const repoCli = namespaceGroup(
    "repo",
    "Repository creation + approval queue commands",
  );

  sitesCli
    .command("register <slug>")
    .description("Register a new static site (staff only)")
    .option(
      "--team <name>",
      "GitHub team slug (repeatable, or comma-separated). Defaults to staff.",
    )
    .action(async (slug: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        team?: string | string[];
      }>();
      try {
        await sitesRegister({
          json: opts.json ?? false,
          slug,
          team: opts.team,
        });
      } catch (err: unknown) {
        handleActionError("sites register", opts.json ?? false, err);
      }
    });

  sitesCli
    .command("ls")
    .description("List sites in the registry")
    .option("--mine", "Filter to sites your GitHub identity is authorized for")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; mine?: boolean }>();
      try {
        await sitesLs({
          json: opts.json ?? false,
          mine: opts.mine ?? false,
        });
      } catch (err: unknown) {
        handleActionError("sites ls", opts.json ?? false, err);
      }
    });

  sitesCli
    .command("update <slug>")
    .description("Replace the teams list for an existing site (staff only)")
    .option(
      "--team <name>",
      "GitHub team slug (repeatable, or comma-separated). Required.",
    )
    .action(async (slug: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        team?: string | string[];
      }>();
      try {
        await sitesUpdate({
          json: opts.json ?? false,
          slug,
          team: opts.team,
        });
      } catch (err: unknown) {
        handleActionError("sites update", opts.json ?? false, err);
      }
    });

  sitesCli
    .command("rm <slug>")
    .description("Remove a site from the registry (staff only)")
    .action(async (slug: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean }>();
      try {
        await sitesRm({ json: opts.json ?? false, slug });
      } catch (err: unknown) {
        handleActionError("sites rm", opts.json ?? false, err);
      }
    });

  repoCli
    .command("create [name]")
    .description(
      "Request a new repository under freeCodeCamp-Universe (staff only)",
    )
    .option("--visibility <vis>", "public or private (default: private)")
    .option("--description <text>", "Repository description")
    .option(
      "--template <name>",
      "Org template repo to generate from; omit for a blank repo",
    )
    .option("--yes", "Skip confirmation prompts (required for non-TTY/CI)")
    .action(async (name: string | undefined, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        visibility?: string;
        description?: string;
        template?: string;
        yes?: boolean;
      }>();
      try {
        await repoCreate({
          json: opts.json ?? false,
          name,
          visibility: opts.visibility,
          description: opts.description,
          template: opts.template,
          yes: opts.yes ?? false,
        });
      } catch (err: unknown) {
        handleActionError("repo create", opts.json ?? false, err);
      }
    });

  repoCli
    .command("ls")
    .description("List repo requests (default: pending)")
    .option(
      "--status <status>",
      "pending | approved | active | rejected | failed | all",
    )
    .option("--mine", "Only requests you submitted")
    .option("--all", "Show every state (shorthand for --status all)")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        status?: string;
        mine?: boolean;
        all?: boolean;
      }>();
      try {
        await repoLs({
          json: opts.json ?? false,
          status: opts.status,
          mine: opts.mine ?? false,
          all: opts.all ?? false,
        });
      } catch (err: unknown) {
        handleActionError("repo ls", opts.json ?? false, err);
      }
    });

  repoCli
    .command("approve <id>")
    .description("Approve a pending request — creates the repo (admin only)")
    .option("--yes", "Skip confirmation prompts (required for non-TTY/CI)")
    .action(async (id: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; yes?: boolean }>();
      try {
        await repoApprove({
          json: opts.json ?? false,
          id,
          yes: opts.yes ?? false,
        });
      } catch (err: unknown) {
        handleActionError("repo approve", opts.json ?? false, err);
      }
    });

  repoCli
    .command("reject <id>")
    .description("Reject a pending request (admin only)")
    .option("--reason <text>", "Reason shown to the requester")
    .option("--yes", "Skip confirmation prompts (required for non-TTY/CI)")
    .action(async (id: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        reason?: string;
        yes?: boolean;
      }>();
      try {
        await repoReject({
          json: opts.json ?? false,
          id,
          reason: opts.reason,
          yes: opts.yes ?? false,
        });
      } catch (err: unknown) {
        handleActionError("repo reject", opts.json ?? false, err);
      }
    });

  repoCli
    .command("status <id>")
    .description("Show a request's current state")
    .action(async (id: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean }>();
      try {
        await repoStatus({ json: opts.json ?? false, id });
      } catch (err: unknown) {
        handleActionError("repo status", opts.json ?? false, err);
      }
    });

  repoCli
    .command("rm <id>")
    .description("Delete a request, freeing its repo name (admin only)")
    .option("--yes", "Skip confirmation prompts (required for non-TTY/CI)")
    .action(async (id: string, _opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; yes?: boolean }>();
      try {
        await repoRm({
          json: opts.json ?? false,
          id,
          yes: opts.yes ?? false,
        });
      } catch (err: unknown) {
        handleActionError("repo rm", opts.json ?? false, err);
      }
    });

  staticCli
    .command("deploy")
    .description("Deploy static site via the artemis proxy")
    .option("--promote", "Finalize as production (default: preview)")
    .option("--dir <path>", "Override build.output dir from platform.yaml")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        promote?: boolean;
        dir?: string;
      }>();
      try {
        await deploy({
          json: opts.json ?? false,
          promote: opts.promote ?? false,
          dir: opts.dir,
        });
      } catch (err: unknown) {
        handleActionError("deploy", opts.json ?? false, err);
      }
    });

  staticCli
    .command("promote")
    .description("Promote the current preview to production")
    .option(
      "--from <deployId>",
      "Promote a specific past deploy id (alias rewrite)",
    )
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; from?: string }>();
      try {
        await promote({
          json: opts.json ?? false,
          from: opts.from,
        });
      } catch (err: unknown) {
        handleActionError("promote", opts.json ?? false, err);
      }
    });

  staticCli
    .command("rollback")
    .description("Rewrite production alias to a past deploy")
    .option("--to <deployId>", "Target deploy id (required)")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; to?: string }>();
      try {
        await rollback({
          json: opts.json ?? false,
          to: opts.to,
        });
      } catch (err: unknown) {
        handleActionError("rollback", opts.json ?? false, err);
      }
    });

  staticCli
    .command("ls")
    .description("List recent deploys for a site")
    .option("--site <site>", "Override site from platform.yaml")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; site?: string }>();
      try {
        await ls({
          json: opts.json ?? false,
          site: opts.site,
        });
      } catch (err: unknown) {
        handleActionError("ls", opts.json ?? false, err);
      }
    });

  cli
    .command("create")
    .description("Scaffold a new project locally")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
      }>();
      try {
        await create({
          json: opts.json ?? false,
        });
      } catch (err: unknown) {
        handleActionError("create", opts.json ?? false, err);
      }
    });

  cli
    .command("init")
    .description("Scaffold a platform.yaml in the current directory")
    .option("--site <slug>", "Override the derived site slug")
    .option("--dir <path>", "Build output directory to upload (default: dist)")
    .option("--force", "Overwrite an existing platform.yaml")
    .option("--yes", "Skip prompts; write derived defaults (non-TTY/CI)")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{
        json?: boolean;
        site?: string;
        dir?: string;
        force?: boolean;
        yes?: boolean;
      }>();
      try {
        await init({
          json: opts.json ?? false,
          site: opts.site,
          dir: opts.dir,
          force: opts.force ?? false,
          yes: opts.yes ?? false,
        });
      } catch (err: unknown) {
        handleActionError("init", opts.json ?? false, err);
      }
    });

  cli
    .command("login")
    .description("Authenticate with GitHub via OAuth device flow")
    .option("--force", "Replace any existing stored token")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean; force?: boolean }>();
      try {
        await login({
          json: opts.json ?? false,
          force: opts.force ?? false,
        });
      } catch (err: unknown) {
        handleActionError("login", opts.json ?? false, err);
      }
    });

  cli
    .command("logout")
    .description("Remove the stored GitHub device-flow token")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean }>();
      try {
        await logout({ json: opts.json ?? false });
      } catch (err: unknown) {
        handleActionError("logout", opts.json ?? false, err);
      }
    });

  cli
    .command("whoami")
    .description("Show resolved GitHub identity and authorized sites")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals<{ json?: boolean }>();
      try {
        await whoami({ json: opts.json ?? false });
      } catch (err: unknown) {
        handleActionError("whoami", opts.json ?? false, err);
      }
    });

  cli.addCommand(staticCli);
  cli.addCommand(sitesCli);
  cli.addCommand(repoCli);

  if (args.length === 0) {
    cli.outputHelp();
    return;
  }

  try {
    cli.parse(argv);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
    const handledByCommander =
      code === "commander.help" ||
      code === "commander.helpDisplayed" ||
      code === "commander.version";
    if (!handledByCommander) {
      const json = args.includes("--json");
      const command = firstPositional(args);
      const message = err instanceof Error ? err.message : "unknown error";
      outputError({ json, command }, EXIT_USAGE, message);
      exitWithCode(EXIT_USAGE);
    }
  }

  if (versionRequested) {
    await refreshIfStale(Date.now(), { force: true });
  }
}
