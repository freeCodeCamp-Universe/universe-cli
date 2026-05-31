import { cac } from "cac";
import { deploy } from "./commands/deploy.js";
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
import { status as repoStatus } from "./commands/repo/status.js";
import { type OutputContext, outputError } from "./output/format.js";
import { EXIT_USAGE, exitWithCode } from "./output/exit-codes.js";
import { CliError } from "./errors.js";
import { installExitNotice, refreshIfStale } from "./lib/update-notifier.js";

declare const __VERSION__: string;
const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0";

function handleActionError(command: string, json: boolean, err: unknown): void {
  const ctx: OutputContext = { json, command };
  const message = err instanceof Error ? err.message : "unknown error";
  const code = err instanceof CliError ? err.exitCode : EXIT_USAGE;
  outputError(ctx, code, message);
  exitWithCode(code);
}

/**
 * cac (v7.x) does not support nested subcommands — it matches against
 * a single argv segment only. We keep three cac instances and dispatch
 * by detecting `static` or `sites` as the first **non-flag** positional.
 * Preserves global flags placed before the namespace token (e.g.
 * `universe --json static deploy`).
 */
function findFirstPositional(args: readonly string[]): number {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (typeof a === "string" && !a.startsWith("-")) return i;
  }
  return -1;
}

export function run(argv = process.argv) {
  installExitNotice(version);
  void refreshIfStale();

  const args = argv.slice(2);
  const firstPosIdx = findFirstPositional(args);
  const namespace = firstPosIdx >= 0 ? args[firstPosIdx] : undefined;
  const isStatic = namespace === "static";
  const isSites = namespace === "sites";
  const isRepo = namespace === "repo";

  if (isSites) {
    const sitesArgs = [
      ...args.slice(0, firstPosIdx),
      ...args.slice(firstPosIdx + 1),
    ];
    const sitesCli = cac("universe sites");

    sitesCli
      .command("register <slug>", "Register a new static site (staff only)")
      .option("--json", "Output as JSON")
      .option(
        "--team <name>",
        "GitHub team slug (repeatable, or comma-separated). Defaults to staff.",
      )
      .action(
        async (
          slug: string,
          flags: { json?: boolean; team?: string | string[] },
        ) => {
          try {
            await sitesRegister({
              json: flags.json ?? false,
              slug,
              team: flags.team,
            });
          } catch (err: unknown) {
            handleActionError("sites register", flags.json ?? false, err);
          }
        },
      );

    sitesCli
      .command("ls", "List sites in the registry")
      .option("--json", "Output as JSON")
      .option(
        "--mine",
        "Filter to sites your GitHub identity is authorized for",
      )
      .action(async (flags: { json?: boolean; mine?: boolean }) => {
        try {
          await sitesLs({
            json: flags.json ?? false,
            mine: flags.mine ?? false,
          });
        } catch (err: unknown) {
          handleActionError("sites ls", flags.json ?? false, err);
        }
      });

    sitesCli
      .command(
        "update <slug>",
        "Replace the teams list for an existing site (staff only)",
      )
      .option("--json", "Output as JSON")
      .option(
        "--team <name>",
        "GitHub team slug (repeatable, or comma-separated). Required.",
      )
      .action(
        async (
          slug: string,
          flags: { json?: boolean; team?: string | string[] },
        ) => {
          try {
            await sitesUpdate({
              json: flags.json ?? false,
              slug,
              team: flags.team,
            });
          } catch (err: unknown) {
            handleActionError("sites update", flags.json ?? false, err);
          }
        },
      );

    sitesCli
      .command("rm <slug>", "Remove a site from the registry (staff only)")
      .option("--json", "Output as JSON")
      .action(async (slug: string, flags: { json?: boolean }) => {
        try {
          await sitesRm({ json: flags.json ?? false, slug });
        } catch (err: unknown) {
          handleActionError("sites rm", flags.json ?? false, err);
        }
      });

    sitesCli.help();
    sitesCli.version(version);
    sitesCli.parse(["node", "universe-sites", ...sitesArgs]);
    return;
  }

  if (isRepo) {
    const repoArgs = [
      ...args.slice(0, firstPosIdx),
      ...args.slice(firstPosIdx + 1),
    ];
    const repoCli = cac("universe repo");

    repoCli
      .command("create [name]", "Request a new repository (staff only)")
      .option("--json", "Output as JSON")
      .option("--visibility <vis>", "public or private (default: private)")
      .option("--description <text>", "Repository description")
      .option(
        "--template <name>",
        "Org template repo to generate from; omit for a blank repo",
      )
      .option("--yes", "Skip prompts + confirmation (required for non-TTY)")
      .action(
        async (
          name: string | undefined,
          flags: {
            json?: boolean;
            visibility?: string;
            description?: string;
            template?: string;
            yes?: boolean;
          },
        ) => {
          try {
            await repoCreate({
              json: flags.json ?? false,
              name,
              visibility: flags.visibility,
              description: flags.description,
              template: flags.template,
              yes: flags.yes ?? false,
            });
          } catch (err: unknown) {
            handleActionError("repo create", flags.json ?? false, err);
          }
        },
      );

    repoCli
      .command("ls", "List repo requests (default: pending)")
      .option("--json", "Output as JSON")
      .option(
        "--status <status>",
        "pending | approved | active | rejected | failed | all",
      )
      .option("--mine", "Only requests you submitted")
      .action(
        async (flags: { json?: boolean; status?: string; mine?: boolean }) => {
          try {
            await repoLs({
              json: flags.json ?? false,
              status: flags.status,
              mine: flags.mine ?? false,
            });
          } catch (err: unknown) {
            handleActionError("repo ls", flags.json ?? false, err);
          }
        },
      );

    repoCli
      .command(
        "approve <id>",
        "Approve a pending request — creates the repo (admin only)",
      )
      .option("--json", "Output as JSON")
      .option("--yes", "Skip the confirmation prompt")
      .action(async (id: string, flags: { json?: boolean; yes?: boolean }) => {
        try {
          await repoApprove({
            json: flags.json ?? false,
            id,
            yes: flags.yes ?? false,
          });
        } catch (err: unknown) {
          handleActionError("repo approve", flags.json ?? false, err);
        }
      });

    repoCli
      .command("reject <id>", "Reject a pending request (admin only)")
      .option("--json", "Output as JSON")
      .option("--reason <text>", "Reason shown to the requester")
      .option("--yes", "Skip the confirmation prompt")
      .action(
        async (
          id: string,
          flags: { json?: boolean; reason?: string; yes?: boolean },
        ) => {
          try {
            await repoReject({
              json: flags.json ?? false,
              id,
              reason: flags.reason,
              yes: flags.yes ?? false,
            });
          } catch (err: unknown) {
            handleActionError("repo reject", flags.json ?? false, err);
          }
        },
      );

    repoCli
      .command("status <id>", "Show a request's current state")
      .option("--json", "Output as JSON")
      .action(async (id: string, flags: { json?: boolean }) => {
        try {
          await repoStatus({ json: flags.json ?? false, id });
        } catch (err: unknown) {
          handleActionError("repo status", flags.json ?? false, err);
        }
      });

    repoCli.help();
    repoCli.version(version);

    const knownRepoSubs = new Set([
      "create",
      "ls",
      "approve",
      "reject",
      "status",
    ]);
    const repoValueFlags = new Set([
      "--visibility",
      "--description",
      "--template",
      "--status",
      "--reason",
    ]);
    let repoSub: string | undefined;
    for (let i = 0; i < repoArgs.length; i += 1) {
      const a = repoArgs[i];
      if (a === undefined) continue;
      if (repoValueFlags.has(a)) {
        i += 1;
        continue;
      }
      if (!a.startsWith("-")) {
        repoSub = a;
        break;
      }
    }
    const repoJson = repoArgs.includes("--json");
    const repoWantsHelp =
      repoArgs.includes("--help") ||
      repoArgs.includes("-h") ||
      repoArgs.includes("--version");
    if (repoSub === undefined ? !repoWantsHelp : !knownRepoSubs.has(repoSub)) {
      if (repoSub === undefined && !repoJson) {
        repoCli.outputHelp();
      } else {
        outputError(
          { json: repoJson, command: "repo" },
          EXIT_USAGE,
          repoSub === undefined
            ? "missing repo subcommand — run `universe repo --help`"
            : `unknown repo subcommand "${repoSub}" — run \`universe repo --help\``,
        );
      }
      exitWithCode(EXIT_USAGE);
      return;
    }
    try {
      repoCli.parse(["node", "universe-repo", ...repoArgs]);
    } catch (err: unknown) {
      handleActionError("repo", repoJson, err);
    }
    return;
  }

  if (isStatic) {
    // Drop just the `static` token; preserve flags + remaining args
    // (the sub-action like `deploy`, plus any further flags).
    const staticArgs = [
      ...args.slice(0, firstPosIdx),
      ...args.slice(firstPosIdx + 1),
    ];
    const staticCli = cac("universe static");

    staticCli
      .command("deploy", "Deploy static site via the artemis proxy")
      .option("--json", "Output as JSON")
      .option("--promote", "Finalize as production (default: preview)")
      .option("--dir <path>", "Override build.output dir from platform.yaml")
      .action(
        async (flags: { json?: boolean; promote?: boolean; dir?: string }) => {
          try {
            await deploy({
              json: flags.json ?? false,
              promote: flags.promote ?? false,
              dir: flags.dir,
            });
          } catch (err: unknown) {
            handleActionError("deploy", flags.json ?? false, err);
          }
        },
      );

    staticCli
      .command("promote", "Promote the current preview to production")
      .option("--json", "Output as JSON")
      .option(
        "--from <deployId>",
        "Promote a specific past deploy id (alias rewrite)",
      )
      .action(async (flags: { json?: boolean; from?: string }) => {
        try {
          await promote({
            json: flags.json ?? false,
            from: flags.from,
          });
        } catch (err: unknown) {
          handleActionError("promote", flags.json ?? false, err);
        }
      });

    staticCli
      .command("rollback", "Rewrite production alias to a past deploy")
      .option("--json", "Output as JSON")
      .option("--to <deployId>", "Target deploy id (required)")
      .action(async (flags: { json?: boolean; to?: string }) => {
        try {
          await rollback({
            json: flags.json ?? false,
            to: flags.to,
          });
        } catch (err: unknown) {
          handleActionError("rollback", flags.json ?? false, err);
        }
      });

    staticCli
      .command("ls", "List recent deploys for a site")
      .option("--json", "Output as JSON")
      .option("--site <site>", "Override site from platform.yaml")
      .action(async (flags: { json?: boolean; site?: string }) => {
        try {
          await ls({
            json: flags.json ?? false,
            site: flags.site,
          });
        } catch (err: unknown) {
          handleActionError("ls", flags.json ?? false, err);
        }
      });

    staticCli.help();
    staticCli.version(version);
    staticCli.parse(["node", "universe-static", ...staticArgs]);
  } else {
    const cli = cac("universe");

    cli
      .command("login", "Authenticate with GitHub via OAuth device flow")
      .option("--json", "Output as JSON")
      .option("--force", "Replace any existing stored token")
      .action(async (flags: { json?: boolean; force?: boolean }) => {
        try {
          await login({
            json: flags.json ?? false,
            force: flags.force ?? false,
          });
        } catch (err: unknown) {
          handleActionError("login", flags.json ?? false, err);
        }
      });

    cli
      .command("logout", "Remove the stored GitHub device-flow token")
      .option("--json", "Output as JSON")
      .action(async (flags: { json?: boolean }) => {
        try {
          await logout({ json: flags.json ?? false });
        } catch (err: unknown) {
          handleActionError("logout", flags.json ?? false, err);
        }
      });

    cli
      .command("whoami", "Show resolved GitHub identity and authorized sites")
      .option("--json", "Output as JSON")
      .action(async (flags: { json?: boolean }) => {
        try {
          await whoami({ json: flags.json ?? false });
        } catch (err: unknown) {
          handleActionError("whoami", flags.json ?? false, err);
        }
      });

    // Register `static`, `sites`, and `repo` only for help text — the
    // dispatch above intercepts before cac runs, so these are unreachable.
    cli.command("static <subcommand>", "Static site deployment commands");
    cli.command("sites <subcommand>", "Static site registry commands");
    cli.command(
      "repo <subcommand>",
      "Repository creation + approval queue commands",
    );

    cli.help();
    cli.version(version);
    cli.parse(argv);
  }
}
