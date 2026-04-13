import { cac } from "cac";
import { createRequire } from "node:module";
import { type OutputContext, outputError } from "./output/format.js";
import { EXIT_USAGE, exitWithCode } from "./output/exit-codes.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

function handleActionError(command: string, err: unknown): void {
  const ctx: OutputContext = { json: false, command };
  const message = err instanceof Error ? err.message : "unknown error";
  outputError(ctx, EXIT_USAGE, message);
  exitWithCode(EXIT_USAGE, message);
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
            const { deploy } = await import("./commands/deploy.js");
            await deploy({
              json: flags.json ?? false,
              force: flags.force ?? false,
              outputDir: flags.outputDir,
            });
          } catch (err: unknown) {
            handleActionError("deploy", err);
          }
        },
      );

    staticCli
      .command("promote [deploy-id]", "Promote a deploy to production")
      .option("--json", "Output as JSON")
      .action(
        async (deployId: string | undefined, flags: { json?: boolean }) => {
          try {
            const { promote } = await import("./commands/promote.js");
            await promote({ json: flags.json ?? false, deployId });
          } catch (err: unknown) {
            handleActionError("promote", err);
          }
        },
      );

    staticCli
      .command("rollback", "Rollback production to previous deploy")
      .option("--json", "Output as JSON")
      .option("--confirm", "Confirm rollback")
      .action(async (flags: { json?: boolean; confirm?: boolean }) => {
        try {
          const { rollback } = await import("./commands/rollback.js");
          await rollback({
            json: flags.json ?? false,
            confirm: flags.confirm ?? false,
          });
        } catch (err: unknown) {
          handleActionError("rollback", err);
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
