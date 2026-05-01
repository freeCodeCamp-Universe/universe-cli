# PRD — Universe CLI Spike (Create-First, Stub-First)

## 1) Overview

Build a prototype of the `universe` CLI that preserves the 9-command ADR-007 surface using a contract-first, stub-backed methodology: for each command, define the port contracts for the platform services it requires, implement stub adapters that simulate those services' behaviour, then implement the command against those contracts. This decouples CLI architecture from the details of platform services that do not yet exist.

`create` is the first command delivered through this cycle. Commands whose port contracts have not yet been defined emit a standardized `DeferredCommandError`; `register` is the next command to go through the full cycle, with contract definition as the implementation gate.

## 1.1) CLI Layer Responsibility Architecture

The CLI is structured across three layers with distinct concerns:

### `bin.ts` — Argument Parsing, Routing, and Dependency Wiring

Owns all logic before command dispatch:

1. Parse `process.argv`
2. If `--help` / `-h` / no command provided: print help text, set exit code, exit (never calls `runCli`)
3. If unknown command: print error, set exit code, exit (never calls `runCli`)
4. Validate argv shape for the matched command (arg counts, valid env values); on failure: print error, set exit code, exit
5. Construct all concrete adapters and services
6. Bind deps to the matched handler, producing a zero-argument thunk `() => Promise<HandlerResult>`
7. Call `runCli(command, thunk, observability)`

### `cli.ts` (`runCli`) — Dispatch and Observability

Owns only command execution and observability:

```ts
const runCli = async (
  command: string,
  handler: () => Promise<HandlerResult>,
  observability: ObservabilityClient,
): Promise<CliResult>
```

- Calls `observability.safeTrack(`${command}.start`)`
- Awaits `handler()`
- On success: calls `observability.safeTrack(`${command}.success`, result.meta)`
- On `CliError`: calls `observability.safeError` + `safeTrack(`${command}.failure`)`, returns error exit code
- On unknown error: rethrows

`cli.ts` has no knowledge of `argv`, `Services`, `Adapters`, or command names beyond the string passed in.

### `commands.ts` — Command Implementation

Each handler receives a flat deps object with exactly the members it needs. There is no shared `Deps` interface or `Services`/`Adapters` nesting. Each handler declares its own inline dep type:

```ts
// Example: handler receives only the dependencies it uses
const handleDeploy = async (
  { projectDirectory },
  deps: {
    platformManifestGenerator: PlatformManifestGenerator;
    deployClient: DeployClient;
    projectReader: ProjectReaderPort;
  },
)
```

The `HandlerResult` and `CliResult` types are exported and shared, but `Services` and `Adapters` interfaces are not used in handler contracts.

## 2) Users

- **Primary:** Platform engineers designing and validating CLI architecture.
- **Secondary:** Early internal developers evaluating command ergonomics.

## 3) User Stories

| As a…              | I want to…                                                       | So that…                                                                   |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| platform engineer  | expose all CLI commands locally against deterministic stubs      | I can validate the public command surface before platform services exist   |
| platform engineer  | define port contracts before implementing each command           | I can prove the CLI architecture without depending on real service details |
| platform engineer  | implement commands against stub adapters that simulate behaviour | I can test the full command flow end-to-end before real services exist     |
| platform engineer  | implement `universe create` first with tests and contracts       | I can reduce risk and validate the highest-value workflow early            |
| platform engineer  | swap stubbed infrastructure for real adapters later              | I can migrate with minimal command-layer rewrites                          |
| internal developer | use `universe create` to scaffold a constellation locally        | I can experience intended onboarding UX early                              |
| platform engineer  | reject unsupported combinations clearly                          | I can keep the spike small without confusing users                         |

## 4) Functional Requirements

### FR-1 Public Command Surface

Expose all commands defined in ADR-007:

- `create`, `register`, `deploy`, `promote`, `rollback`, `logs`, `status`, `list`, `teardown`.

**Acceptance Criteria**

- Running `universe --help` shows all 9 commands.
- Commands whose port contracts have been defined and whose stub adapters have been implemented are fully implemented.
- Commands whose port contracts have not yet been defined emit a standardized `DeferredCommandError`.
- All commands validate their arguments and throw a `BadArgumentsError` for invalid or excessive arguments, ensuring consistent error handling and messaging for argument validation failures.
- The standardized non-implemented contract defines one exact message template and one exact exit code, shared by all commands still in the deferred state.

### FR-2 `create` Local Scaffolding Flow

`create` must implement the local half of ADR-007’s two-step creation flow.

**Acceptance Criteria**

- `create` scaffolds files locally and exits without platform state changes.
- `create` is interactive-only in this spike.
- Successful execution ends with a clear local success message.

### FR-3 `create` Prompt Model

`create` must prompt for the key ADR-007 inputs needed for local scaffolding.

**Acceptance Criteria**

- Prompts collect: name, runtime, framework, databases, platform services.
- Prompt order is deterministic and optimized for interactive use.
- Invalid selections receive actionable feedback.

**Prompt Contract**

`universe create` uses this prompt order:

1. Name
2. Runtime
3. Framework
4. Databases
5. Platform services
6. Confirmation

**Acceptance Criteria**

- `Name` is required and validated before scaffolding.
- `Name` must be lowercase kebab-case, start with a letter, and be 3–50 characters long.
- `Framework` options are filtered by the selected runtime.
- `Databases` and `Platform services` are multi-select prompts.
- `None` is explicit and excludes all other choices in the same multi-select group.
- A final confirmation screen summarizes selected values before files are written.

### FR-4 Curated Supported Matrix

The spike must support only a curated subset of ADR-007 combinations.

| Runtime                                                    | Framework              | Databases               | Platform services            | Status               |
| ---------------------------------------------------------- | ---------------------- | ----------------------- | ---------------------------- | -------------------- |
| Node.js (TypeScript)                                       | Express                | PostgreSQL, Redis, None | Auth, Email, Analytics, None | supported            |
| Node.js (TypeScript)                                       | None                   | PostgreSQL, Redis, None | Auth, Email, Analytics, None | supported            |
| Static                                                     | None                   | None only               | None only                    | supported            |
| Static                                                     | None                   | PostgreSQL or Redis     | any                          | invalid              |
| Static                                                     | any non-None framework | any                     | any                          | invalid              |
| Python, Go, Next.js, Fastify, Hono, Flask, MongoDB, SQLite | any                    | any                     | any                          | unsupported in spike |

**Acceptance Criteria**

- Supported runtimes: Node.js (TypeScript), Static.
- Supported frameworks: Express or None for Node.js; None for Static.
- Supported databases: PostgreSQL, Redis, None.
- Supported platform services: Auth, Email, Analytics.
- Unsupported combinations fail with a clear unsupported-in-spike error.
- Invalid combinations fail before any files are written.
- Static scaffolds do not allow database selection beyond `None` in this spike.
- Static scaffolds do not allow platform services in this spike.
- E2E tests execute every allowed runtime/framework/services combination in spike scope and verify a project directory is created for each successful flow.

### FR-5 Generated Artifacts

`create` must generate a usable local starter from composed layers.

**Acceptance Criteria**

- Generates a project folder with starter source files.
- Generates `platform.yaml`, `README.md`, `docker-compose.dev.yml`, `Procfile`, and `.gitignore`.
- Every supported scaffold, including `Static`, includes `docker-compose.dev.yml` to preserve a unified developer experience.
- Generated artifacts are deterministic for the same selections.

**Per-runtime artifact contract**

For Node.js (TypeScript) scaffolds, generated files must include:

- `src/index.ts`
- `package.json`
- `tsconfig.json`
- `platform.yaml`
- `README.md`
- `docker-compose.dev.yml`
- `Dockerfile` (generated when the framework layer supplies `baseImage` and `devCopySource`; i.e. `express` and `typescript` frameworks — not `none`)
- `.dockerignore` (generated by the package-manager layer; present for all Node.js + pnpm/bun scaffolds)
- `Procfile`
- `.gitignore`

For Static scaffolds, generated files must include:

- `public/index.html`
- `public/styles.css`
- `public/main.js`
- `platform.yaml`
- `README.md`
- `docker-compose.dev.yml`
- `Procfile`
- `.gitignore`

**Acceptance Criteria**

- No required file is omitted for any supported scaffold.
- Starter files are usable without requiring platform registration.

### FR-5a Static Scaffold Shape

Static scaffolds must use a simple, explicit local-serving model.

**Acceptance Criteria**

- Static starter files are written under `public/`.
- Static scaffolds use `serve` as the local webserver for this spike.
- Static `docker-compose.dev.yml` runs `serve` against `public/`.
- Static `Procfile` starts `serve` against `public/`.

### FR-6 `platform.yaml` Generation

`create` must derive `platform.yaml` from user selections using ADR-007 terminology.

**Acceptance Criteria**

- `platform.yaml` includes app name and selected services.
- Service names match developer-facing ADR-007 terminology.
- Static selections produce the appropriate static-oriented shape when needed.

For app stacks, `platform.yaml` includes:

- `name`
- `owner`
- `domain.production`
- `domain.preview`
- `environments.preview`
- `environments.production`
- `services`
- `resources`

For static stacks, `platform.yaml` includes:

- `name`
- `stack: static`
- `domain.production`
- `domain.preview`
- `environments.preview`
- `environments.production`

Additional rules:

- Selected services appear in stable order.
- Omitted sections are intentional and consistent across runs.

### FR-7 Layer Composition and Validation

The scaffold must be assembled from explicit layers and fail safely when composition is invalid.

**Acceptance Criteria**

- Layer composition in spike mode follows `always/` + `base/{runtime}` + `frameworks/{framework}` + `services/{each}`.
- Invalid names, existing target directory, invalid combinations, and missing layers use typed errors.
- No partial output is left behind after unrecoverable composition failures.

**Composition rules**

Layer resolution order is:

1. `always/`
2. `base/{runtime}`
3. `frameworks/{framework}`
4. `services/{each}` in stable sorted order

**Acceptance Criteria**

- The same selections always resolve to the same ordered layer set.
- Only configuration files are merged across layers in this spike.
- Configuration merge is additive by default: later layers add missing keys and preserve existing keys unless the same key is explicitly redefined.
- On direct key conflict in configuration files, later layers in resolution order overwrite earlier values.
- Any non-configuration file path collision aborts generation with a typed conflict error before writing output.
- Conflicts introduced within the same layer stage (for example, incompatible definitions from multiple selections in that stage) abort generation with a typed conflict error.
- Missing required layers abort generation with a typed error.

### FR-8 Contract-First, Stub-Backed Architecture

All platform service concerns must remain behind port interfaces. Where a real service does not yet exist, a stub adapter that simulates the service's intended behaviour fulfils the port.

**Acceptance Criteria**

- No command or test performs real external network calls.
- Stub adapters simulate realistic behaviour for their port contract — they are not no-ops unless the service genuinely has no meaningful response shape yet.
- A spike-mode guard test fails if a non-stub adapter is wired for any port that lacks a real service.
- Commands are promoted from `DeferredCommandError` to a full implementation only after their port contracts are defined and stub adapters are in place.

### FR-9 Error Taxonomy and UX

Common errors must be normalized and user-friendly.

**Acceptance Criteria**

- Commands emit consistent error messages and exit codes by error category.
- The 8 stubbed commands share one standardized non-implemented error contract.
- Snapshot/golden tests validate key UX outputs.

**Error categories**

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

**Acceptance Criteria**

- Each error category maps to one consistent user-facing message style.
- Each error category maps to one consistent exit behavior.
- Commands still awaiting port contract definition use `DeferredCommandError`.
- `DeferredCommandError` uses one exact message template and one exact exit code, consistent across all commands in the deferred state.
- Validation failures are actionable and identify the rejected input.

**Configuration merge scope (Spike)**

Configuration merging applies only to files with these extensions: `.json`, `.yaml`, `.yml`.

### FR-10 Contract-Driven Adapter Design

Port contracts are the implementation gate for each command. A command may not be promoted from `DeferredCommandError` until its port contracts are defined, documented, and fulfilled by stub adapters.

**Contract definition deliverables (per port)**

- TypeScript interface with documented method signatures and error types.
- Stub adapter that simulates realistic behaviour.
- Unit tests for the stub adapter.
- Adapter instance creation in `bin.ts` when passed to `runCli`; spike-guard test updated to include the new adapter.

**Ports defined for `create` (current)**

- `Prompt` — interactive terminal input
- `FilesystemWriter` — project-folder writes with rollback-on-failure
- `ObservabilityClient` — non-blocking stub telemetry

**Ports to be defined for `register` (next)**

- `ProjectReaderPort` — reads files from an existing project directory
- `RegistrationClient` — submits a validated `PlatformManifest` to the platform; contract definition is the gate before `register` implementation begins

**Required spike internal services**

- `CreateInputValidationService` — create-name rules and compatibility checks (application logic, not a port)
- `LayerCompositionService` — layer ordering, conflict detection, and config merging; owns the default layer registry as create-flow-internal scaffolding data
- `PlatformManifestService` — runtime-specific manifest construction and schema validation for `platform.yaml`

**Acceptance Criteria**

- Each port has a documented interface with inputs, outputs, and normalized error behaviour.
- Each stub adapter has unit tests that verify its simulated behaviour.
- Contract tests pass for all adapters currently wired in spike mode.
- `CreateInputValidationService`, `LayerCompositionService`, and `PlatformManifestService` are tested as internal application logic, not as ports.

### FR-12 `register` — First Post-`create` Command

`register` is the first command to go through the full contract-first cycle after `create`. It remains a `DeferredCommandError` until its port contracts (`ProjectReaderPort` and `RegistrationClient`) are defined.

**Implementation gate**

- `ProjectReaderPort` and `RegistrationClient` interfaces are documented and agreed.
- Stub adapters are implemented and tested.
- Only then is `register` removed from `DEFERRED_COMMANDS` and implemented as a full command handler.

**Acceptance Criteria (once gate is passed)**

- `universe register [directory]` reads `platform.yaml` from the given directory, or from `cwd` if none is provided.
- The command is non-interactive: all inputs come from `platform.yaml`.
- A missing `platform.yaml` produces a typed error with the attempted path.
- A malformed or schema-invalid `platform.yaml` produces a typed error with the reason.
- A valid manifest is passed to `RegistrationClient`; the stub resolves successfully.
- On success, exits 0 and output identifies the registered project by name.
- CLI unit tests cover all error paths; an E2E test runs `create` then `register` in sequence.

### FR-11 Migration Path Readiness

Maintain assumptions-first migration notes from the `create` spike to later command implementation.

**Acceptance Criteria**

- A shared assumptions register exists and is updated for the create-first phases.
- Documentation includes: current assumptions, unknowns, required future adapter/provider capabilities, and matrix-expansion triggers.
- Migration notes explain how future commands will replace stub-only behavior.

## 5) Non-Functional Requirements

- Deterministic local tests (no flaky timing/network assumptions).
- Fast feedback: unit tests should complete quickly in local development.
- Reproducibility: fresh clone + install can run prototype and tests with minimal setup.
- Observability integration is deferred until after the spike; spike only requires an o11y client interface with stub/no-op implementation.

### Observability Guardrails (Spike)

- Provide a minimal `ObservabilityClient` port and a default stub/no-op adapter for all spike commands.
- Do not integrate real o11y backends (ClickHouse, Vector, HyperDX, GlitchTip, VictoriaMetrics) during the spike.
- Keep command handlers vendor-agnostic by routing any future telemetry through one shared command runner/wrapper boundary.
- Keep o11y non-blocking: failures in the o11y client must never fail command execution.
- Do not couple tests to vendor payload shapes; tests should validate command behavior and stub o11y interactions only.
- Never emit secrets/PII (tokens, raw env values, credentials) in any o11y payload.

## 6) Out of Scope

- Real platform service implementations (GitHub org automation, DNS, OIDC, SES, database provisioning, CI/CD, observability backends).
- Real platform service implementations (GitHub org automation, DNS, OIDC, SES, database provisioning, CI/CD).
- Full implementation of `deploy`, `promote`, `rollback`, `logs`, `status`, `list`, or `teardown` (port contracts not yet defined).
- Stub-backed implementation of `register` until its port contracts are defined (see FR-12).
- Non-interactive `create` mode.
- Full ADR-007 runtime/framework/database matrix.
- Production SLAs, full RBAC/SSO implementation.

## 7) Dependencies and Assumptions

- ADR-007 remains source of truth for command intent and UX language.
- Interface designs can evolve but must preserve command-level contracts.
- Interactive scaffolding is sufficient to validate the first vertical slice.

## 8) CLI Architecture Refactor Phases

The CLI layer refactoring described in section 1.1 is implemented across three phases:

### Phase 1 — Flatten `commands.ts` deps

- Merge `Services` and `Adapters` into a single `Deps` interface
- Update every handler signature to use `Pick<Deps, ...>` with flat, inline dep types instead of nested `services`/`adapters`
- Update `bin.ts` and any tests that construct handler deps
- `cli.ts` is unchanged in this phase

### Phase 2 — Move validation and routing to `bin.ts`

- Move the `COMMANDS` map and all `BadArgumentsError` throw logic out of `cli.ts` into `bin.ts`
- Move `--help` handling into `bin.ts`
- `bin.ts` binds deps to each handler producing a zero-arg thunk
- `bin.ts` calls `runCli(command, thunk, observability)` only after successful validation

### Phase 3 — Slim `runCli`

- Remove `argv`, `cwd`, `Services`, `Adapters`, and `CommandHandler` from `cli.ts`
- Update `runCli` to the three-argument signature described in section 1.1
- Remove `CliDependencies` interface; it is no longer needed
- Verify `cli.ts` imports only `ObservabilityClient` and types from `commands.ts`

## 9) Release / Milestones

- **M1:** Architecture skeleton + shared stub-command contract + assumptions register
- **M2:** `create` prompt flow + validation + supported matrix
- **M3:** Layer composition + artifact generation + `platform.yaml`
- **M4:** Tests, docs, and migration notes for future command expansion
- **M5:** `register` port contracts defined + stub adapters implemented + command handler delivered

## 10) Risks and Mitigations

- **Risk:** Real APIs diverge from stub assumptions.
  - **Mitigation:** Contract-first ports + migration checklists + parity tests.
- **Risk:** Reduced matrix omits a path later judged essential.
  - **Mitigation:** Make unsupported paths explicit and document expansion triggers.
- **Risk:** UX inconsistency across commands.
  - **Mitigation:** Shared command output guidelines + snapshot tests.

## 11) Increment Addendum — Create Extensibility: Framework Layers + Package Manager Selection

This addendum incorporates the follow-on `create` PRD into the broader spike PRD above. It refines the `create` workflow to make framework scaffolding easier to extend and to support user-selectable package managers for Node.js projects without leaking package-manager concerns into runtime or framework layers.

### 11.1 Product Summary

Extend `universe create` so framework scaffolding is easier to expand over time and users can choose a package manager for Node.js projects (initially `pnpm` and `bun`) without leaking package-manager specifics into framework/runtime responsibilities.

### 11.2 Terminology

**Runtime** in this codebase refers to the outermost execution boundary of a project. This covers:

- Execution environments: Node.js, Python, bun-as-runtime, .NET CLR, V8/browser
- Compilation targets with no managed runtime: Rust, C, C++

TypeScript is explicitly **not** a runtime. It is a compile-time tool and devDependency that runs under Node.js. It is treated as a framework in this system.

The runtime option `node_ts` is renamed to `node` to reflect that the runtime is Node.js alone. TypeScript support is selected independently via framework choice.

### 11.3 Problem and Opportunity

Current scaffolding couples concerns in ways that slow extension:

- runtime layer currently owns TypeScript, lifecycle scripts, and package-manager-specific files
- framework layer has limited room to own scaffold behavior
- package manager behavior appears in both templates and command orchestration

This increases change risk when adding new frameworks or package managers.

### 11.4 Goals and Non-Goals

#### Goals

- Rename `node_ts` runtime to `node`; introduce `frameworks/typescript` so TypeScript is selected as a framework, not baked into the runtime.
- Make framework layer support extensible without hardcoded per-framework branching.
- Add user-selectable package manager for Node.js (`pnpm`, `bun`) with room for future managers.
- Ensure scripts avoid direct package-manager references; use a generic `start.sh` script as the bridge between `docker-compose.dev.yml` and the chosen package manager.
- Preserve ports/adapters decoupling by introducing a single package manager service that encapsulates manager adapters.

#### Non-Goals

- Implement new concrete frameworks beyond `typescript` in this increment.
- Support package-manager selection for `static_web` runtime.
- Change behavior of non-`create` commands.

### 11.5 Users and Use Cases

#### Target Users

- Platform engineers extending `universe create` scaffolding.
- Internal developers creating new Node.js projects.

#### User Stories

| As a...            | I want to...                                                      | So that...                                       |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------ |
| platform engineer  | add new framework layers without editing multiple switches        | scaffold growth stays low-risk and predictable   |
| platform engineer  | keep package-manager specifics out of framework/runtime templates | framework logic remains portable                 |
| internal developer | choose `pnpm` or `bun` during Node.js create                      | my scaffold matches team tooling                 |
| platform engineer  | keep one package-manager dependency in command wiring             | dependency injection remains simple and testable |

### 11.6 Scope

#### In Scope

- Rename `node_ts` runtime to `node` throughout prompt, validation, layers, and tests.
- Introduce `frameworks/typescript` as a selectable framework layer for TypeScript-only Node projects.
- Extend create prompt/input model with Node-only package-manager choice.
- Validate package-manager compatibility by runtime.
- Add package-manager-aware layer resolution stage.
- Repartition layer ownership: runtime vs framework vs package-manager layers.
- Introduce `start.sh` as a package-manager-owned bridge script for `docker-compose.dev.yml`.
- Introduce package manager service abstraction over manager-specific adapters.
- Update tests and snapshots for new behavior.

#### Out of Scope

- New runtime options beyond renaming `node_ts` -> `node`.
- Additional package managers beyond `pnpm` and `bun`.
- End-user migration tooling for existing generated projects.

### 11.7 Functional Requirements

- **FR-11.7.1:** Create input contract includes package manager for Node runtime only; runtime renamed to `node`.
  - Rationale: package-manager choice is a first-class create decision; runtime naming must reflect what actually executes.
  - Acceptance Criteria:
    - `RUNTIME_OPTIONS` value changes from `node_ts` to `node`; label remains "Node.js (TypeScript)" until framework selection replaces the TypeScript assumption.
    - Framework options include `typescript` (TypeScript, no web framework), `express`, and `none`.
    - Prompt flow includes package-manager selection when runtime is `node`.
    - Prompt flow does not request package manager when runtime is `static_web`.
    - Confirmation output includes package manager for Node selections.
    - Input model supports values `pnpm` and `bun` for Node.

- **FR-11.7.2:** Validation enforces runtime/framework/package-manager compatibility.
  - Rationale: invalid combinations must fail before writing files.
  - Acceptance Criteria:
    - `node` runtime selections require a supported package manager (`pnpm` or `bun`).
    - `static_web` selections reject non-empty package-manager choice.
    - `static_web` selections reject framework choices that require Node (`typescript`, `express`).
    - Invalid combinations return typed create validation errors.

- **FR-11.7.3:** Layer resolution supports package-manager stage and framework extensibility.
  - Rationale: layering must scale without hardcoded framework logic.
  - Acceptance Criteria:
    - Resolution order is deterministic: `always` -> `base/{runtime}` -> `package-managers/{manager}` (Node only) -> `frameworks/{framework}` -> `services/{service}`.
    - Static resolution omits package-manager stage.
    - Framework resolution is data-driven/registry-oriented (no framework-specific branching required for future additions).
    - Missing/invalid layers fail with existing typed layer errors.

- **FR-11.7.4:** Runtime layer owns only execution-environment primitives.
  - Rationale: the `node` runtime layer should contain only what is true of Node.js regardless of language, framework, or package manager. `docker-compose.dev.yml` starts here as a minimal ports-only skeleton; the package-manager layer extends it via config merge.
  - Acceptance Criteria:
    - Base layer is renamed from `base/node-js-typescript` to `base/node`.
    - `base/node` contains: `Procfile`, `docker-compose.dev.yml` (ports-only skeleton; no `image:`, `command:`, `volumes:`, or `working_dir:`).
    - `base/node` excludes TypeScript, `tsconfig.json`, `src/index.ts`, and all lifecycle scripts.
    - The package-manager layer extends `docker-compose.dev.yml` (via config merge) with `build:` context/target and `develop.watch` so the compose file has no hardcoded package-manager references at the base layer.

- **FR-11.7.5:** TypeScript is modeled as a framework; framework layers own language tooling, entry points, and package-manager-agnostic scripts.
  - Rationale: TypeScript is a compile-time tool (devDependency), not a runtime. Treating it as a framework makes the selection explicit, keeps the runtime layer clean, and opens the door to non-TypeScript Node.js projects in future.
  - Acceptance Criteria:
    - `frameworks/typescript` is introduced and contributes: TypeScript devDependency, `tsconfig.json`, `src/index.ts` (minimal TS HTTP server), `build: "tsc -p tsconfig.json"` script, `start: "node dist/index.js"` script.
    - `frameworks/express` contributes: express dependency, TypeScript devDependency, express-specific `src/index.ts`, `build` and `start` scripts matching the TypeScript pattern.
    - `frameworks/none` contributes nothing (bare Node.js, no TypeScript, no scripts).
    - No framework layer includes `dev`, `preinstall`, or `start.sh` (those are package-manager-specific).
    - Scaffold outputs remain deterministic per selection tuple.

- **FR-11.7.6:** Package-manager layers own manager-specific scaffold artifacts and Docker build configuration.
  - Rationale: The package-manager layer knows how to install dependencies and run the dev server, making it the right owner of `devInstall`/`devCmd` Dockerfile slots, the `.dockerignore`, and the Compose build/watch fragment.
  - Acceptance Criteria:
    - `package-managers/pnpm` layer contributes: `pnpm-workspace.yaml`, `start.sh` (`pnpm install && pnpm dev`), `dev: "pnpm run build && pnpm run start"` script, `preinstall: "npx only-allow pnpm"` script, `.dockerignore` (excludes `node_modules`, `dist`, `.git`), `docker-compose.dev.yml` fragment (adds `build: { context: ./, target: dev }` and `develop.watch` with sync/rebuild actions via config merge), and `dockerfileData` slots `devInstall` (copies lockfiles + runs corepack + pnpm install) and `devCmd` (`["pnpm", "run", "dev"]`).
    - `package-managers/bun` layer contributes: `start.sh` (`bun install && bun dev`), `dev: "bun run build && bun run start"` script (no preinstall hook in v1). Docker artefacts for bun are deferred.
    - Node+pnpm and Node+bun produce distinct package-manager artifacts from their respective layers.
    - Static scaffolds include no Node package-manager artifacts.

- **FR-11.7.7:** Create orchestration uses a single package manager service.
  - Rationale: preserve DI simplicity while supporting multiple managers.
  - Acceptance Criteria:
    - `handleCreate` depends on one service abstraction, not multiple manager adapters.
    - Service chooses internal manager adapter from validated user input.
    - Service executes dependency specification and install steps for Node runtime.
    - Static runtime path skips package-manager execution.

- **FR-11.7.8:** Test suite covers new behavior and preserves deterministic output.
  - Rationale: architecture changes require strong regression safety.
  - Acceptance Criteria:
    - Unit tests updated for prompt flow, validation rules, layer ordering, manager service dispatch, and adapters.
    - Integration create tests cover Node+pnpm, Node+bun, Static.
    - Snapshot and behavior tests remain deterministic across supported combinations.

### 11.8 Non-Functional Requirements

- **NFR-11.8.1:** Existing supported create combinations continue to work under renamed selections.
  - Acceptance Criteria:
    - Node+Express scaffold succeeds as `node` + `express` + `pnpm` (was `node_ts` + `express`).
    - The former Node+None (TypeScript, no web framework) scaffold succeeds as `node` + `typescript` + `pnpm`.
    - Static scaffolds continue to succeed without manager selection.
    - Scaffold file output for equivalent selections is identical to the pre-refactor output.

- **NFR-11.8.2:** Extensibility for future frameworks/package managers.
  - Acceptance Criteria:
    - Adding one new framework or package manager requires adding new layer/adapter entries and tests, without modifying command handler control flow.

- **NFR-11.8.3:** Deterministic scaffold output.
  - Acceptance Criteria:
    - Same selection tuple always produces identical file set/content ordering.

### 11.9 Dependencies and Assumptions

#### Dependencies

- Existing create architecture (`Prompt`, validation service, layer composition service, command handler).
- Existing package manager adapter pattern and error taxonomy.

#### Assumptions

- `bun` adapter can be implemented using available local CLI commands in development environments.
- TypeScript is not a runtime; it is modeled as a framework (`frameworks/typescript`) and is not present in the base runtime layer or any package-manager layer.
- `frameworks/express` declares its own TypeScript devDependency because Express projects in this system are always TypeScript-based.
- Bun dependency pinning matches pnpm semantics: versions are resolved by running `bun install --frozen-lockfile` equivalent and extracted via `bun list --json`.
- `docker-compose.dev.yml` skeleton is owned by the runtime layer (ports only); the package-manager layer extends it via config merge to add `build:` context/target and `develop.watch` (Compose Watch). `start.sh` is still contributed by the package-manager layer but is not called by the compose file in the Docker-first workflow.
- Framework layers own package-manager-agnostic scripts only (`build`, `start`); package-manager-specific scripts (`dev`, `preinstall`) and `start.sh` are always contributed by the package-manager layer.

### 11.10 Risks and Mitigations

- **Risk:** Layer repartition causes broad snapshot churn.
  - **Mitigation:** phase changes and update tests in lock-step with deterministic ordering checks.
- **Risk:** Script portability differs between package managers.
  - **Mitigation:** enforce "no manager literal references where possible" and document exceptions in tests.
- **Risk:** Adapter dispatch logic drifts from validation contract.
  - **Mitigation:** centralize manager mapping in service and cover with unit tests.

### 11.11 Milestones

- **Milestone 1:** Input/validation + service contract updates.
- **Milestone 2:** Layer repartition + package-manager stage integration.
- **Milestone 3:** Adapter/service wiring + full test stabilization.

### 11.12 Resolved Design Decisions

- **Runtime rename:** `node_ts` -> `node`. The runtime is Node.js. TypeScript is a framework, not a runtime.
- **TypeScript as a framework:** `frameworks/typescript` is introduced as the framework choice for TypeScript projects without a web framework. `frameworks/express` includes its own TypeScript devDependency because all Express projects here are TypeScript-based. `frameworks/none` is bare Node.js with no TypeScript.
- **`docker-compose.dev.yml` ownership and package-manager isolation:** The compose file lives in `base/node` as a ports-only skeleton (no `image:`, `command:`, `volumes:`, or `working_dir:`). Each package-manager layer extends it via config merge to add `build:` context/target and Compose Watch (`develop.watch`). Each package-manager layer also contributes `start.sh` with its own install+dev command, but `start.sh` is no longer called by the compose file — it is retained for non-Docker local workflows.
- **Bun pinning semantics:** Bun matches pnpm exactly. Versions are defined by `package.json`; `bun install --frozen-lockfile` resolves the lockfile; `bun list --json` extracts installed versions for pinning.
- **Package-manager-specific scripts:** `dev` and `preinstall` scripts are package-manager-specific and contributed by the package-manager layer. The `preinstall` hook enforces manager exclusivity where applicable (pnpm: `npx only-allow pnpm`; bun: no enforcement hook in v1). The `dev` script invokes the package manager's run command.

### 11.13 Accepted Selection Tuples (Phase 1 Increment)

All valid combinations enforced by `CreateInputValidationService`:

| Runtime      | Framework    | Package Manager | Notes                                  |
| ------------ | ------------ | --------------- | -------------------------------------- |
| `node`       | `typescript` | `pnpm`          | TypeScript-only Node project with pnpm |
| `node`       | `typescript` | `bun`           | TypeScript-only Node project with bun  |
| `node`       | `express`    | `pnpm`          | Express + TypeScript with pnpm         |
| `node`       | `express`    | `bun`           | Express + TypeScript with bun          |
| `node`       | `none`       | `pnpm`          | Bare Node.js (no TypeScript) with pnpm |
| `node`       | `none`       | `bun`           | Bare Node.js (no TypeScript) with bun  |
| `static_web` | `none`       | (none)          | Static HTML/CSS/JS, no package manager |
