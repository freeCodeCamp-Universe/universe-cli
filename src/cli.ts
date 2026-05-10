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
import { type OutputContext, outputError } from "./output/format.js";
import { EXIT_USAGE, exitWithCode } from "./output/exit-codes.js";
import { CliError } from "./errors.js";

declare const __VERSION__: string;
const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0";

function handleActionError(command: string, json: boolean, err: unknown): void {
  const ctx: OutputContext = { json, command };
  const message = err instanceof Error ? err.message : "unknown error";
  const code = err instanceof CliError ? err.exitCode : EXIT_USAGE;
  outputError(ctx, code, message);
  exitWithCode(code, message);
}

/**
 * cac (v6.7.x) does not support nested subcommands — it matches against
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
  const args = argv.slice(2);
  const firstPosIdx = findFirstPositional(args);
  const namespace = firstPosIdx >= 0 ? args[firstPosIdx] : undefined;
  const isStatic = namespace === "static";
  const isSites = namespace === "sites";

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
      .command("ls", "List every registered site")
      .option("--json", "Output as JSON")
      .action(async (flags: { json?: boolean }) => {
        try {
          await sitesLs({ json: flags.json ?? false });
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

    // Register `static` and `sites` only for help text — the dispatch
    // above intercepts before cac runs, so these actions are unreachable.
    cli.command("static <subcommand>", "Static site deployment commands");
    cli.command("sites <subcommand>", "Static site registry commands");

    cli.help();
    cli.version(version);
    cli.parse(argv);
  }
}
