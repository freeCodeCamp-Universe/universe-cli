import type { HandlerResult } from "./commands/create/index.js";
import type { ObservabilityClient } from "./observability/observability-client.port.js";

import { runCli } from "./cli.js";
import { CliError } from "./errors/cli-errors.js";
import type { MockedFunction } from "vitest";

describe(runCli, () => {
  let stderrSpy: MockedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true) as MockedFunction<
      typeof process.stdout.write
    >;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  const makeTracking = () => {
    const trackedEvents: string[] = [];
    const obs: ObservabilityClient = {
      error() {},
      safeError() {},
      safeTrack(event: string) {
        trackedEvents.push(event);
      },
      track() {},
    };
    return { obs, trackedEvents };
  };

  const successHandler = (): Promise<HandlerResult> => Promise.resolve({ exitCode: 0 });
  const failureHandler = (): Promise<HandlerResult> => Promise.reject(new Error("Command failed"));

  const commands = [
    ["create"],
    ["register"],
    ["deploy"],
    ["promote"],
    ["rollback"],
    ["logs"],
    ["status"],
    ["list"],
    ["teardown"],
  ];

  it.each(commands)(
    "tracks <command>.start and <command>.success on a successful %s call",
    async ([command]) => {
      const { obs, trackedEvents } = makeTracking();
      await runCli(command!, successHandler, obs);

      expect(trackedEvents).toContain(`${command}.start`);
      expect(trackedEvents).toContain(`${command}.success`);
    },
  );

  it.each(commands)(
    "tracks <command>.start and <command>.failure if the %s handler throws an error",
    async ([command]) => {
      const { obs, trackedEvents } = makeTracking();
      await runCli(command!, () => Promise.reject(new CliError("app", 7)), obs);

      expect(trackedEvents).toContain(`${command}.start`);
      expect(trackedEvents).toContain(`${command}.failure`);
    },
  );

  it("re-throws non-CliError exceptions", async () => {
    const { obs } = makeTracking();
    await expect(runCli("deploy", failureHandler, obs)).rejects.toThrow("Command failed");
  });
});
