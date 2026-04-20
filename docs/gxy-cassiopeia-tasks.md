# gxy-cassiopeia — universe-cli tasks (T16–T20)

Extracted from `~/DEV/fCC/infra/docs/tasks/gxy-cassiopeia.md` so a universe-cli session can work without the infra repo open.

**Source of truth:** `~/DEV/fCC/infra/docs/tasks/gxy-cassiopeia.md` in the infra repo. If you update a task definition, update both files or prefer the infra-side version.

**Beads tracking:** Tasks are tracked in the infra repo's beads DB as `gxy-static-k7d.{17..21}` (T16=.17, T17=.18, T18=.19, T19=.20, T20=.21). Status updates must go through that DB.

## Dependency graph (start order)

```
T16 ──┐
      ├──> T18 ──> T19 ──> T20
T17 ──┘
```

- **T16** (Woodpecker API client) — ready, no deps
- **T17** (Config schema + site name validation) — ready, no deps
- **T18** (Rewrite `deploy`) — needs T16 + T17
- **T19** (Rewrite `promote`/`rollback`) — needs T18
- **T20** (Remove legacy rclone/S3 + release v0.4.0-beta.1) — needs T19

## Parallelism

T16 and T17 touch disjoint paths (`src/woodpecker/*` vs `src/config/*`) and can run in parallel across two sessions.

## Repo context

- All file paths in the tasks below are **absolute** and target this repo (`~/DEV/fCC-U/universe-cli`) — not the infra repo.
- The RFC at `~/DEV/fCC/infra/docs/rfc/gxy-cassiopeia.md` is the canonical spec. §4.8 covers universe-cli design.
- Do **not** run git write commands (commit/push/checkout) — the user drives git.
- Do **not** introduce `@aws-sdk` imports; Task 20 removes them.

---

### Task 16 [M]: universe-cli — Woodpecker API client

**Traceability:** Implements R15 streaming | Constrained by §4.8.6
**Files:**

- Create: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/woodpecker/client.ts`
- Create: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/woodpecker/types.ts`
- Create: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/woodpecker/client.test.ts`

#### Context

A self-contained `WoodpeckerClient` class with `createPipeline`, `streamLogs` (SSE), `getPipeline`. Bearer token auth. Typed responses. Used by deploy/promote/rollback commands.

#### Acceptance Criteria

- GIVEN `createPipeline(repoId, {branch, variables})` WHEN the mock server returns 200 with a Pipeline JSON THEN returns parsed Pipeline
- GIVEN the server returns 4xx/5xx THEN throws WoodpeckerError with status + body
- GIVEN `streamLogs` WHEN SSE data events arrive THEN yields parsed LogLine objects
- GIVEN SSE stream closes cleanly THEN the async generator returns
- Test coverage ≥ 85% on the client module

#### Verification

```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli && pnpm test src/woodpecker
```

**Expected output:** all tests pass.

#### Constraints

- Match the existing universe-cli style (ESM, strict TS, tsup build)
- No dependencies beyond `fetch` (native) and existing project deps
- Do NOT import from `@aws-sdk` — that's being removed from runtime deps (see Task 20)

#### Agent Prompt

````
You are implementing Task 16: universe-cli — Woodpecker API client.

## Repo and CWD

Work in the universe-cli repo: `/Users/mrugesh/DEV/fCC-U/universe-cli`. NOT the infra repo.

## Your Task

Implement `WoodpeckerClient` per RFC §4.8.6 lines 1451-1543. Typed TS class with Bearer auth, SSE log streaming, pipeline create + get. Test-first.

Read `/Users/mrugesh/DEV/fCC/infra/docs/rfc/gxy-cassiopeia.md` §4.8.6 before starting — the full TS is specified there.

### Step 1: Familiarize with codebase conventions
- Read `src/cli.ts` and `src/commands/deploy.ts` (current version) for code style, error hierarchy, output patterns.
- Read `package.json` for the test framework (vitest), build tool (tsup), lint (typescript-eslint).
- Read `tsconfig.json` for TS strict settings.

### Step 2: Write failing tests
Create `src/woodpecker/client.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { WoodpeckerClient } from "./client.js";
import { WoodpeckerError } from "./errors.js";

describe("WoodpeckerClient.createPipeline", () => {
  it("POSTs to /api/repos/{id}/pipelines with Bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({number: 42, status: "pending"}), {status: 200}));
    const client = new WoodpeckerClient("https://wp.example", "tok", fetchMock);
    const pipeline = await client.createPipeline(10, {branch: "main", variables: {OP: "deploy"}});
    expect(pipeline.number).toBe(42);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wp.example/api/repos/10/pipelines",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Authorization": "Bearer tok" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({branch: "main", variables: {OP: "deploy"}});
  });

  it("throws WoodpeckerError on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", {status: 401}));
    const client = new WoodpeckerClient("https://wp.example", "bad", fetchMock);
    await expect(client.createPipeline(10, {branch: "main"})).rejects.toThrow(WoodpeckerError);
  });
});

describe("WoodpeckerClient.streamLogs (SSE)", () => {
  it("yields parsed LogLine for each data event", async () => {
    // Construct a readable stream that emits SSE-formatted events
    const encoder = new TextEncoder();
    const events = [
      'data: {"ts":1,"message":"hello"}\n\n',
      'data: {"ts":2,"message":"world"}\n\n',
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const e of events) controller.enqueue(encoder.encode(e));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {status: 200}));
    const client = new WoodpeckerClient("https://wp.example", "tok", fetchMock);
    const lines: any[] = [];
    for await (const line of client.streamLogs(10, 42, 1)) lines.push(line);
    expect(lines).toEqual([{ts:1, message:"hello"}, {ts:2, message:"world"}]);
  });

  it("handles events split across chunks", async () => {
    // Partial event boundary across two chunks should not drop data
  });
});
```

Run: `pnpm test src/woodpecker` — tests FAIL (no client yet).

### Step 3: Implement client.ts
Create `src/woodpecker/client.ts` matching the RFC §4.8.6 code shape. Adapt the fetch signature to accept an injected `fetchFn` for testability:

```typescript
export class WoodpeckerClient {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
  // ... createPipeline, streamLogs (async generator), getPipeline
}
```

### Step 4: Define types
Create `src/woodpecker/types.ts`:

```typescript
export interface Pipeline {
  number: number;
  status: "pending" | "running" | "success" | "failure" | "killed" | "error" | "blocked" | "declined";
  created: number;
  started?: number;
  finished?: number;
  commit: string;
  branch: string;
  variables?: Record<string, string>;
}

export interface LogLine {
  ts: number;
  message: string;
  pos?: number;
  proc?: string;
}

export interface CreatePipelineOptions {
  branch: string;
  variables?: Record<string, string>;
}
```

### Step 5: Error class
Create `src/woodpecker/errors.ts`:

```typescript
export class WoodpeckerError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: string) {
    super(message);
    this.name = "WoodpeckerError";
  }
}
```

### Step 6: Index
Create `src/woodpecker/index.ts`:

```typescript
export { WoodpeckerClient } from "./client.js";
export { WoodpeckerError } from "./errors.js";
export type { Pipeline, LogLine, CreatePipelineOptions } from "./types.js";
```

### Step 7: Verify
```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli
pnpm test src/woodpecker
pnpm typecheck
pnpm lint src/woodpecker
```

Expect: all tests pass, typecheck clean, no lint warnings.

## Files

- Create: `src/woodpecker/client.ts`
- Create: `src/woodpecker/client.test.ts`
- Create: `src/woodpecker/types.ts`
- Create: `src/woodpecker/errors.ts`
- Create: `src/woodpecker/index.ts`

## Acceptance Criteria

- All tests in Step 2 pass
- Type coverage: `Pipeline`, `LogLine`, `CreatePipelineOptions` exported and used
- SSE parser handles multi-event buffers AND events split across chunks
- `WoodpeckerError` carries `status` + `body` when available
- `pnpm typecheck` clean
- Test coverage ≥ 85% of `client.ts` lines

## Context

The CLI uses this client to trigger Woodpecker pipelines and stream logs. All subsequent CLI commands (deploy/promote/rollback in Tasks 18-19) depend on it. Injecting `fetchFn` is critical for testability — do not bypass.

## When Stuck

If Woodpecker's SSE format differs from the `data: ...\n\n` convention (e.g., uses different event names), check the API docs at https://woodpecker-ci.org/api. If `streamLogs` runs into a disconnect mid-stream, the async generator should end gracefully; do NOT throw on `ReadableStream` close.

## Constraints

- TDD discipline
- Do NOT import from AWS SDK (@aws-sdk/*) — universe-cli is removing R2 dependencies
- Do NOT import from `node:*` — use Web APIs (fetch, TextDecoder, ReadableStream) for runtime portability
- Do NOT run git write commands
````

**Depends on:** Task 10 (needs a Woodpecker endpoint to target)

---

### Task 17 [M]: universe-cli — Config schema + site name validation

**Traceability:** Implements R13, config changes | Constrained by §4.8.1, §4.8.5, D19 (regex)
**Files:**

- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/config/schema.ts`
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/config/loader.ts`
- Create: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/validation/site-name.ts`
- Create: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/validation/site-name.test.ts`
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/config/schema.test.ts`

#### Context

Add a `woodpecker: {endpoint, repo_id}` section to the config schema. Remove the old `static.rclone_remote` and `static.bucket` fields (they're unused now). Site-name validation enforces the no-`--` rule + RFC-1123 DNS label constraints (D19).

#### Acceptance Criteria

- GIVEN a .universe.yaml with `woodpecker: {endpoint: ..., repo_id: 42}` WHEN loaded THEN schema validates
- GIVEN a config missing `woodpecker` THEN loader throws a clear error
- GIVEN `validateSiteName("hello-world")` THEN no throw
- GIVEN `validateSiteName("hello--world")` THEN throws "must not contain --"
- GIVEN `validateSiteName("Hello")` THEN throws (uppercase rejected)
- GIVEN `validateSiteName("-hello")` or `"hello-"` THEN throws (leading/trailing hyphen)
- GIVEN a name ending with `-preview` or starting with `preview-` THEN warns (console.warn) but does not throw

#### Verification

```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli && pnpm test src/validation src/config
```

**Expected output:** all tests pass.

#### Constraints

- Preserve existing config fields other than static.rclone_remote, static.bucket
- Regex lives in a single exported constant for reuse
- Validation throws on hard rules, warns on soft rules

#### Agent Prompt

````
You are implementing Task 17: universe-cli — Config schema update + site name validation.

## Repo and CWD

Work in the universe-cli repo: `/Users/mrugesh/DEV/fCC-U/universe-cli`.

## Your Task

Two independent units:
1. Update config schema to add `woodpecker: {endpoint, repo_id}` and remove the legacy `static.rclone_remote` + `static.bucket` fields.
2. Add site-name validation (no `--`, RFC-1123 DNS label, no leading/trailing hyphen).

Both are pre-reqs for Tasks 18-19.

Read RFC §4.8.1 (config schema) and §4.8.5 (site name validation) at `/Users/mrugesh/DEV/fCC/infra/docs/rfc/gxy-cassiopeia.md`.

### Step 1: Read existing schema
- `src/config/schema.ts` — current Zod or TS shape
- `src/config/loader.ts` — how config is read/validated
- `src/config/schema.test.ts` — existing test style

### Step 2: Site name validation — write failing tests first
Create `src/validation/site-name.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateSiteName, SITE_NAME_REGEX } from "./site-name.js";

describe("validateSiteName", () => {
  it("accepts valid names", () => {
    for (const n of ["hello-world", "docs", "a", "foo123", "a-b-c"]) {
      expect(() => validateSiteName(n)).not.toThrow();
    }
  });
  it("rejects double-hyphen", () => {
    expect(() => validateSiteName("hello--world")).toThrow(/must not contain "--"/);
  });
  it("rejects uppercase", () => {
    expect(() => validateSiteName("Hello")).toThrow();
  });
  it("rejects leading/trailing hyphen", () => {
    expect(() => validateSiteName("-hello")).toThrow();
    expect(() => validateSiteName("hello-")).toThrow();
  });
  it("rejects empty", () => {
    expect(() => validateSiteName("")).toThrow();
  });
  it("rejects >50 chars", () => {
    expect(() => validateSiteName("a".repeat(51))).toThrow(/1-50 chars/);
  });
  it("warns on preview-* and *-preview but does not throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateSiteName("preview-foo");
    validateSiteName("foo-preview");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
```

### Step 3: Implement src/validation/site-name.ts
Exact code per RFC §4.8.5 lines 1430-1464. Export `SITE_NAME_REGEX`, `SITE_NAME_MAX_LENGTH`, `validateSiteName`.

### Step 4: Schema — write failing tests first
Create new tests in `src/config/schema.test.ts`:

```typescript
describe("config schema with woodpecker section", () => {
  it("requires woodpecker.endpoint and woodpecker.repo_id", () => {
    const yaml = { name: "hello", static: { output_dir: "dist" } };
    expect(() => parseConfig(yaml)).toThrow(/woodpecker/);
  });
  it("accepts config with woodpecker section", () => {
    const yaml = {
      name: "hello",
      static: { output_dir: "dist" },
      woodpecker: { endpoint: "https://wp.example", repo_id: 42 },
    };
    const cfg = parseConfig(yaml);
    expect(cfg.woodpecker.repo_id).toBe(42);
  });
  it("rejects legacy static.rclone_remote and static.bucket fields", () => {
    const yaml = {
      name: "hello",
      static: { output_dir: "dist", rclone_remote: "r2", bucket: "foo" },
      woodpecker: { endpoint: "https://wp.example", repo_id: 42 },
    };
    expect(() => parseConfig(yaml)).toThrow(/rclone_remote|bucket/);
  });
});
```

### Step 5: Modify src/config/schema.ts
- Add `woodpecker: { endpoint: string; repo_id: number }` (required)
- Remove `rclone_remote` and `bucket` from the `static` sub-schema
- If using Zod: `.strict()` on the static schema so unknown fields are rejected

### Step 6: Update loader.ts
- Ensure `loadConfig` fails with a clear error when `woodpecker` section is missing: "woodpecker.endpoint required; see RFC gxy-cassiopeia §4.8.1 for the new config shape"

### Step 7: Wire validation into `universe create` and `universe register`
- Read `src/commands/create.ts` and `src/commands/register.ts` (if exists)
- Before creating/registering, call `validateSiteName(name)` — fail fast
- Add tests to those commands' test files to confirm the check fires

### Step 8: Verify
```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli
pnpm test src/validation src/config src/commands/create src/commands/register
pnpm typecheck
```

## Files

- Modify: `src/config/schema.ts`
- Modify: `src/config/loader.ts`
- Modify: `src/config/schema.test.ts`
- Create: `src/validation/site-name.ts`
- Create: `src/validation/site-name.test.ts`
- Modify: `src/commands/create.ts` (call validateSiteName)
- Modify: `src/commands/register.ts` (call validateSiteName) — if file exists
- Modify: corresponding `.test.ts` files

## Acceptance Criteria

- All tests pass (`pnpm test src/validation src/config`)
- `pnpm typecheck` clean
- Schema rejects config with `static.rclone_remote` or `static.bucket`
- Schema rejects config missing `woodpecker` section
- `validateSiteName("foo--bar")` throws
- `validateSiteName("preview-foo")` warns but does not throw

## Context

This is prep work for Tasks 18-19 (deploy/promote/rollback rewrites), which need the new config shape and validation in place. It also enforces the D19 naming rule at the earliest possible point (scaffold time), not at deploy time.

## When Stuck

If removing `rclone_remote` / `bucket` breaks existing commands (status, list, logs), those commands probably read R2 directly — flag as a blocker and check whether they should be stubbed to use Woodpecker API in later tasks.

## Constraints

- TDD: tests first
- Do NOT keep backward-compat shims for the removed fields — they must fail loudly so CI catches uses
- Do NOT touch `src/commands/deploy.ts`, `promote.ts`, `rollback.ts` (Tasks 18-19 own those)
- Do NOT run git write commands
````

**Depends on:** None

---

### Task 18 [M]: universe-cli — Rewrite `deploy` command

**Traceability:** Implements R10 | Constrained by §4.8.2, §7.2 (no R2 creds on dev machine)
**Files:**

- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/commands/deploy.ts`
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/commands/deploy.test.ts`

#### Context

Replace the current direct-S3 upload implementation with Woodpecker API trigger per RFC §4.8.2. The new implementation: resolves Woodpecker token from env, enforces git clean, creates a pipeline with OP=deploy + DEPLOY_TARGET=preview, optionally streams logs via SSE.

#### Acceptance Criteria

- GIVEN `universe deploy` WHEN run in a clean-git repo THEN triggers Woodpecker pipeline and returns success with pipeline number
- GIVEN a dirty git tree THEN fails with "commit changes before deploying"
- GIVEN no WOODPECKER_TOKEN env THEN fails with a clear error message
- GIVEN `--follow=false` THEN returns immediately without streaming
- GIVEN `--follow=true` (default in TTY) THEN streams pipeline logs until completion
- Tests cover: happy path, dirty git, missing token, API error

#### Verification

```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli && pnpm test src/commands/deploy
```

**Expected output:** tests pass.

#### Constraints

- Do NOT import `@aws-sdk/client-s3`, rclone, or any S3 code
- Remove any call to `createS3Client`, `uploadDirectory`, `writeAlias` from this file
- Must handle network errors gracefully

#### Agent Prompt

````
You are implementing Task 18: universe-cli — Rewrite `universe deploy`.

## Repo and CWD

Work in the universe-cli repo: `/Users/mrugesh/DEV/fCC-U/universe-cli`.

## Your Task

Replace the current `src/commands/deploy.ts` implementation entirely. The new version triggers a Woodpecker pipeline via API (using `WoodpeckerClient` from Task 16), optionally streams logs, and **never touches R2**.

Read RFC §4.8.2 (lines 1322-1366) for the full target shape.

### Step 1: Read current implementation
- `src/commands/deploy.ts` — current (direct R2 upload)
- Note: it imports `createS3Client`, `uploadDirectory`, `writeAlias` from `src/storage/*` and `src/deploy/upload.ts`. Those modules will be deleted in Task 20.

### Step 2: Write failing tests for the new shape
Modify or replace `src/commands/deploy.test.ts`. Tests should exercise:

```typescript
describe("universe deploy (Woodpecker)", () => {
  it("triggers pipeline with OP=deploy + DEPLOY_TARGET=preview", async () => {
    // Mock WoodpeckerClient.createPipeline; assert it's called with the right args
  });
  it("fails if git working tree is dirty", async () => {
    // Mock getGitState to return dirty
    // Assert deploy throws with "commit changes before deploying"
  });
  it("fails with clear message when WOODPECKER_TOKEN missing", async () => {
    // Unset env, assert CredentialError
  });
  it("streams logs when --follow (TTY default)", async () => {
    // Mock streamLogs generator
  });
  it("returns immediately with --follow=false", async () => {});
  it("outputs JSON with pipelineNumber, site, previewUrl when --json", async () => {});
});
```

Tests FAIL (current deploy.ts does not use WoodpeckerClient).

### Step 3: Rewrite deploy.ts
```typescript
import { loadConfig } from "../config/loader.js";
import { getGitState } from "../deploy/git.js";
import { WoodpeckerClient } from "../woodpecker/index.js";
import { resolveWoodpeckerToken } from "../credentials/woodpecker.js";
import { type OutputContext, outputSuccess, outputError } from "../output/format.js";
import { EXIT_GIT, EXIT_CREDENTIALS, exitWithCode } from "../output/exit-codes.js";

export interface DeployOptions {
  json: boolean;
  branch?: string;
  follow?: boolean;
}

export async function deploy(options: DeployOptions): Promise<void> {
  const config = loadConfig();
  const ctx: OutputContext = { json: options.json, command: "deploy" };
  let token: string;
  try {
    token = resolveWoodpeckerToken();
  } catch (err) {
    outputError(ctx, EXIT_CREDENTIALS, (err as Error).message);
    exitWithCode(EXIT_CREDENTIALS, (err as Error).message);
    return;
  }
  const git = getGitState();
  if (git.hash === null) {
    outputError(ctx, EXIT_GIT, "Not a git repository or no commits yet");
    exitWithCode(EXIT_GIT, "Not a git repository or no commits yet");
    return;
  }
  if (git.dirty) {
    outputError(ctx, EXIT_GIT, "Git working tree is dirty — commit changes before deploying");
    exitWithCode(EXIT_GIT, "Git working tree is dirty — commit changes before deploying");
    return;
  }
  const client = new WoodpeckerClient(config.woodpecker.endpoint, token);
  const pipeline = await client.createPipeline(config.woodpecker.repo_id, {
    branch: options.branch ?? git.branch,
    variables: { OP: "deploy", DEPLOY_TARGET: "preview" },
  });
  const previewDomain = config.domain?.preview ?? `${config.name}--preview.freecode.camp`;
  outputSuccess(ctx, `Deploy pipeline #${pipeline.number} started\n  Preview: https://${previewDomain}`, {
    pipelineNumber: pipeline.number,
    site: config.name,
    previewUrl: `https://${previewDomain}`,
    branch: options.branch ?? git.branch,
  });
  const shouldFollow = options.follow ?? process.stdout.isTTY;
  if (shouldFollow) {
    // Iterate over Woodpecker steps and stream each; or poll pipeline state and stream live step
    // Minimal v1: stream the first step's logs until pipeline completes
    await streamAllStepLogs(client, config.woodpecker.repo_id, pipeline.number);
  }
}

async function streamAllStepLogs(client: WoodpeckerClient, repoId: number, pipelineNum: number) {
  // Poll getPipeline until a step is running; stream its logs; advance to next step.
  // Acceptable v1 implementation: poll every 2s, print log lines as they arrive.
}
```

### Step 4: Create src/credentials/woodpecker.ts
```typescript
import { CredentialError } from "../errors.js";

export function resolveWoodpeckerToken(): string {
  const token = process.env.WOODPECKER_TOKEN;
  if (!token) {
    throw new CredentialError(
      "WOODPECKER_TOKEN not set. Create a token at " +
      "https://woodpecker.freecodecamp.net/user/tokens and export via direnv or your shell profile.",
    );
  }
  return token;
}
```

### Step 5: Verify tests pass
```bash
pnpm test src/commands/deploy src/credentials
pnpm typecheck
```

## Files

- Modify: `src/commands/deploy.ts` (full rewrite)
- Modify: `src/commands/deploy.test.ts` (new tests)
- Create: `src/credentials/woodpecker.ts`
- Create: `src/credentials/woodpecker.test.ts`

## Acceptance Criteria

- All tests pass
- No imports from `@aws-sdk/*` in `deploy.ts`
- No references to `createS3Client`, `uploadDirectory`, `writeAlias` in `deploy.ts`
- Dirty git tree fails with exit code `EXIT_GIT`
- Missing WOODPECKER_TOKEN fails with exit code `EXIT_CREDENTIALS`
- `--json` output includes pipelineNumber + site + previewUrl

## Context

This is the CLI-side counterpart to Task 21 (the pipeline YAML). The CLI triggers the pipeline, the pipeline does the build+upload+alias on Woodpecker (with its repo-scoped credentials). Developer never handles R2.

## When Stuck

If streaming logs across multi-step pipelines is complex, minimal v1 is: tail the first step's logs, then on completion move to next step via `getPipeline` polling. Don't over-engineer.

## Constraints

- TDD
- Do NOT import S3 SDK
- Do NOT write to R2 directly; Woodpecker does that
- Do NOT break the existing `--json` output contract (consumers parse it)
- Do NOT run git write commands
````

**Depends on:** Task 16, Task 17

---

### Task 19 [M]: universe-cli — Rewrite `promote` + `rollback`

**Traceability:** Implements R11, R12 | Constrained by §4.8.3, §4.8.4
**Files:**

- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/commands/promote.ts`
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/commands/rollback.ts`
- Modify: corresponding `.test.ts` files

#### Context

Parallel rewrites to `deploy` — both commands now trigger Woodpecker pipelines with appropriate `OP` variables. `rollback` requires `--to <deploy-id>`.

#### Acceptance Criteria

- GIVEN `universe promote` WHEN invoked THEN Woodpecker pipeline with OP=promote triggered
- GIVEN `universe rollback --to 20260501-120000-abc123` THEN pipeline with OP=rollback + ROLLBACK_TO triggered
- GIVEN `universe rollback` without `--to` THEN fails with clear error
- Tests cover: happy paths, missing --to, API errors

#### Verification

```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli && pnpm test src/commands/promote src/commands/rollback
```

**Expected output:** tests pass.

#### Constraints

- No direct R2 access
- Follow the same pattern as `deploy.ts` (Task 18)
- Use the `WoodpeckerClient` from Task 16

#### Agent Prompt

````
You are implementing Task 19: universe-cli — Rewrite `promote` + `rollback`.

## Repo and CWD

Work in the universe-cli repo: `/Users/mrugesh/DEV/fCC-U/universe-cli`.

## Your Task

Parallel rewrites to `deploy` (Task 18) for the promote and rollback commands. Same pattern: trigger Woodpecker pipeline with appropriate OP variable.

Read RFC §4.8.3 (lines 1367-1395) and §4.8.4 (lines 1396-1429) for the target shapes.

### Step 1: Write failing tests
`src/commands/promote.test.ts`:

```typescript
describe("universe promote", () => {
  it("triggers pipeline with OP=promote", async () => {
    // Mock WoodpeckerClient; assert createPipeline called with {OP: "promote"} variables
  });
  it("outputs production URL", async () => {});
});
```

`src/commands/rollback.test.ts`:

```typescript
describe("universe rollback", () => {
  it("requires --to <deploy-id>", async () => {
    // Assert fails with clear message when --to is absent
  });
  it("triggers pipeline with OP=rollback and ROLLBACK_TO", async () => {});
  it("validates deploy-id format", async () => {
    // Invalid format (not matching deploy-id regex) should fail before API call
  });
});
```

Tests FAIL (current promote.ts/rollback.ts still do R2 writes).

### Step 2: Rewrite promote.ts
```typescript
import { loadConfig } from "../config/loader.js";
import { getGitState } from "../deploy/git.js";
import { WoodpeckerClient } from "../woodpecker/index.js";
import { resolveWoodpeckerToken } from "../credentials/woodpecker.js";
import { type OutputContext, outputSuccess, outputError } from "../output/format.js";
import { EXIT_CREDENTIALS, exitWithCode } from "../output/exit-codes.js";

export interface PromoteOptions {
  json: boolean;
  follow?: boolean;
}

export async function promote(options: PromoteOptions): Promise<void> {
  const config = loadConfig();
  const ctx: OutputContext = { json: options.json, command: "promote" };
  let token: string;
  try { token = resolveWoodpeckerToken(); }
  catch (err) { outputError(ctx, EXIT_CREDENTIALS, (err as Error).message); exitWithCode(EXIT_CREDENTIALS, (err as Error).message); return; }

  const git = getGitState();
  const client = new WoodpeckerClient(config.woodpecker.endpoint, token);
  const pipeline = await client.createPipeline(config.woodpecker.repo_id, {
    branch: git.branch ?? "main",
    variables: { OP: "promote" },
  });
  const productionDomain = config.domain?.production ?? `${config.name}.freecode.camp`;
  outputSuccess(ctx, `Promote pipeline #${pipeline.number} started\n  Production: https://${productionDomain}`, {
    pipelineNumber: pipeline.number,
    site: config.name,
    productionUrl: `https://${productionDomain}`,
  });

  if (options.follow ?? process.stdout.isTTY) {
    await streamAllStepLogs(client, config.woodpecker.repo_id, pipeline.number);
  }
}
```

### Step 3: Rewrite rollback.ts
```typescript
import { loadConfig } from "../config/loader.js";
import { WoodpeckerClient } from "../woodpecker/index.js";
import { resolveWoodpeckerToken } from "../credentials/woodpecker.js";
import { type OutputContext, outputSuccess, outputError } from "../output/format.js";
import { EXIT_ARGS, EXIT_CREDENTIALS, exitWithCode } from "../output/exit-codes.js";

const DEPLOY_ID_STRICT_REGEX = /^\d{8}-\d{6}-([a-f0-9]{7}|dirty-[a-f0-9]{8})$/;

export interface RollbackOptions {
  json: boolean;
  to?: string;
  follow?: boolean;
}

export async function rollback(options: RollbackOptions): Promise<void> {
  const config = loadConfig();
  const ctx: OutputContext = { json: options.json, command: "rollback" };

  if (!options.to) {
    outputError(ctx, EXIT_ARGS, "--to <deploy-id> is required. Use the Woodpecker UI pipeline history to find prior deploy IDs.");
    exitWithCode(EXIT_ARGS, "--to required");
    return;
  }
  if (!DEPLOY_ID_STRICT_REGEX.test(options.to)) {
    outputError(ctx, EXIT_ARGS, `Invalid deploy ID format: ${options.to}. Expected YYYYMMDD-HHMMSS-<sha7> or YYYYMMDD-HHMMSS-dirty-<hex8>.`);
    exitWithCode(EXIT_ARGS, "Invalid deploy ID");
    return;
  }

  let token: string;
  try { token = resolveWoodpeckerToken(); }
  catch (err) { outputError(ctx, EXIT_CREDENTIALS, (err as Error).message); exitWithCode(EXIT_CREDENTIALS, (err as Error).message); return; }

  const client = new WoodpeckerClient(config.woodpecker.endpoint, token);
  const pipeline = await client.createPipeline(config.woodpecker.repo_id, {
    branch: "main",
    variables: { OP: "rollback", ROLLBACK_TO: options.to },
  });
  outputSuccess(ctx, `Rollback pipeline #${pipeline.number} started → deploy ${options.to}`, {
    pipelineNumber: pipeline.number,
    rollbackTo: options.to,
  });

  if (options.follow ?? process.stdout.isTTY) {
    await streamAllStepLogs(client, config.woodpecker.repo_id, pipeline.number);
  }
}
```

### Step 4: Exit code EXIT_ARGS
If `src/output/exit-codes.ts` doesn't have EXIT_ARGS, add it (use the next unused integer; don't collide with existing codes). Reference existing codes by reading that file first.

### Step 5: Shared helper (optional DRY)
If `streamAllStepLogs` is duplicated across deploy/promote/rollback, extract to `src/woodpecker/stream.ts`:

```typescript
export async function streamAllStepLogs(client: WoodpeckerClient, repoId: number, pipelineNum: number): Promise<void> { /*...*/ }
```

Import from all three commands.

### Step 6: Verify
```bash
pnpm test src/commands/promote src/commands/rollback
pnpm typecheck
```

## Files

- Modify: `src/commands/promote.ts` (full rewrite)
- Modify: `src/commands/promote.test.ts`
- Modify: `src/commands/rollback.ts` (full rewrite)
- Modify: `src/commands/rollback.test.ts`
- Possibly Modify: `src/output/exit-codes.ts` (add EXIT_ARGS if missing)
- Possibly Create: `src/woodpecker/stream.ts` (extract if DRY)

## Acceptance Criteria

- Tests pass for both commands
- `rollback` without --to fails loudly
- `rollback --to bogus` fails format validation BEFORE any API call
- `promote` triggers OP=promote pipeline
- `rollback` triggers OP=rollback pipeline with ROLLBACK_TO
- Typecheck clean
- No R2/rclone imports in either file

## Context

Per RFC §4.6.2, the pipeline handles all R2 operations (promote resolves preview→production in the pipeline itself, rollback writes the explicit ROLLBACK_TO value). The CLI is just a pipeline trigger.

## When Stuck

If `universe history` (future command) would make `--to` optional (interactive picker), defer that UX — for v1, `--to` is required. Keep the code small and deterministic.

## Constraints

- TDD
- Do NOT do R2 operations in either file
- Strict deploy-ID regex validation in rollback
- Do NOT change the existing flag surface except: rollback adds `--to` (was previously `--deploy-id`? check and preserve/migrate)
- Do NOT run git write commands
````

**Depends on:** Task 18

---

### Task 20 [M]: universe-cli — Remove legacy rclone/S3 code + release v0.4.0-beta.1

**Traceability:** Implements R10 scope boundary, §7.2 invariant
**Files:**

- Delete: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/deploy/upload.ts`
- Delete: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/deploy/metadata.ts` (pipeline generates this now)
- Delete: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/storage/*.ts` (all S3-touching code)
- Delete: corresponding `.test.ts` files for deleted modules
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/src/credentials/resolver.ts` (remove rclone credential paths, keep Woodpecker token resolution)
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/package.json` (remove `@aws-sdk/client-s3` from runtime deps; bump version to 0.4.0-beta.1)
- Modify: `/Users/mrugesh/DEV/fCC-U/universe-cli/CHANGELOG.md`

#### Context

Delete all S3-touching code paths (enforces the "no R2 creds on dev machines" invariant). Update deps, bump version to 0.4.0-beta.1. Keep S3 code only in test fixtures (if any remain for Windmill flow tests).

#### Acceptance Criteria

- GIVEN the full test suite WHEN run THEN all tests pass
- GIVEN `package.json` THEN no `@aws-sdk/client-s3` in `dependencies` (may remain in `devDependencies` for test fixtures if needed)
- GIVEN the codebase WHEN grep'd for `rclone|S3Client|createS3Client|putObject|getObject` in `src/` THEN no production code matches (only tests/mocks)
- GIVEN `pnpm typecheck` THEN passes
- GIVEN CHANGELOG THEN documents the breaking changes for v0.4.0-beta.1

#### Verification

```bash
cd /Users/mrugesh/DEV/fCC-U/universe-cli && \
  pnpm install && \
  pnpm test && \
  pnpm typecheck && \
  ! grep -rE 'S3Client|createS3Client|uploadDirectory' src/ --include='*.ts' | grep -v test
```

**Expected output:** all commands exit 0; last grep returns no matches.

#### Constraints

- Do NOT break existing `create`, `register`, `logs`, `status`, `list` commands — scope is deploy/promote/rollback + config + validation
- Do NOT delete files still imported by remaining commands
- Release is local version bump + changelog only; actual npm publish is an operator step

#### Agent Prompt

````
You are implementing Task 20: universe-cli — Remove legacy rclone/S3 code + release v0.4.0-beta.1.

## Repo and CWD

Work in the universe-cli repo: `/Users/mrugesh/DEV/fCC-U/universe-cli`.

## Your Task

Delete every file under `src/` that exists only to do R2 direct access. This enforces the "no R2 creds on dev machines" invariant (RFC §7.2) by removing the capability. Then bump version to 0.4.0-beta.1, update CHANGELOG.

### Step 1: Enumerate files to delete
Files to delete (confirm each exists before deleting; they are all pre-RFC-v0.4 code paths):

- `src/deploy/upload.ts` and `.test.ts`
- `src/deploy/metadata.ts` and `.test.ts` (pipeline writes `_deploy-meta.json` now)
- `src/deploy/id.ts` and `.test.ts` (pipeline generates deploy IDs now) — keep ONLY if still used by output formatting
- `src/deploy/preflight.ts` and `.test.ts` (no local build → no output_dir preflight needed)
- `src/storage/client.ts` (S3 client factory)
- `src/storage/operations.ts` (S3 list/get/put)
- `src/storage/aliases.ts` (writeAlias/readAlias direct to R2)
- `src/storage/deploys.ts`
- Their corresponding `.test.ts` files

Run `grep -rE 'from.*(storage|deploy/(upload|metadata|preflight|id))' src/` to find any remaining imports. If any production file (not test) still imports these, you have a blocker — flag it.

### Step 2: Dependency audit
```bash
grep -rE '@aws-sdk/client-s3' src/
```
If any production `.ts` (not `.test.ts`) matches: you have a leak. Fix or flag.

```bash
cat package.json | jq '.dependencies | keys[]' | grep aws
```
Remove `@aws-sdk/client-s3` from `dependencies`. Move to `devDependencies` ONLY if test fixtures need it; otherwise remove entirely.

### Step 3: src/credentials/resolver.ts
Current file resolves rclone credentials. Delete or slim it:
- If `resolveCredentials` is referenced anywhere in remaining production code, refactor callers to use `resolveWoodpeckerToken` from Task 18's `src/credentials/woodpecker.ts`.
- Otherwise delete the file.

### Step 4: Version bump
`package.json`:
```json
"version": "0.4.0-beta.1"
```

### Step 5: CHANGELOG
Update `CHANGELOG.md`:

```markdown
## [0.4.0-beta.1] — 2026-04-XX

### Breaking
- `universe deploy|promote|rollback` now trigger Woodpecker CI pipelines instead of uploading directly to R2. Developer machines no longer need R2 credentials; set WOODPECKER_TOKEN via direnv.
- Config schema: `static.rclone_remote` and `static.bucket` fields REMOVED. Add `woodpecker: { endpoint, repo_id }` section instead.
- `universe rollback` requires `--to <deploy-id>` (previously optional); format validated against `YYYYMMDD-HHMMSS-<sha7|dirty-hex8>`.
- Constellation site names containing `--` are rejected at `universe create`/`register` time (reserved for preview routing).

### Added
- Woodpecker API client (`src/woodpecker/*`) with SSE log streaming.
- Site-name validation (`src/validation/site-name.ts`).

### Removed
- `@aws-sdk/client-s3` runtime dependency.
- All `src/storage/*` and most `src/deploy/*` modules (legacy R2 upload path).

### Migration
- Install: `pnpm install -g @freecodecamp/universe-cli@0.4.0-beta.1`
- Set `WOODPECKER_TOKEN` (create one at https://woodpecker.freecodecamp.net/user/tokens)
- Update `.universe.yaml` per [RFC §4.8.1](https://github.com/freeCodeCamp/infra/blob/main/docs/rfc/gxy-cassiopeia.md#481-config-schema)
- Delete any local R2/rclone credentials you previously exported for universe-cli
```

### Step 6: Full test run
```bash
pnpm install  # refresh lockfile after package.json changes
pnpm test
pnpm typecheck
pnpm lint
! grep -rE 'S3Client|createS3Client|uploadDirectory|writeAlias|@aws-sdk' src/ --include='*.ts' | grep -vE '\.test\.ts|__mocks__'
```
All exit 0; last command returns no matches (uses of those symbols only remain in tests/mocks if any).

### Step 7: Build
```bash
pnpm build
```
Expect `dist/` to be produced with no errors.

## Files

- Delete: `src/deploy/upload.ts`, `src/deploy/upload.test.ts`
- Delete: `src/deploy/metadata.ts`, `src/deploy/metadata.test.ts`
- Delete: `src/deploy/preflight.ts`, `src/deploy/preflight.test.ts`
- Delete: `src/storage/client.ts`, `src/storage/operations.ts`, `src/storage/aliases.ts`, `src/storage/deploys.ts` (+ corresponding `.test.ts`)
- Possibly Delete: `src/deploy/id.ts`, `src/credentials/resolver.ts` (if unused after refactor)
- Modify: `package.json` (version + remove @aws-sdk/client-s3 from deps)
- Modify: `pnpm-lock.yaml` (regenerated by pnpm install)
- Modify: `CHANGELOG.md`

## Acceptance Criteria

- `pnpm test` all pass
- `pnpm typecheck` clean
- `pnpm lint` clean
- `pnpm build` produces dist/
- `grep -rE 'S3Client' src/ --include='*.ts' | grep -v test` returns no matches
- `package.json` dependencies has no @aws-sdk
- CHANGELOG documents all breaking changes

## Context

This is the cleanup pass that enforces the "no R2 creds on dev machines" invariant by deletion, not by convention. Any future PR reintroducing these files is a protocol violation per RFC §7.2.

## When Stuck

If a remaining command (e.g., `universe status`) still imports a deleted module, it either needs rewriting to use Woodpecker API, OR the command should be marked stub ("Not supported in 0.4.0-beta.1; coming in 0.4.0") with a clear runtime error. Document in CHANGELOG and flag.

## Constraints

- Delete, don't comment out
- Preserve test coverage — moved tests become obsolete; delete them with the implementations
- Do NOT publish to npm in this task (publish is a separate operator action)
- Do NOT run git write commands
````

**Depends on:** Task 19

---
