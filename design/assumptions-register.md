# Universe CLI Spike — Assumptions Register

Use this register throughout the spike. Update it at the end of each phase.

## How to use

- Record both **current assumptions** (known at phase start) and **new assumptions** discovered during implementation.
- Keep assumptions tied to command groups and specific ports/adapters.
- For each assumption, include a concrete validation plan and status.
- If an assumption is invalidated, record impact and required follow-up changes.

## Status Legend

- `open` — not yet validated
- `validated` — confirmed by evidence
- `invalidated` — disproven and needs plan update
- `deferred` — intentionally postponed beyond spike

---

## Global Assumptions (Spike-Wide)

| ID     | Assumption                                                                                                                       | Why Needed                                                                               | Validation Plan                                                                                       | Status | Notes                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| GA-001 | Platform/provider interfaces are not yet finalized                                                                               | Spike uses CLI-owned ports and stubs                                                     | Reconcile against real interface docs when available                                                  | open   |                                                              |
| GA-002 | Stub-only execution is sufficient to validate CLI UX and architecture                                                            | Avoid coupling to missing platform systems                                               | Verify all tests run without network and without real adapters                                        | open   |                                                              |
| GA-003 | Observability backend integration is deferred post-spike                                                                         | Keep spike scope focused                                                                 | Confirm only `ObservabilityClient` stub/no-op is used in spike code/tests                             | open   |                                                              |
| GA-004 | The spike should preserve the 9-command public surface even though only `create` is implemented                                  | Reduce scope without hiding intended product shape                                       | Verify CLI help and stubbed-command tests cover all ADR-007 commands                                  | open   |                                                              |
| GA-005 | Interactive-only `create` is enough for the first spike                                                                          | Lowest-risk way to validate UX and layer composition                                     | Revisit after prompt-flow and artifact-generation tests are stable                                    | open   |                                                              |
| GA-006 | A curated matrix is preferable to partial support across the full ADR-007 matrix                                                 | Keeps the spike small and internally consistent                                          | Reassess after documenting unsupported-path friction and future expansion triggers                    | open   |                                                              |
| GA-007 | Static projects in this spike should be purely local asset bundles with no databases or platform services                        | Keeps the Static path minimal and unambiguous                                            | Validate via prompt validation and generated artifact tests                                           | open   |                                                              |
| GA-008 | Spike composition order is `always` → `base` → `frameworks` → `services` even though ADR-007 lists a different order             | Supports clear baseline defaults with deterministic late overrides for selected features | Validate through layer resolver contract tests and snapshot outputs; revisit when moving beyond spike | open   | Record as intentional spike-specific divergence from ADR-007 |
| GA-009 | Integration test coverage should execute every allowed runtime/framework/services combination and verify project-folder creation | Ensures supported matrix paths remain valid and catches composition regressions early    | Validate with matrix-driven integration test suite and expected-combination count checks              | open   | Applies to create success paths in spike scope               |

---

## Command Group — Shared Command Surface + Deferred Contract

### Current assumptions

| ID      | Port/Area      | Assumption                                                                        | Why Needed                                                    | Validation Plan                                             | Status | Notes |
| ------- | -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | ------ | ----- |
| CMD-001 | command router | All 9 commands should remain visible in help and routing                          | Preserves ADR-007 surface while reducing implementation scope | Validate with CLI help and smoke tests                      | open   |       |
| CMD-002 | error contract | One shared non-implemented error contract is sufficient for all deferred commands | Avoids inventing premature command-specific behavior          | Validate with snapshot tests across all 8 deferred commands | open   |       |

#### Unknowns

| ID      | Port/Area  | Unknown                                                               | Risk if Wrong | Decision Needed By                      | Owner    | Notes |
| ------- | ---------- | --------------------------------------------------------------------- | ------------- | --------------------------------------- | -------- | ----- |
| CMD-U01 | exit codes | Whether future commands will need differentiated temporary exit codes | Low           | Before expanding first deferred command | platform |       |

#### Required adapter/provider capabilities

| ID      | Port/Area      | Required capability (CLI-owned contract)         | Source command behavior   | Priority  | Notes                    |
| ------- | -------------- | ------------------------------------------------ | ------------------------- | --------- | ------------------------ |
| CMD-C01 | command runner | `runDeferredCommand(name) -> standardized error` | Deferred command behavior | must-have | Shared across 8 commands |

#### New assumptions discovered during implementation

| ID  | Port/Area | New assumption | Trigger/Context | Validation Plan | Status | Notes |
| --- | --------- | -------------- | --------------- | --------------- | ------ | ----- |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [ ] Test(s):
  - [ ] Notes/docs:
  - [ ] Decision updates:
- ## Outcome summary:

#### Impact if assumptions changed

- Affected command behavior:
- Affected ports/adapters:
- Required TODO/PRD changes:

---

## Command — `create`

### Current assumptions

| ID      | Port/Area           | Assumption                                                                                                 | Why Needed                                                       | Validation Plan                                                       | Status | Notes |
| ------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------ | ----- |
| CRT-001 | prompt flow         | ADR-007 prompt order is sufficient for the spike UX                                                        | Avoids redesigning the flow before validating basics             | Validate with CLI prompt tests and review of user friction            | open   |       |
| CRT-002 | supported matrix    | Node.js (TypeScript) + Express/None and Static + None provide enough coverage for the spike                | Balances realism and scope control                               | Validate with generated artifact review and follow-up scope review    | open   |       |
| CRT-003 | service set         | PostgreSQL, Redis, Auth, Email, and Analytics are enough to validate additive layer composition            | Exercises multi-select scaffolding without full matrix sprawl    | Validate with layer composition tests                                 | open   |       |
| CRT-004 | unified DX          | Every supported scaffold, including `Static`, should ship with `docker-compose.dev.yml`                    | Keeps local development workflow consistent across project types | Validate by checking artifact generation for every supported scaffold | open   |       |
| CRT-005 | prompt confirmation | A confirmation step before writes is sufficient to prevent accidental scaffold creation                    | Keeps create flow safe without adding rollback UX complexity     | Validate with CLI prompt tests                                        | open   |       |
| CRT-006 | name rules          | Lowercase kebab-case, starting with a letter, and 3–50 chars is a sufficient naming contract for the spike | Keeps generated folders and metadata predictable                 | Validate with unit tests for valid and invalid examples               | open   |       |

#### Unknowns

| ID  | Port/Area | Unknown | Risk if Wrong | Decision Needed By | Owner | Notes |
| --- | --------- | ------- | ------------- | ------------------ | ----- | ----- |

#### Required adapter/provider capabilities

| ID      | Port/Area          | Required capability (CLI-owned contract)                                    | Source command behavior   | Priority  | Notes |
| ------- | ------------------ | --------------------------------------------------------------------------- | ------------------------- | --------- | ----- |
| CRT-C01 | prompt port        | `promptForCreateInputs() -> createSelections` including confirmation result | Interactive `create` flow | must-have |       |
| CRT-C02 | validation service | `validateCreateInput(input) -> normalized result/errors`                    | Input validation          | must-have |       |

#### New assumptions discovered during implementation

| ID  | Port/Area | New assumption | Trigger/Context | Validation Plan | Status | Notes |
| --- | --------- | -------------- | --------------- | --------------- | ------ | ----- |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [ ] Test(s):
  - [ ] Notes/docs:
  - [ ] Decision updates:
- ## Outcome summary:

#### Impact if assumptions changed

- Affected command behavior:
- Affected ports/adapters:
- Required TODO/PRD changes:

---

## Command — `create` Supporting Services

### Current assumptions

| ID      | Port/Area                 | Assumption                                                                                                                                      | Why Needed                                                          | Validation Plan                                                                    | Status | Notes                                                                                                  |
| ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| CRS-001 | layer model               | ADR-007 layer structure can be implemented directly in the spike without introducing a different abstraction                                    | Keeps spike aligned with target architecture                        | Validate by mapping supported matrix to one deterministic layer path per selection | open   |                                                                                                        |
| CRS-002 | artifact set              | Every supported scaffold should emit `platform.yaml`, `README.md`, `docker-compose.dev.yml`, `Procfile`, and `.gitignore`                       | Keeps artifacts consistent across the reduced matrix                | Validate via artifact-generation tests for each supported path                     | open   |                                                                                                        |
| CRS-003 | write safety              | The filesystem adapter can prevent partial output on unrecoverable failures                                                                     | Avoids broken starter projects                                      | Validate with failure-path tests                                                   | open   |                                                                                                        |
| CRS-004 | static layout             | Static scaffolds should place HTML/CSS/JS files in `public/` and use a simple webserver such as `serve`                                         | Defines one clear and testable Static convention for the spike      | Validate with static artifact-generation tests and template review                 | open   |                                                                                                        |
| CRS-005 | deterministic composition | Layer order and file collision behavior can be defined deterministically for the spike                                                          | Keeps output stable and testable                                    | Validate with repeated-generation and collision tests                              | open   |                                                                                                        |
| CRS-006 | collision policy          | Only configuration files should merge; any non-config collision should fail with typed error; same-stage conflicts should fail with typed error | Keeps merge behavior explicit and prevents unsafe silent overwrites | Validate with conflict-focused unit/contract/integration tests                     | open   | Config merge limited to `.json`, `.yaml`, `.yml` in spike; later layers overwrite direct key conflicts |

#### Unknowns

| ID      | Port/Area               | Unknown                                                                                                                                             | Risk if Wrong | Decision Needed By                      | Owner    | Notes                                                                                |
| ------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| CRS-U01 | static server packaging | Whether `serve` should be provided through project dependencies, container image defaults, or another packaging path in the eventual implementation | Low           | Before final template content is locked | platform | Server choice is locked for planning; packaging can be decided during implementation |

#### Required adapter/provider capabilities

| ID      | Port/Area                   | Required capability (CLI-owned contract)                                                         | Source command behavior            | Priority  | Notes                                            |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------- | --------- | ------------------------------------------------ |
| CRS-C01 | layer resolver              | `resolveLayers(input) -> orderedLayerSet` with normalized errors                                 | Deterministic scaffold composition | must-have |                                                  |
| CRS-C02 | filesystem writer           | `writeProject(targetDir, files)` with rollback-on-failure semantics                              | Artifact generation                | must-have |                                                  |
| CRS-C03 | platform manifest generator | `generatePlatformYaml(input) -> text`                                                            | `platform.yaml` output             | must-have | Uses ADR-007 naming                              |
| CRS-C04 | filesystem writer           | `writeProject(targetDir, files)` must detect collisions and fail cleanly on unrecoverable writes | Artifact generation safety         | must-have | Explicitly part of deterministic output contract |

#### New assumptions discovered during implementation

| ID  | Port/Area | New assumption | Trigger/Context | Validation Plan | Status | Notes |
| --- | --------- | -------------- | --------------- | --------------- | ------ | ----- |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [ ] Test(s):
  - [ ] Notes/docs:
  - [ ] Decision updates:
- ## Outcome summary:

#### Impact if assumptions changed

- Affected command behavior:
- Affected ports/adapters:
- Required TODO/PRD changes:

---

## Command — `deploy`

### Current assumptions

| ID      | Port/Area           | Assumption                                                                                                                         | Why Needed                                                                         | Validation Plan                                                                                    | Status      | Notes                                                                                                                      |
| ------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| DPL-001 | deploy command flow | `deploy` can follow the same manifest-first pattern as `register`, reading `platform.yaml` from a directory or `cwd` by default    | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory flows                              | validated   | Keeps deploy non-interactive in spike mode                                                                                 |
| DPL-002 | deploy environments | A reduced environment set of `preview` and `production`, with `preview` as the default, is sufficient for the spike                | Keeps deploy scope small while still exercising command-specific behavior          | Validate with argument parsing tests, success-path tests, and assumptions review                   | invalidated | Invalidated v3.0.0: `deploy` now always targets preview; environment is no longer a caller-supplied argument. See DPL-N01. |
| DPL-003 | stub deploy adapter | A deterministic in-memory stub is sufficient to validate deploy UX without simulating full rollout lifecycle                       | Avoids premature modeling of platform internals while proving the command surface  | Validate with unit tests for deterministic IDs, repeated deploys, and explicit failure fixtures    | validated   | Stub must remain network-free and reset between instances                                                                  |
| DPL-004 | error taxonomy      | `deploy` needs a command-specific typed failure (`DeploymentError`) rather than the shared deferred-command contract once promoted | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering deploy-client failures                                | validated   | Exit code 14; unique and documented in `EXIT_CODES`                                                                        |
| DPL-005 | observability guard | Deploy telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                       | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert deploy exit/result is unchanged | validated   | Payloads exclude secrets; observability throw tested and confirmed non-blocking                                            |

#### Unknowns

| ID      | Port/Area           | Unknown                                                                                       | Risk if Wrong | Decision Needed By                       | Owner    | Notes                                                                 |
| ------- | ------------------- | --------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- | -------- | --------------------------------------------------------------------- |
| DPL-U01 | deploy receipt      | Whether the real platform will return only a deployment identifier or richer status metadata  | Medium        | Before replacing the stub adapter        | platform | Keep stub receipt minimal but extendable                              |
| DPL-U02 | environment mapping | Whether future deploy targets will use friendly names (`preview`) or provider-specific labels | Medium        | Before real deploy contract is finalized | platform | Normalize to CLI-facing names in spike; map later if provider differs |
| DPL-U03 | failure semantics   | Which provider failure classes deserve distinct typed errors beyond `DeploymentError`         | Medium        | Before production adapter implementation | platform | Spike keeps one typed deploy failure to avoid speculative taxonomy    |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                   | Source command behavior           | Priority    | Notes                                                                                       |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| DPL-C01 | deploy client             | `deploy(input) -> receipt` with normalized `DeploymentError` failures                      | `universe deploy` success path    | must-have   | Input contains only manifest; environment is implicit in command semantics (always preview) |
| DPL-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                       | Manifest lookup for deploy        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`                              |
| DPL-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                               | Manifest validation before deploy | must-have   | Reuses existing validation path                                                             |
| DPL-C04 | observability client      | `track()` and `error()` remain non-blocking when deploy emits start/success/failure events | Deploy telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow                            |

#### New assumptions discovered during implementation

| ID      | Port/Area           | New assumption                                                                                   | Trigger/Context                                                                            | Validation Plan                                                          | Status    | Notes                                                                                                   |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------- |
| DPL-N01 | deploy environments | `deploy` always targets preview; environment is removed from `DeployRequest` and `DeployReceipt` | v3.0.0 refactor removed caller-supplied environment from all five non-logs/status commands | Validate that `DeployRequest` compiles without `environment`; tests pass | validated | `DeployRequest = { manifest }`, `DeployReceipt` has no `environment` field; output hard-codes "preview" |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [x] Test(s): `src/adapters/stub-deploy-client.test.ts`, `src/cli.test.ts` (deploy section), `src/integration-tests/deploy.test.ts`
  - [x] Decision updates: `DeployRequest`/`DeployReceipt` simplified; too-many-args guard tightened to `> 2`
- Outcome summary: DPL-002 invalidated. `deploy` always targets preview; the environment argument is gone from the public surface and port contracts. DPL-N01 captures the new fixed-semantics assumption.

#### Impact if assumptions changed

- Affected command behavior: `universe deploy` argument model, success output, and failure mapping
- Affected ports/adapters: `DeployClient`, stub deploy adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: deploy TODO phase ordering, deploy error taxonomy, and migration notes for real adapter parity

---

## Command — `promote`

### Current assumptions

| ID      | Port/Area            | Assumption                                                                                                                         | Why Needed                                                                         | Validation Plan                                                                                     | Status      | Notes                                                                                                                                |
| ------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| PRM-001 | promote command flow | `promote` can follow the same manifest-first pattern as `deploy`, reading `platform.yaml` from a directory or `cwd` by default     | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory promote flows                       | validated   | Keeps promote non-interactive in spike mode                                                                                          |
| PRM-002 | target environment   | A reduced promote target set with `production` as the default is sufficient for the spike                                          | Keeps scope small while exercising command-specific promotion behavior             | Validate with argument parsing tests, success-path tests, and assumptions review                    | invalidated | Invalidated v3.0.0: `promote` now always targets production; targetEnvironment is no longer a caller-supplied argument. See PRM-N01. |
| PRM-003 | stub promote adapter | A deterministic in-memory stub is sufficient to validate promote UX without simulating full release orchestration                  | Avoids premature modeling of provider internals while proving command shape        | Validate with unit tests for deterministic IDs, repeated promotes, and explicit failure fixtures    | validated   | Stub must remain network-free and reset between instances                                                                            |
| PRM-004 | error taxonomy       | `promote` needs a command-specific typed failure (`PromotionError`) rather than the shared deferred-command contract once promoted | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering promote-client failures                                | validated   | Exit code 15; unique and documented in `EXIT_CODES`                                                                                  |
| PRM-005 | observability guard  | Promote telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                      | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert promote exit/result is unchanged | validated   | Payloads exclude secrets; observability throw tested and confirmed non-blocking                                                      |

#### Unknowns

| ID      | Port/Area         | Unknown                                                                                                    | Risk if Wrong | Decision Needed By                        | Owner    | Notes                                                                 |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- | -------- | --------------------------------------------------------------------- |
| PRM-U01 | promote receipt   | Whether the real platform returns only a promotion identifier or richer metadata (release URL, timestamps) | Medium        | Before replacing the stub adapter         | platform | Keep stub receipt minimal but extendable                              |
| PRM-U02 | target mapping    | Whether future promotion targets will use friendly names (`production`) or provider-specific labels        | Medium        | Before real promote contract is finalized | platform | Normalize to CLI-facing names in spike; map later if provider differs |
| PRM-U03 | failure semantics | Which provider failure classes should become typed errors beyond `PromotionError`                          | Medium        | Before production adapter implementation  | platform | Spike keeps one typed promote failure to avoid speculative taxonomy   |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                    | Source command behavior            | Priority    | Notes                                                                                                |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| PRM-C01 | promote client            | `promote(input) -> receipt` with normalized `PromotionError` failures                       | `universe promote` success path    | must-have   | Input contains only manifest; targetEnvironment is implicit in command semantics (always production) |
| PRM-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                        | Manifest lookup for promote        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`                                       |
| PRM-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                                | Manifest validation before promote | must-have   | Reuses existing validation path                                                                      |
| PRM-C04 | observability client      | `track()` and `error()` remain non-blocking when promote emits start/success/failure events | Promote telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow                                     |

#### New assumptions discovered during implementation

| ID      | Port/Area          | New assumption                                                                                               | Trigger/Context                                                                            | Validation Plan                                                                 | Status    | Notes                                                                                                        |
| ------- | ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| PRM-N01 | target environment | `promote` always targets production; targetEnvironment is removed from `PromoteRequest` and `PromoteReceipt` | v3.0.0 refactor removed caller-supplied environment from all five non-logs/status commands | Validate that `PromoteRequest` compiles without `targetEnvironment`; tests pass | validated | `PromoteRequest = { manifest }`, `PromoteReceipt` has no `targetEnvironment`; output hard-codes "production" |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [x] Test(s): `src/adapters/stub-promote-client.test.ts`, `src/cli.test.ts` (promote section), `src/integration-tests/promote.test.ts`
  - [x] Decision updates: `PromoteRequest`/`PromoteReceipt` simplified; too-many-args guard tightened to `> 2`
- Outcome summary: PRM-002 invalidated. `promote` always targets production; the targetEnvironment argument is gone. PRM-N01 captures the new fixed-semantics assumption.

#### Impact if assumptions changed

- Affected command behavior: `universe promote` argument model, success output, and failure mapping
- Affected ports/adapters: `PromoteClient`, stub promote adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: promote TODO phase ordering, promote error taxonomy, and migration notes for real adapter parity

---

## Command — `rollback`

### Current assumptions

| ID      | Port/Area             | Assumption                                                                                                                                    | Why Needed                                                                         | Validation Plan                                                                                      | Status      | Notes                                                                                                                                 |
| ------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| RLB-001 | rollback command flow | `rollback` can follow the same manifest-first pattern as `deploy` and `promote`, reading `platform.yaml` from a directory or `cwd` by default | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory rollback flows                       | validated   | Keeps rollback non-interactive in spike mode                                                                                          |
| RLB-002 | target environment    | A reduced rollback target set with `production` as the default is sufficient for the spike                                                    | Keeps scope small while exercising command-specific rollback behavior              | Validate with argument parsing tests, success-path tests, and assumptions review                     | invalidated | Invalidated v3.0.0: `rollback` now always targets production; targetEnvironment is no longer a caller-supplied argument. See RLB-N01. |
| RLB-003 | stub rollback adapter | A deterministic in-memory stub is sufficient to validate rollback UX without simulating full deployment-history orchestration                 | Avoids premature modeling of provider internals while proving command shape        | Validate with unit tests for deterministic IDs, repeated rollbacks, and explicit failure fixtures    | validated   | Stub must remain network-free and reset between instances                                                                             |
| RLB-004 | error taxonomy        | `rollback` needs a command-specific typed failure (`RollbackError`) rather than the shared deferred-command contract once promoted            | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering rollback-client failures                                | validated   | Exit code 16; unique and documented in `EXIT_CODES`                                                                                   |
| RLB-005 | observability guard   | Rollback telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                                | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert rollback exit/result is unchanged | validated   | Payloads exclude secrets; observability throw tested and confirmed non-blocking                                                       |

#### Unknowns

| ID      | Port/Area         | Unknown                                                                                                       | Risk if Wrong | Decision Needed By                         | Owner    | Notes                                                                 |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------ | -------- | --------------------------------------------------------------------- |
| RLB-U01 | rollback receipt  | Whether the real platform returns only a rollback identifier or richer metadata (restored version, timestamp) | Medium        | Before replacing the stub adapter          | platform | Keep stub receipt minimal but extendable                              |
| RLB-U02 | target mapping    | Whether future rollback targets will use friendly names (`production`) or provider-specific labels            | Medium        | Before real rollback contract is finalized | platform | Normalize to CLI-facing names in spike; map later if provider differs |
| RLB-U03 | failure semantics | Which provider failure classes should become typed errors beyond `RollbackError`                              | Medium        | Before production adapter implementation   | platform | Spike keeps one typed rollback failure to avoid speculative taxonomy  |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                     | Source command behavior             | Priority    | Notes                                                                                                |
| ------- | ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| RLB-C01 | rollback client           | `rollback(input) -> receipt` with normalized `RollbackError` failures                        | `universe rollback` success path    | must-have   | Input contains only manifest; targetEnvironment is implicit in command semantics (always production) |
| RLB-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                         | Manifest lookup for rollback        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`                                       |
| RLB-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                                 | Manifest validation before rollback | must-have   | Reuses existing validation path                                                                      |
| RLB-C04 | observability client      | `track()` and `error()` remain non-blocking when rollback emits start/success/failure events | Rollback telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow                                     |

#### New assumptions discovered during implementation

| ID      | Port/Area          | New assumption                                                                                                  | Trigger/Context                                                                            | Validation Plan                                                                  | Status    | Notes                                                                                                          |
| ------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| RLB-N01 | target environment | `rollback` always targets production; targetEnvironment is removed from `RollbackRequest` and `RollbackReceipt` | v3.0.0 refactor removed caller-supplied environment from all five non-logs/status commands | Validate that `RollbackRequest` compiles without `targetEnvironment`; tests pass | validated | `RollbackRequest = { manifest }`, `RollbackReceipt` has no `targetEnvironment`; output hard-codes "production" |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [x] Test(s): `src/adapters/stub-rollback-client.test.ts`, `src/cli.test.ts` (rollback section), `src/integration-tests/rollback.test.ts`
  - [x] Decision updates: `RollbackRequest`/`RollbackReceipt` simplified; too-many-args guard tightened to `> 2`
- Outcome summary: RLB-002 invalidated. `rollback` always targets production; the targetEnvironment argument is gone. RLB-N01 captures the new fixed-semantics assumption.

#### Impact if assumptions changed

- Affected command behavior: `universe rollback` argument model, success output, and failure mapping
- Affected ports/adapters: `RollbackClient`, stub rollback adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: rollback TODO phase ordering, rollback error taxonomy, and migration notes for real adapter parity

---

## Command — `logs`

### Current assumptions

| ID      | Port/Area         | Assumption                                                                                                                                     | Why Needed                                                                         | Validation Plan                                                                                  | Status    | Notes                                                                           |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------- |
| LOG-001 | logs command flow | `logs` can follow the same manifest-first pattern as the other promoted commands, reading `platform.yaml` from a directory or `cwd` by default | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory logs flows                       | validated | Keeps logs non-interactive in spike mode                                        |
| LOG-002 | environment scope | A reduced environment set with `preview` as the default is sufficient for the spike                                                            | Keeps scope small while exercising command-specific log retrieval behavior         | Validate with argument parsing tests, success-path tests, and assumptions review                 | validated | Additional environments can be added when real provider contracts are defined   |
| LOG-003 | stub logs adapter | A deterministic stub response is sufficient to validate logs UX without simulating a real streaming backend                                    | Avoids premature modeling of provider internals while proving command shape        | Validate with unit tests for stable entries, repeated reads, and explicit failure fixtures       | validated | Stub must remain network-free and snapshot-friendly                             |
| LOG-004 | error taxonomy    | `logs` needs a command-specific typed failure (`LogsError`) rather than the shared deferred-command contract once promoted                     | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering logs-client failures                                | validated | Exit code 17; unique and documented in `EXIT_CODES`                             |
| LOG-005 | observability     | Logs telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                                     | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert logs exit/result is unchanged | validated | Payloads exclude secrets; observability throw tested and confirmed non-blocking |

#### Unknowns

| ID      | Port/Area       | Unknown                                                                                  | Risk if Wrong | Decision Needed By                       | Owner    | Notes                                                            |
| ------- | --------------- | ---------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- | -------- | ---------------------------------------------------------------- |
| LOG-U01 | logs response   | Whether the real platform will return raw lines only or structured entries with metadata | Medium        | Before replacing the stub adapter        | platform | Keep stub entries structured but minimal                         |
| LOG-U02 | retention model | Whether future logs queries need paging, tailing, or time-range filters                  | Medium        | Before real logs contract is finalized   | platform | Spike keeps one simple deterministic fetch path                  |
| LOG-U03 | failure model   | Which provider failure classes should become typed errors beyond `LogsError`             | Medium        | Before production adapter implementation | platform | Spike keeps one typed logs failure to avoid speculative taxonomy |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                 | Source command behavior         | Priority    | Notes                                                            |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- | ----------- | ---------------------------------------------------------------- |
| LOG-C01 | logs client               | `fetchLogs(input) -> response` with normalized `LogsError` failures                      | `universe logs` success path    | must-have   | Input should include manifest and target environment             |
| LOG-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                     | Manifest lookup for logs        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`   |
| LOG-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                             | Manifest validation before logs | must-have   | Reuses existing validation path                                  |
| LOG-C04 | observability client      | `track()` and `error()` remain non-blocking when logs emits start/success/failure events | Logs telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow |

#### New assumptions discovered during implementation

| ID  | Port/Area | New assumption | Trigger/Context | Validation Plan | Status | Notes |
| --- | --------- | -------------- | --------------- | --------------- | ------ | ----- |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [ ] Test(s):
  - [ ] Notes/docs:
  - [ ] Decision updates:
- ## Outcome summary:

#### Impact if assumptions changed

- Affected command behavior: `universe logs` argument model, rendered output, and failure mapping
- Affected ports/adapters: `LogsClient`, stub logs adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: logs TODO phase ordering, logs error taxonomy, and migration notes for real adapter parity

---

## Command — `status`

### Current assumptions

| ID      | Port/Area           | Assumption                                                                                                                                       | Why Needed                                                                         | Validation Plan                                                                                    | Status    | Notes                                                                           |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| STS-001 | status command flow | `status` can follow the same manifest-first pattern as the other promoted commands, reading `platform.yaml` from a directory or `cwd` by default | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory status flows                       | validated | Keeps status non-interactive in spike mode                                      |
| STS-002 | environment scope   | A reduced environment set with `preview` as the default is sufficient for the spike                                                              | Keeps scope small while exercising command-specific state retrieval behavior       | Validate with argument parsing tests, success-path tests, and assumptions review                   | validated | Additional environments can be added when real provider contracts are defined   |
| STS-003 | stub status adapter | A deterministic stub snapshot is sufficient to validate status UX without simulating real infrastructure state                                   | Avoids premature modeling of provider internals while proving command shape        | Validate with unit tests for stable fields, repeated reads, and explicit failure fixtures          | validated | Stub must remain network-free and snapshot-friendly                             |
| STS-004 | error taxonomy      | `status` needs a command-specific typed failure (`StatusError`) rather than the shared deferred-command contract once promoted                   | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering status-client failures                                | validated | Exit code 18; unique and documented in `EXIT_CODES`                             |
| STS-005 | observability       | Status telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                                     | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert status exit/result is unchanged | validated | Payloads exclude secrets; observability throw tested and confirmed non-blocking |

#### Unknowns

| ID      | Port/Area        | Unknown                                                                                          | Risk if Wrong | Decision Needed By                       | Owner    | Notes                                                              |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------- | -------- | ------------------------------------------------------------------ |
| STS-U01 | status response  | Whether the real platform will return a simple state enum or a richer status object with history | Medium        | Before replacing the stub adapter        | platform | Keep stub fields minimal but structured for easy schema evolution  |
| STS-U02 | state vocabulary | Which state values (`deploying`, `deployed`, `failed`, etc.) are canonical in the platform API   | Medium        | Before real status contract is finalized | platform | Spike uses a fixed deterministic state string per stub fixture     |
| STS-U03 | failure model    | Which provider failure classes should become typed errors beyond `StatusError`                   | Medium        | Before production adapter implementation | platform | Spike keeps one typed status failure to avoid speculative taxonomy |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                   | Source command behavior           | Priority    | Notes                                                            |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ----------- | ---------------------------------------------------------------- |
| STS-C01 | status client             | `getStatus(input) -> response` with normalized `StatusError` failures                      | `universe status` success path    | must-have   | Input should include manifest and target environment             |
| STS-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                       | Manifest lookup for status        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`   |
| STS-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                               | Manifest validation before status | must-have   | Reuses existing validation path                                  |
| STS-C04 | observability client      | `track()` and `error()` remain non-blocking when status emits start/success/failure events | Status telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow |

#### New assumptions discovered during implementation

| ID      | Port/Area        | New assumption                                                                                                          | Trigger/Context                                                                   | Validation Plan                                                                                 | Status    | Notes                                                                                           |
| ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| STS-N01 | state vocabulary | A fixed `StatusState` union (`ACTIVE`, `DEPLOYING`, `FAILED`, `INACTIVE`) is sufficient for spike snapshot determinism  | Needed to type `StatusResponse.state` without coupling to an unknown platform API | Validate with unit tests returning `ACTIVE` and confirm string-union is extensible at migration | validated | Stub always returns `ACTIVE`; real adapter must map provider states to this union or replace it |
| STS-N02 | type boundary    | `CliDependencies.statusClient` should use the typed port contract (`StatusRequest`/`StatusResponse`) not inline anonyms | Allows strict TypeScript checking of state values in test stubs via `StatusState` | Confirm tsc passes with no cast-to-any workarounds in test files                                | validated | Required importing `StatusResponse` in test stubs to satisfy the `StatusState` constraint       |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [x] Test(s): `src/adapters/stub-status-client.test.ts` (6 tests), `src/cli.status.test.ts` (13 tests), `src/integration-tests/status.test.ts` (2 tests), `src/container.test.ts` (guard)
  - [x] Notes/docs: `design/future-command-expansion.md` updated; status listed at v2.19.0
  - [x] Decision updates: `StatusState` union defined; exit code 18 assigned; `state: string` typed strictly
- Outcome summary: All STS-001–005 assumptions validated. Status follows the identical manifest-first pattern as `logs`, `rollback`, `promote`, and `deploy`. Stub is deterministic and snapshot-friendly. Two new assumptions (STS-N01, STS-N02) captured around state vocabulary and type boundary choices.

#### Impact if assumptions changed

- Affected command behavior: `universe status` argument model, rendered snapshot output, and failure mapping
- Affected ports/adapters: `StatusClient`, stub status adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: status TODO phase ordering, status error taxonomy, and migration notes for real adapter parity

#### Remaining unknowns for real status adapter migration

| ID      | Unknown                                                                                        | Risk if Wrong | Notes                                                                              |
| ------- | ---------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| STS-U01 | Whether the real platform returns a simple state enum or a richer object with history/metadata | Medium        | `StatusResponse` should be kept minimal until the provider contract is defined     |
| STS-U02 | Which canonical state values the platform API uses for `ACTIVE`, `DEPLOYING`, etc.             | Medium        | `StatusState` union may need expansion or a mapping layer at the adapter boundary  |
| STS-U03 | Which provider failure classes should become typed errors beyond `StatusError`                 | Medium        | Keep one typed failure in spike; expand taxonomy when real error categories emerge |

---

## Command — `list`

### Current assumptions

| ID      | Port/Area         | Assumption                                                                                                                                     | Why Needed                                                                         | Validation Plan                                                                                  | Status      | Notes                                                                                                                    |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| LST-001 | list command flow | `list` can follow the same manifest-first pattern as the other promoted commands, reading `platform.yaml` from a directory or `cwd` by default | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory list flows                       | validated   | Confirmed: `src/cli.list.test.ts` tests default-cwd path and explicit-directory path                                     |
| LST-002 | environment scope | A reduced environment set with `preview` as the default is sufficient for the spike                                                            | Keeps scope small while exercising command-specific list retrieval behavior        | Validate with argument parsing tests, success-path tests, and assumptions review                 | invalidated | Invalidated v3.0.0: `list` now always targets preview; environment is no longer a caller-supplied argument. See LST-N03. |
| LST-003 | stub list adapter | A deterministic stub response is sufficient to validate list UX without simulating a real backend                                              | Avoids premature modeling of provider internals while proving command shape        | Validate with unit tests for stable entries, repeated reads, and explicit failure fixtures       | validated   | Confirmed: `StubListClient` returns two fixed entries; sentinel `"list-failure"` rejects                                 |
| LST-004 | error taxonomy    | `list` needs a command-specific typed failure (`ListError`) rather than the shared deferred-command contract once promoted                     | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering list-client failures                                | validated   | Confirmed: `ListError` assigned exit code 19; tested in `cli.list.test.ts` and `integration-tests/list.test.ts`          |
| LST-005 | observability     | List telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                                     | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert list exit/result is unchanged | validated   | Confirmed: `list.start`/`list.success`/`list.failure` tested; throwing observability exits 0                             |

#### Unknowns

| ID      | Port/Area      | Unknown                                                                            | Risk if Wrong | Decision Needed By                       | Owner    | Notes                                                            |
| ------- | -------------- | ---------------------------------------------------------------------------------- | ------------- | ---------------------------------------- | -------- | ---------------------------------------------------------------- |
| LST-U01 | list response  | Whether the real platform will return a flat list or a richer object with metadata | Medium        | Before replacing the stub adapter        | platform | Keep stub entries minimal but structured for easy schema changes |
| LST-U02 | list semantics | What entities are included in the list (deployments, resources, both, etc.)        | Medium        | Before real list contract is finalized   | platform | Spike uses a fixed deterministic set per stub fixture            |
| LST-U03 | failure model  | Which provider failure classes should become typed errors beyond `ListError`       | Medium        | Before production adapter implementation | platform | Spike keeps one typed list failure to avoid speculative taxonomy |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                 | Source command behavior         | Priority    | Notes                                                                                       |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| LST-C01 | list client               | `getList(input) -> response` with normalized `ListError` failures                        | `universe list` success path    | must-have   | Input contains only manifest; environment is implicit in command semantics (always preview) |
| LST-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                     | Manifest lookup for list        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`                              |
| LST-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                             | Manifest validation before list | must-have   | Reuses existing validation path                                                             |
| LST-C04 | observability client      | `track()` and `error()` remain non-blocking when list emits start/success/failure events | List telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow                            |

#### New assumptions discovered during implementation

| ID      | Port/Area         | New assumption                                                                                                                                   | Trigger/Context                                                                            | Validation Plan                                                                           | Status    | Notes                                                                                                  |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| LST-N01 | response shape    | A flat `DeploymentEntry[]` with `deploymentId`, `state`, and `deployedAt` is sufficient for spike rendering without a paginated or nested schema | Needed to define `ListResponse` without a real provider contract                           | Validate that stub entries are snapshot-stable and that field names survive serialization | validated | Stub returns two fixed entries; real adapter must map provider schema or add a normalization layer     |
| LST-N02 | type boundary     | `CliDependencies.listClient` should use the typed port contract (`ListRequest`/`ListResponse`) rather than inline anonymous types                | Keeps type checking consistent with the `statusClient` pattern established earlier         | Confirm tsc passes with no cast-to-any workarounds in test stubs                          | validated | `ListRequest`/`ListResponse` imported in `cli.ts` and test files; tsc clean with no workarounds needed |
| LST-N03 | environment scope | `list` always targets preview; environment is removed from `ListRequest` and `ListResponse`                                                      | v3.0.0 refactor removed caller-supplied environment from all five non-logs/status commands | Validate that `ListRequest` compiles without `environment`; tests pass                    | validated | `ListRequest = { manifest }`, `ListResponse` has no `environment` field; output hard-codes "preview"   |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [x] Test(s): `src/adapters/stub-list-client.test.ts` (6 tests), `src/cli.list.test.ts` (13 tests), `src/integration-tests/list.test.ts` (2 tests), `src/container.test.ts` (guard)
  - [x] Notes/docs: `design/future-command-expansion.md` updated; list listed at v2.22.0
  - [x] Decision updates: `DeploymentEntry` shape defined; exit code 19 assigned; typed port contract used in `CliDependencies`
- Outcome summary: LST-001, LST-003–005 validated. LST-002 invalidated v3.0.0: `list` always targets preview, no environment argument. LST-N01/N02 validated at initial implementation; LST-N03 captures the fixed-semantics change from v3.0.0.

#### Impact if assumptions changed

- Affected command behavior: `universe list` argument model, rendered output, and failure mapping
- Affected ports/adapters: `ListClient`, stub list adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: list TODO phase ordering, list error taxonomy, and migration notes for real adapter parity

---

## Command — `teardown`

### Current assumptions

| ID      | Port/Area             | Assumption                                                                                                                                         | Why Needed                                                                         | Validation Plan                                                                                      | Status      | Notes                                                                                                                       |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| TDN-001 | teardown command flow | `teardown` can follow the same manifest-first pattern as the other promoted commands, reading `platform.yaml` from a directory or `cwd` by default | Reuses existing manifest parsing/validation path and keeps CLI behavior consistent | Validate with CLI tests for default-path and explicit-directory teardown flows                       | validated   | Confirmed: `src/cli.teardown.test.ts` tests default-cwd path and explicit-directory path                                    |
| TDN-002 | environment scope     | A reduced environment set with `preview` as the default is sufficient for the spike                                                                | Keeps scope small while exercising command-specific teardown behavior              | Validate with argument parsing tests, success-path tests, and assumptions review                     | invalidated | Invalidated v3.0.0: `teardown` has no environment selector; `TeardownRequest` contains only the manifest. See TDN-N03.      |
| TDN-003 | stub teardown adapter | A deterministic stub response is sufficient to validate teardown UX without simulating a real backend                                              | Avoids premature modeling of provider internals while proving command shape        | Validate with unit tests for stable entries, repeated runs, and explicit failure fixtures            | validated   | Confirmed: `StubTeardownClient` returns incrementing IDs; sentinel `"teardown-failure"` rejects                             |
| TDN-004 | error taxonomy        | `teardown` needs a command-specific typed failure (`TeardownError`) rather than the shared deferred-command contract once promoted                 | Preserves actionable UX and stable exit semantics after command promotion          | Validate with CLI and adapter tests covering teardown-client failures                                | validated   | Confirmed: `TeardownError` assigned exit code 20; tested in `cli.teardown.test.ts` and `integration-tests/teardown.test.ts` |
| TDN-005 | observability         | Teardown telemetry can use the existing `ObservabilityClient` port and must remain best-effort and secret-safe                                     | Avoids introducing a new observability boundary for one command                    | Validate with tests that simulate observability failure and assert teardown exit/result is unchanged | validated   | Confirmed: `teardown.start`/`teardown.success`/`teardown.failure` tested; throwing observability exits 0                    |

#### Unknowns

| ID      | Port/Area          | Unknown                                                                                      | Risk if Wrong | Decision Needed By                         | Owner    | Notes                                                                |
| ------- | ------------------ | -------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------ | -------- | -------------------------------------------------------------------- |
| TDN-U01 | teardown result    | Whether the real platform will return a simple confirmation or a richer object with metadata | Medium        | Before replacing the stub adapter          | platform | Keep stub result minimal but structured for easy schema changes      |
| TDN-U02 | teardown semantics | What entities are affected by teardown (all resources, partial, etc.)                        | Medium        | Before real teardown contract is finalized | platform | Spike uses a fixed deterministic result per stub fixture             |
| TDN-U03 | failure model      | Which provider failure classes should become typed errors beyond `TeardownError`             | Medium        | Before production adapter implementation   | platform | Spike keeps one typed teardown failure to avoid speculative taxonomy |

#### Required adapter/provider capabilities

| ID      | Port/Area                 | Required capability (CLI-owned contract)                                                     | Source command behavior             | Priority    | Notes                                                              |
| ------- | ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- | ----------- | ------------------------------------------------------------------ |
| TDN-C01 | teardown client           | `teardown(input) -> response` with normalized `TeardownError` failures                       | `universe teardown` success path    | must-have   | Input contains only manifest; teardown has no environment selector |
| TDN-C02 | project reader            | `readFile(filePath) -> manifestYaml`                                                         | Manifest lookup for teardown        | must-have   | Reuses existing `ProjectReaderPort` capability from `register`     |
| TDN-C03 | platform manifest service | `validateManifest(yaml) -> PlatformManifest`                                                 | Manifest validation before teardown | must-have   | Reuses existing validation path                                    |
| TDN-C04 | observability client      | `track()` and `error()` remain non-blocking when teardown emits start/success/failure events | Teardown telemetry                  | should-have | Must preserve safe wrapper behavior already used by the CLI flow   |

#### New assumptions discovered during implementation

| ID      | Port/Area         | New assumption                                                                                                                             | Trigger/Context                                                                             | Validation Plan                                                                                         | Status      | Notes                                                                                                                            |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TDN-N01 | receipt shape     | A minimal `TeardownReceipt` with `name`, `targetEnvironment`, and `teardownId` is sufficient for deterministic output without extra fields | Needed to define `TeardownReceipt` without a real provider contract                         | Validate that stub receipt is snapshot-stable and fields survive serialization                          | invalidated | Invalidated v3.0.0: `targetEnvironment` removed from `TeardownReceipt`; receipt is now `{ name, teardownId }` only. See TDN-N03. |
| TDN-N02 | all-implemented   | All 9 commands are now fully implemented; `DEFERRED_COMMANDS` is empty and the deferred-command test suite has been removed                | Teardown was the last remaining deferred command; removing it completes the spike scope     | Confirm no `DeferredCommandError` paths remain in `runCli`; container guard covers all 9                | validated   | `DEFERRED_COMMANDS = new Set()` in `cli.ts`; container.test.ts asserts all 9 clients are stub instances                          |
| TDN-N03 | environment scope | `teardown` has no environment selector; `TeardownRequest` and `TeardownReceipt` contain no environment field                               | v3.0.0 refactor: teardown semantics are environment-agnostic (tears down the whole project) | Validate that `TeardownRequest = { manifest }` and `TeardownReceipt = { name, teardownId }`; tests pass | validated   | Output no longer mentions an environment; stub ID format is `stub-teardown-<name>-<count>`                                       |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [x] Test(s): `src/adapters/stub-teardown-client.test.ts` (6 tests), `src/cli.teardown.test.ts` (13 tests), `src/integration-tests/teardown.test.ts` (2 tests), `src/container.test.ts` (guard)
  - [x] Notes/docs: `design/future-command-expansion.md` updated; teardown listed at v2.25.0; all 9 commands implemented
  - [x] Decision updates: `TeardownReceipt` shape defined; exit code 20 assigned; `DEFERRED_COMMANDS` is now empty
- Outcome summary: TDN-001, TDN-003–005 validated. TDN-002 invalidated v3.0.0: `teardown` has no environment selector. TDN-N01 invalidated v3.0.0: `targetEnvironment` removed from `TeardownReceipt`. TDN-N02 remains validated. TDN-N03 captures the environment-agnostic contract.

#### Impact if assumptions changed

- Affected command behavior: `universe teardown` argument model, rendered output, and failure mapping
- Affected ports/adapters: `TeardownClient`, stub teardown adapter, manifest validation reuse, observability wrappers
- Required TODO/PRD changes: teardown TODO phase ordering, teardown error taxonomy, and migration notes for real adapter parity

---

## Command Template

### Command — `<name>`

#### Current assumptions

| ID       | Port/Area   | Assumption         | Why Needed                            | Validation Plan                                  | Status | Notes |
| -------- | ----------- | ------------------ | ------------------------------------- | ------------------------------------------------ | ------ | ----- |
| CMDX-001 | examplePort | Example assumption | Enables command behavior in stub mode | Validate against provider/API doc when available | open   |       |

#### Unknowns

| ID       | Port/Area   | Unknown                | Risk if Wrong | Decision Needed By        | Owner    | Notes |
| -------- | ----------- | ---------------------- | ------------- | ------------------------- | -------- | ----- |
| CMDX-U01 | examplePort | Example unknown detail | Medium        | Post-spike adapter design | platform |       |

#### Required adapter/provider capabilities

| ID       | Port/Area   | Required capability (CLI-owned contract)              | Source command behavior           | Priority  | Notes |
| -------- | ----------- | ----------------------------------------------------- | --------------------------------- | --------- | ----- |
| CMDX-C01 | examplePort | `createThing(input) -> result` with normalized errors | `universe <command>` success path | must-have |       |

#### New assumptions discovered during implementation

| ID       | Port/Area   | New assumption                      | Trigger/Context                | Validation Plan                                       | Status | Notes |
| -------- | ----------- | ----------------------------------- | ------------------------------ | ----------------------------------------------------- | ------ | ----- |
| CMDX-N01 | examplePort | Example newly discovered assumption | Found while handling edge case | Add contract test + validate with provider docs later | open   |       |

#### Validation evidence and outcomes

- Evidence links / artifacts:
  - [ ] Test(s):
  - [ ] Notes/docs:
  - [ ] Decision updates:
- ## Outcome summary:

#### Impact if assumptions changed

- Affected command behavior:
- Affected ports/adapters:
- Required TODO/PRD changes:

---

## Final Spike Review Checklist

- [ ] Every command or shared command-group section has a completed section in this register.
- [ ] Each command section includes current assumptions and newly discovered assumptions.
- [ ] Unknowns are either validated, deferred, or converted into explicit post-spike work.
- [ ] Required adapter/provider capabilities are defined per command or shared command group.
- [ ] Invalidated assumptions include impact and remediation notes.
