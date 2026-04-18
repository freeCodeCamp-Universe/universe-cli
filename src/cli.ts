import { cac } from "cac";
import { deploy } from "./commands/deploy.js";
import { promote } from "./commands/promote.js";
import { rollback } from "./commands/rollback.js";
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

export function run(argv = process.argv) {
  const args = argv.slice(2);

  if (args[0] === "static") {
    const staticCli = cac("universe static");

    staticCli
      .command("deploy", "Deploy static site to S3")
      .option("--json", "Output as JSON")
      .option("--force", "Force deploy without git hash")
      .option("--output-dir <dir>", "Build output directory")
      .action(
        async (flags: {
          json?: boolean;
          force?: boolean;
          outputDir?: string;
        }) => {
          try {
            await deploy({
              json: flags.json ?? false,
              force: flags.force ?? false,
              ...(flags.outputDir !== undefined
                ? { outputDir: flags.outputDir }
                : {}),
            });
          } catch (err: unknown) {
            handleActionError("deploy", flags.json ?? false, err);
          }
        },
      );

    staticCli
      .command("promote [deploy-id]", "Promote a deploy to production")
      .option("--json", "Output as JSON")
      .action(
        async (deployId: string | undefined, flags: { json?: boolean }) => {
          try {
            await promote({
              json: flags.json ?? false,
              ...(deployId !== undefined ? { deployId } : {}),
            });
          } catch (err: unknown) {
            handleActionError("promote", flags.json ?? false, err);
          }
        },
      );

    staticCli
      .command("rollback", "Rollback production to previous deploy")
      .option("--json", "Output as JSON")
      .option("--confirm", "Confirm rollback")
      .action(async (flags: { json?: boolean; confirm?: boolean }) => {
        try {
          await rollback({
            json: flags.json ?? false,
            confirm: flags.confirm ?? false,
          });
        } catch (err: unknown) {
          handleActionError("rollback", flags.json ?? false, err);
        }
      });

    staticCli.help();
    staticCli.version(version);
    staticCli.parse(["node", "universe-static", ...args.slice(1)]);
  } else {
    const cli = cac("universe");
    cli
      .command("static [...args]", "Static site deployment commands")
      .action(() => {
        console.log("Run: universe static --help");
      });
    cli.help();
    cli.version(version);
    cli.parse(argv);
  }
}
