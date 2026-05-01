# Universe CLI Spike — Summary

## Project

- **Name:** universe-cli
- **Type:** planning + prototype spike (no real platform dependencies)
- **Primary user:** platform engineers validating CLI architecture before real platform APIs exist

## Problem Statement

Universe CLI is defined in ADR-007, but the backing platform does not exist yet and the original spike scope is too broad. We need one meaningful vertical slice that proves the CLI architecture, prompt UX, layer composition, and stub strategy without attempting to simulate the full platform lifecycle.

## Goals

- Deliver a runnable local prototype of the `universe` CLI with **all 9 ADR-007 commands visible**.
- Fully implement **only** `universe create` in this spike.
- Ensure the other 8 commands execute as deterministic stubs that return a standardized “not implemented in spike” error.
- Keep all code and tests isolated from external/platform dependencies.
- Define stable internal interfaces for template resolution, filesystem writes, and future command expansion.

## Non-Goals

- No real provisioning (GitHub repo creation, DNS writes, OIDC registration, DB provisioning, ArgoCD changes).
- No simulated registration/deploy/promotion/rollback lifecycle in this spike.
- No non-interactive CLI flags for `create` in this spike.
- No attempt to support the full runtime × framework × service matrix from ADR-007.
- No production-hardening, security/compliance certification, or SLO guarantees in spike phase.

## Constraints

- Follow ADR-007 command model, terminology, and two-step flow (`create` then `register`).
- Use stubs as the only integration surface for prototype and tests.
- Keep architecture intentionally replaceable via explicit ports/adapters.
- Prefer deterministic local execution and hermetic tests.
- Preserve the public command surface for all 9 ADR-007 commands.

## Success Metrics

- `universe --help` shows all 9 ADR-007 commands.
- `universe create` completes interactive scaffolding locally with passing tests.
- The other 8 commands return a standardized non-zero “not implemented in spike” error with passing tests.
- 0 test dependencies on external network/platform systems.
- New engineer can run prototype and tests locally in <15 minutes.

## Proposed Technical Direction

- **CLI shell:** TypeScript + `clack` (per ADR-007).
- **Architecture:** Hexagonal style:
  - Command handlers (application layer)
  - Port interfaces (domain/application boundary)
  - Stub adapters (infrastructure boundary)
- **State model for spike:** no lifecycle state store required beyond what `create` needs to scaffold files locally.
- **Error handling:**
  - All command handlers validate their arguments and throw a `BadArgumentsError` (exit code 18) for invalid or excessive arguments, ensuring consistent CLI error handling and messaging for argument validation failures.
- **Testing:**
  - Unit tests for prompt validation and layer selection
  - Contract tests for template/layer and filesystem ports
  - Golden/snapshot tests for key UX text where stable
  - CLI tests for `create` and stubbed-command behavior
  - Integration tests (see `src/integration-tests/`) that iterate every allowed runtime/framework/services combination and verify project-folder creation for each successful flow

## Command Scope (ADR-007)

1. `universe create` — fully implemented in this spike
2. `universe register` — standardized stub
3. `universe deploy` — standardized stub
4. `universe promote` — standardized stub
5. `universe rollback` — standardized stub
6. `universe logs <name>` — standardized stub
7. `universe status <name>` — standardized stub
8. `universe list` — standardized stub
9. `universe teardown` — standardized stub

## `universe create` Spike Boundary

### Supported prompt flow

- Name
- Runtime
- Framework
- Database selection (multi-select)
- Platform services selection (multi-select)
- Confirmation summary

### Prompt rules

- Prompt order is fixed: Name → Runtime → Framework → Databases → Platform services → Confirmation.
- Name must be lowercase kebab-case, start with a letter, and be 3–50 characters long.
- Framework options are filtered by the selected runtime.
- `None` is explicit in multi-select groups and excludes all other selections in that group.
- No files are written until the confirmation step succeeds.

### Supported combinations in this spike

- **Node.js (TypeScript)**
  - Framework: Express or None
  - Databases: PostgreSQL, Redis, or None
  - Platform services: Auth, Email, Analytics, or None
- **Static (HTML/CSS/JS)**
  - Framework: None only
  - Databases: None only
  - Platform services: None only
- Any other runtime, framework, database, or service combination is unsupported in this spike.

### Required generated artifacts

- Project folder
- Runtime-specific starter source files
- `platform.yaml`
- `README.md`
- `docker-compose.dev.yml`
- `Procfile`
- `.gitignore`

### Runtime-specific starter files

- **Node.js (TypeScript):** `src/index.ts`, `package.json`, `tsconfig.json`
- **Static:** `public/index.html`, `public/styles.css`, `public/main.js`

### Static scaffold shape

- Static projects place HTML, CSS, and JS assets in a `public/` folder.
- Static projects use `serve` for local development.
- `docker-compose.dev.yml` runs the static webserver to preserve the unified DX.
- `Procfile` starts the same simple webserver against `public/`.

### Required behavior

- Deterministic layer composition from selected runtime/framework/services.
- Layer composition order is fixed: `always/` → `base/{runtime}` → `frameworks/{framework}` → `services/{each}` in stable sorted order.
- Clear validation errors for invalid names, invalid combinations, existing target directory, and missing layers.
- Only configuration files (`.json`, `.yaml`, `.yml`) are merged across layers in this spike.
- Configuration merge is additive by default; direct key conflicts are overwritten by later layers in resolution order.
- Any non-configuration file path collision fails with a typed conflict error.
- Conflicts introduced within the same layer stage fail with a typed conflict error.
- Every generated project, including `Static`, includes a `docker-compose.dev.yml` to preserve a unified local development workflow.
- Local-only scaffolding: no registration/provisioning mutations.
- No partial scaffold remains after unrecoverable generation failure.
- One-time snapshot output: generated files are owned by the developer after creation.

### Port interfaces in scope

- `Prompt` for interactive selection collection
- `FilesystemWriter` for scaffold creation with rollback-on-failure behavior
- `ObservabilityClient` for non-blocking stub telemetry

### Internal services in scope

- `CreateInputValidationService` for create-name rules and runtime/framework/services compatibility checks (application logic, not a port)
- `LayerCompositionService` for deterministic ordered layer resolution, conflict detection, and config merging — owns the default layer registry as internal scaffolding data (application logic, not a port)
- `PlatformManifestService` for `platform.yaml` construction from create selections — future schema validation and serialisation extend this service, not a new port/adapter (application logic, not a port)

### Error categories in scope

- `InvalidNameError`
- `TargetDirectoryExistsError`
- `CreateUnsupportedRuntimeError`
- `CreateUnsupportedFrameworkError`
- `CreateUnsupportedCombinationError`
- `InvalidMultiSelectError`
- `MissingLayerError`
- `LayerConflictError`
- `ScaffoldWriteError`
- `DeferredCommandError`

### Explicitly deferred

- Python, Go, Next.js, Fastify, Hono, Flask, MongoDB, SQLite.
- Non-interactive mode.
- Static databases or platform services.
- Real platform integration and all post-`create` workflows.

## Risks

- The reduced matrix may omit paths later considered essential.
- Future command work may want shared infrastructure not needed by `create`.
- UX may drift if the stubbed commands do not share final error conventions.

## Mitigations

- Make unsupported paths explicit in docs and error messages.
- Define shared error taxonomy and command runner conventions now.
- Record matrix expansion triggers in the assumptions register.

## Open Questions & Assumptions

- **Assumption:** CLI package distribution and release pipeline are out of scope for this spike.
- **Assumption:** interactive-only `create` is sufficient to validate UX and architecture.
- **Assumption:** a curated matrix is preferable to partial implementations of all ADR-007 options.
- **Assumption:** every generated project, including `Static`, includes `docker-compose.dev.yml` to preserve a unified DX.
- **Open Question:** whether `serve` should be provided via project dependencies, container image defaults, or another packaging path.
