import { range } from "lodash";

import {
  BadArgumentsError,
  CliError,
  ConfigError,
  ConfirmError,
  CreateUnsupportedCombinationError,
  CreateUnsupportedFrameworkError,
  CreateUnsupportedRuntimeError,
  CredentialError,
  DeploymentError,
  GitError,
  InvalidMultiSelectError,
  InvalidNameError,
  LayerConflictError,
  ListError,
  LogsError,
  ManifestInvalidError,
  ManifestNotFoundError,
  MissingLayerError,
  PackageInstallError,
  PartialUploadError,
  PromotionError,
  RegistrationError,
  RepoInitialisationError,
  RollbackError,
  ScaffoldWriteError,
  StatusError,
  StorageError,
  TargetDirectoryExistsError,
  TeardownError,
} from "./cli-errors.js";
import {
  EXIT_BAD_ARGUMENTS,
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_DEPLOYMENT,
  EXIT_GIT,
  EXIT_INVALID_MULTI_SELECT,
  EXIT_INVALID_NAME,
  EXIT_LAYER,
  EXIT_LIST,
  EXIT_LOGS,
  EXIT_MANIFEST,
  EXIT_PACKAGE_INSTALL,
  EXIT_PARTIAL,
  EXIT_PROMOTION,
  EXIT_REGISTRATION,
  EXIT_REPO_INITIALISATION,
  EXIT_ROLLBACK,
  EXIT_SCAFFOLD_WRITE,
  EXIT_STATUS,
  EXIT_STORAGE,
  EXIT_TARGET_EXISTS,
  EXIT_TEARDOWN,
  EXIT_UNSUPPORTED,
} from "./exit-codes.js";

describe("error exit codes", () => {
  let errors: CliError[];

  beforeAll(() => {
    errors = [
      new DeploymentError("my-app", "timeout"),
      new InvalidMultiSelectError("databases"),
      new InvalidNameError("x"),
      new LayerConflictError("src/index.ts", "base/nodejs", "frameworks/express"),
      new ManifestInvalidError("/projects/my-app/platform.yaml", "missing field: name"),
      new ManifestNotFoundError("/projects/my-app/platform.yaml"),
      new MissingLayerError("base/nodejs"),
      new ListError("my-app", "unavailable"),
      new RegistrationError("my-app", "already registered"),
      new ScaffoldWriteError("/tmp/x", new Error("disk full")),
      new StatusError("my-app", "unavailable"),
      new TargetDirectoryExistsError("/tmp/x"),
      new TeardownError("my-app", "unavailable"),
      new CreateUnsupportedCombinationError("static + database"),
      new CreateUnsupportedFrameworkError("fastify", "nodejs"),
      new CreateUnsupportedRuntimeError("python"),
      new BadArgumentsError("bad args"),
      new ConfigError("config missing"),
      new CredentialError("not authenticated"),
      new StorageError("upload failed"),
      new GitError("not a git repo"),
      new ConfirmError("user cancelled"),
      new PartialUploadError("3 files failed"),
    ];
  });

  it("avoids exit codes with special meanings", () => {
    const codes = errors.map((e) => e.exitCode);

    // Not including 126
    const allowedCodes = range(3, 126);

    for (const code of codes) {
      expect(allowedCodes).toContain(code);
    }
  });

  it("deploy/scaffold errors carry correct exit codes (group 1)", () => {
    expect(new DeploymentError("x", "y").exitCode).toBe(EXIT_DEPLOYMENT);
    expect(new InvalidMultiSelectError("f").exitCode).toBe(EXIT_INVALID_MULTI_SELECT);
    expect(new InvalidNameError("x").exitCode).toBe(EXIT_INVALID_NAME);
    expect(new LayerConflictError("f", "a", "b").exitCode).toBe(EXIT_LAYER);
    expect(new ManifestInvalidError("p", "r").exitCode).toBe(EXIT_MANIFEST);
  });

  it("scaffold errors carry correct exit codes (group 2)", () => {
    expect(new ManifestNotFoundError("p").exitCode).toBe(EXIT_MANIFEST);
    expect(new MissingLayerError("l").exitCode).toBe(EXIT_LAYER);
    expect(new ListError("x", "y").exitCode).toBe(EXIT_LIST);
    expect(new RegistrationError("x", "y").exitCode).toBe(EXIT_REGISTRATION);
    expect(new ScaffoldWriteError("p", new Error()).exitCode).toBe(EXIT_SCAFFOLD_WRITE);
  });

  it("scaffold/create errors carry correct exit codes (group 3)", () => {
    expect(new StatusError("x", "y").exitCode).toBe(EXIT_STATUS);
    expect(new TargetDirectoryExistsError("p").exitCode).toBe(EXIT_TARGET_EXISTS);
    expect(new TeardownError("x", "y").exitCode).toBe(EXIT_TEARDOWN);
    expect(new CreateUnsupportedCombinationError("d").exitCode).toBe(EXIT_UNSUPPORTED);
    expect(new CreateUnsupportedFrameworkError("f", "r").exitCode).toBe(EXIT_UNSUPPORTED);
  });

  it("create/auth errors carry correct exit codes (group 4)", () => {
    expect(new CreateUnsupportedRuntimeError("r").exitCode).toBe(EXIT_UNSUPPORTED);
    expect(new BadArgumentsError("b").exitCode).toBe(EXIT_BAD_ARGUMENTS);
    expect(new ConfigError("c").exitCode).toBe(EXIT_CONFIG);
    expect(new CredentialError("c").exitCode).toBe(EXIT_CREDENTIALS);
    expect(new StorageError("s").exitCode).toBe(EXIT_STORAGE);
  });

  it("git/confirm/partial errors carry correct exit codes (group 5)", () => {
    expect(new GitError("g").exitCode).toBe(EXIT_GIT);
    expect(new ConfirmError("c").exitCode).toBe(EXIT_CONFIRM);
    expect(new PartialUploadError("p").exitCode).toBe(EXIT_PARTIAL);
  });

  it("logsError carries EXIT_LOGS", () => {
    expect(new LogsError("x", "y").exitCode).toBe(EXIT_LOGS);
  });

  it("promotionError carries EXIT_PROMOTION", () => {
    expect(new PromotionError("x", "y").exitCode).toBe(EXIT_PROMOTION);
  });

  it("rollbackError carries EXIT_ROLLBACK", () => {
    expect(new RollbackError("x", "y").exitCode).toBe(EXIT_ROLLBACK);
  });

  it("packageInstallError carries EXIT_PACKAGE_INSTALL", () => {
    expect(new PackageInstallError("x").exitCode).toBe(EXIT_PACKAGE_INSTALL);
  });

  it("repoInitialisationError carries EXIT_REPO_INITIALISATION", () => {
    expect(new RepoInitialisationError("x").exitCode).toBe(EXIT_REPO_INITIALISATION);
  });
});

describe(CliError, () => {
  it("acts as the shared base class for typed CLI errors", () => {
    const error = new InvalidNameError("bad-name");

    expect(error).toBeInstanceOf(CliError);
  });
});

describe(BadArgumentsError, () => {
  it("passes the message through without modification", () => {
    const error = new BadArgumentsError("bad args");

    expect(error.message).toBe("bad args");
  });
});

describe(InvalidNameError, () => {
  it("includes the invalid name in the message", () => {
    const error = new InvalidNameError("bad_NAME");

    expect(error.message).toBe(
      'Invalid project name "bad_NAME". Names must be lowercase kebab-case, start with a letter, and be 3–50 characters long.',
    );
  });
});

describe(TargetDirectoryExistsError, () => {
  it("includes the path in the message", () => {
    const error = new TargetDirectoryExistsError("/projects/my-app");

    expect(error.message).toBe(
      'Target directory already exists: "/projects/my-app". Choose a different name or remove the existing directory.',
    );
  });
});

describe(CreateUnsupportedRuntimeError, () => {
  it("includes the runtime name in the message", () => {
    const error = new CreateUnsupportedRuntimeError("python");

    expect(error.message).toBe(
      'Runtime "python" is not supported in this spike. Supported runtimes: Node.js (TypeScript), Static.',
    );
  });
});

describe(CreateUnsupportedFrameworkError, () => {
  it("includes the framework and runtime in the message", () => {
    const error = new CreateUnsupportedFrameworkError("fastify", "nodejs");

    expect(error.message).toBe(
      'Framework "fastify" is not supported for runtime "nodejs" in this spike.',
    );
  });
});

describe(CreateUnsupportedCombinationError, () => {
  it("includes the combination description in the message", () => {
    const error = new CreateUnsupportedCombinationError("static + PostgreSQL");

    expect(error.message).toBe("Unsupported combination in this spike: static + PostgreSQL.");
  });
});

describe(InvalidMultiSelectError, () => {
  it("includes the field name in the message", () => {
    const error = new InvalidMultiSelectError("databases");

    expect(error.message).toBe(
      'Invalid selection for "databases": "None" cannot be combined with other selections.',
    );
  });
});

describe(MissingLayerError, () => {
  it("includes the layer path in the message", () => {
    const error = new MissingLayerError("base/nodejs");

    expect(error.message).toBe('Required template layer not found: "base/nodejs".');
  });
});

describe(LayerConflictError, () => {
  it("includes the file path and both layer names in the message", () => {
    const error = new LayerConflictError("src/index.ts", "base/nodejs", "frameworks/express");

    expect(error.message).toBe(
      'File path conflict: "src/index.ts" exists in both "base/nodejs" and "frameworks/express". Non-configuration files cannot be merged.',
    );
  });
});

describe(ScaffoldWriteError, () => {
  it("includes the path and cause message", () => {
    const cause = new Error("disk full");
    const error = new ScaffoldWriteError("/projects/my-app", cause);

    expect(error.message).toBe('Failed to write scaffold to "/projects/my-app": disk full');
  });
});

describe(ManifestNotFoundError, () => {
  it("includes the attempted path in the message", () => {
    const error = new ManifestNotFoundError("/projects/my-app/platform.yaml");

    expect(error.message).toBe(
      'Platform manifest not found at "/projects/my-app/platform.yaml". Run "universe create" to scaffold a project first.',
    );
  });
});

describe(ManifestInvalidError, () => {
  it("includes the path and reason in the message", () => {
    const error = new ManifestInvalidError("/projects/my-app/platform.yaml", "missing field: name");

    expect(error.message).toBe(
      'Platform manifest at "/projects/my-app/platform.yaml" is invalid: missing field: name',
    );
  });
});

describe(RegistrationError, () => {
  it("includes the project name and reason in the message", () => {
    const error = new RegistrationError("my-app", "already registered");

    expect(error.message).toBe('Failed to register project "my-app": already registered');
  });
});

describe(DeploymentError, () => {
  it("includes the project name and reason in the message", () => {
    const error = new DeploymentError("my-app", "timeout");

    expect(error.message).toBe('Failed to deploy project "my-app": timeout');
  });
});

describe(StatusError, () => {
  it("includes the project name and reason in the message", () => {
    const error = new StatusError("my-app", "unavailable");

    expect(error.message).toBe('Failed to retrieve status for project "my-app": unavailable');
  });
});

describe(ListError, () => {
  it("includes the project name and reason in the message", () => {
    const error = new ListError("my-app", "unavailable");

    expect(error.message).toBe('Failed to list deployments for project "my-app": unavailable');
  });
});

describe(TeardownError, () => {
  it("includes the project name and reason in the message", () => {
    const error = new TeardownError("my-app", "unavailable");

    expect(error.message).toBe('Failed to tear down project "my-app": unavailable');
    expect(error.exitCode).toBeGreaterThan(0);
  });
});

describe(ConfigError, () => {
  it("has the correct error name", () => {
    expect(new ConfigError("msg").name).toBe("ConfigError");
  });
});

describe(CredentialError, () => {
  it("has the correct error name", () => {
    expect(new CredentialError("msg").name).toBe("CredentialError");
  });
});

describe(StorageError, () => {
  it("has the correct error name", () => {
    expect(new StorageError("msg").name).toBe("StorageError");
  });
});

describe(GitError, () => {
  it("has the correct error name", () => {
    expect(new GitError("msg").name).toBe("GitError");
  });
});

describe(ConfirmError, () => {
  it("has the correct error name", () => {
    expect(new ConfirmError("msg").name).toBe("ConfirmError");
  });
});

describe(PartialUploadError, () => {
  it("has the correct error name", () => {
    expect(new PartialUploadError("msg").name).toBe("PartialUploadError");
  });
});
