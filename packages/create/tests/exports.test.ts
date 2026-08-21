import { describe, expect, expectTypeOf, it } from "vitest";

import * as sdk from "../src/index.js";
import type {
  CommandDriver,
  CommandResult,
  CreateDeps,
  CreateOptions,
  Envelope,
  Step,
  StepHandler,
  StepResponse,
} from "../src/index.js";

describe("create package exports", () => {
  it("exposes only the supported runtime API", () => {
    expect(Object.keys(sdk).sort()).toEqual([
      "ConfigError",
      "GitError",
      "UsageError",
      "clackDriver",
      "create",
      "drive",
      "emitJson",
      "exitWithCode",
      "logError",
      "logSuccess",
      "outputError",
      "silentDrive",
    ]);
    expect(sdk).not.toHaveProperty("createHandler");
    expect(sdk).not.toHaveProperty("buildEnvelope");
    expect(sdk).not.toHaveProperty("LayerCompositionService");
  });

  it("exposes the supported protocol types from the package root", () => {
    expectTypeOf<CommandDriver>().toBeFunction();
    expectTypeOf<StepHandler>().toBeFunction();
    expectTypeOf<CommandResult>().toBeObject();
    expectTypeOf<CreateDeps>().toBeObject();
    expectTypeOf<CreateOptions>().toBeObject();
    expectTypeOf<Envelope>().toBeObject();
    expectTypeOf<Step>().toBeObject();
    expectTypeOf<StepResponse>().not.toBeNever();
  });
});
