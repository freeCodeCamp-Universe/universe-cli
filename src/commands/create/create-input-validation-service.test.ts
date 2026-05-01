import {
  CreateUnsupportedCombinationError,
  CreateUnsupportedFrameworkError,
  CreateUnsupportedRuntimeError,
  InvalidNameError,
  TargetDirectoryExistsError,
} from "../../errors/cli-errors.js";
import type { CreateSelections, PackageManagerOption } from "./prompt/prompt.port.js";
import { CreateInputValidationService } from "./create-input-validation-service.js";

const validNodeSelection: CreateSelections = {
  confirmed: true,
  databases: ["postgresql"],
  framework: "express",
  name: "hello-universe",
  packageManager: "pnpm",
  platformServices: ["auth"],
  runtime: "node",
};

describe(CreateInputValidationService, () => {
  it("accepts supported Node.js combinations", () => {
    const service = new CreateInputValidationService(() => false);

    const result = service.validateCreateInput(validNodeSelection);

    expect(result).toStrictEqual(validNodeSelection);
  });

  it("accepts bun as package manager for Node runtime", () => {
    const service = new CreateInputValidationService(() => false);

    const result = service.validateCreateInput({
      ...validNodeSelection,
      packageManager: "bun",
    });

    expect(result.packageManager).toBe("bun");
  });

  it("accepts supported Static combination", () => {
    const service = new CreateInputValidationService(() => false);

    const result = service.validateCreateInput({
      confirmed: true,
      databases: [],
      framework: "html-css-js",
      name: "site-app",
      packageManager: "pnpm",
      platformServices: [],
      runtime: "static_web",
    });

    expect(result.runtime).toBe("static_web");
  });

  it("rejects invalid project names with typed errors", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        ...validNodeSelection,
        name: "InvalidName",
      });

    expect(act).toThrow(InvalidNameError);
  });

  it("rejects existing target directory with typed errors", () => {
    const service = new CreateInputValidationService(() => true);

    const act = () => service.validateCreateInput(validNodeSelection);

    expect(act).toThrow(TargetDirectoryExistsError);
  });

  it("rejects unsupported runtimes", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        ...validNodeSelection,
        runtime: "Python" as CreateSelections["runtime"],
      });

    expect(act).toThrow(CreateUnsupportedRuntimeError);
  });

  it("rejects unsupported frameworks for Node runtime", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        ...validNodeSelection,
        framework: "Flask" as CreateSelections["framework"],
      });

    expect(act).toThrow(CreateUnsupportedFrameworkError);
  });

  it("rejects missing package manager for Node runtime", () => {
    const service = new CreateInputValidationService(() => false);
    const { packageManager: _pm, ...selectionWithoutPm } = validNodeSelection;

    const act = () => service.validateCreateInput(selectionWithoutPm);

    expect(act).toThrow(CreateUnsupportedCombinationError);
  });

  it("rejects unsupported package manager for Node runtime", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        ...validNodeSelection,
        packageManager: "npm" as unknown as PackageManagerOption,
      });

    expect(act).toThrow(CreateUnsupportedCombinationError);
  });

  it("rejects missing package manager for static_web runtime", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        confirmed: true,
        databases: [],
        framework: "html-css-js",
        name: "site-app",
        platformServices: [],
        runtime: "static_web",
      });

    expect(act).toThrow(CreateUnsupportedCombinationError);
  });

  it("rejects unsupported Static database combinations", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        confirmed: true,
        databases: ["postgresql"],
        framework: "html-css-js",
        name: "site-app",
        packageManager: "pnpm",
        platformServices: [],
        runtime: "static_web",
      });

    expect(act).toThrow(CreateUnsupportedCombinationError);
  });

  it("rejects unsupported Static platform service combinations", () => {
    const service = new CreateInputValidationService(() => false);

    const act = () =>
      service.validateCreateInput({
        confirmed: true,
        databases: [],
        framework: "html-css-js",
        name: "site-app",
        packageManager: "pnpm",
        // @ts-expect-error forcing invalid platform service
        platformServices: ["fake"],
        runtime: "static_web",
      });

    expect(act).toThrow(CreateUnsupportedCombinationError);
  });
});
