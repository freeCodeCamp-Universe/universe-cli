import { describe, expect, it } from "vitest";
import { UsageError, buildEnvelope, clackDriver, silentDrive } from "@freecodecamp/universe-core";
import type { Step, StepResponse } from "@freecodecamp/universe-core";

async function* command(): AsyncGenerator<Step, string, StepResponse> {
  const confirmed = yield {
    type: "confirm",
    field: "confirmed",
    message: "Continue?",
  };
  return confirmed === false ? "silent" : "interactive";
}

describe("core package root", () => {
  it("provides a working silent driver", async () => {
    const result = await silentDrive(command());

    expect(result).toBe("silent");
  });

  it("provides shared errors and envelopes", () => {
    const error = new UsageError("invalid input");
    const envelope = buildEnvelope("create", false, { code: error.exitCode });

    expect(envelope).toEqual({
      schemaVersion: "1",
      command: "create",
      success: false,
      timestamp: expect.any(String),
      code: 10,
    });
  });

  it("exports the interactive driver", () => {
    expect(clackDriver).toBeTypeOf("function");
  });
});
