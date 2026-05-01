# TODO

## Phase 1: Foundation

- [x] TASK: Update `package.json` — rename to `@freecodecamp/universe-cli`; set
      `version` to `1.0.0`; add `engines` (`node >= 22.11.0`), `repository`,
      `homepage`, `bugs`, `publishConfig` (`access: public`), `files`
      (`["dist/", "README.md", "LICENSE"]`), `keywords`; keep all existing
      scripts and dependencies; remove spike `description`

- [x] CODE: Create `src/errors/exit-codes.ts` — single source of truth for all
      exit code constants
  - Feature: Export every exit code constant used across both codebases. Keep
    other's stable published codes (10–19) unchanged. Renumber main's colliding
    codes to 21–31: DEPLOYMENT=21, PROMOTION=22, ROLLBACK=23, LOGS=24,
    STATUS=25, LIST=26, TEARDOWN=27, INVALID_NAME=28, BAD_ARGUMENTS=29,
    PACKAGE_INSTALL=30, REPO_INITIALISATION=31. Keep main's non-colliding codes
    unchanged (UNSUPPORTED=4, TARGET_EXISTS=3, INVALID_MULTI_SELECT=5,
    LAYER=6, SCAFFOLD_WRITE=7, MANIFEST=8, REGISTRATION=9). Export all as
    named constants (`EXIT_SUCCESS`, `EXIT_USAGE`, etc.).
  - Files: `src/errors/exit-codes.ts` (new)
  - Acceptance:
    - File exports every constant name used in both codebases
    - Other's codes 10–19 match their original values exactly
    - No two constants share the same numeric value
    - A test importing and asserting the numeric value of each constant passes

- [x] CODE: Update `src/errors/cli-errors.ts` — import exit codes from
      `exit-codes.ts`; renumber colliding codes; add 6 new error classes
  - Feature: Replace the inline `EXIT_CODES` object with imports from
    `src/errors/exit-codes.ts`. Update every numeric code that changed
    (DEPLOYMENT through REPO_INITIALISATION). Add `ConfigError` (EXIT_CONFIG),
    `CredentialError` (EXIT_CREDENTIALS), `StorageError` (EXIT_STORAGE),
    `GitError` (EXIT_GIT), `ConfirmError` (EXIT_CONFIRM), and
    `PartialUploadError` (EXIT_PARTIAL) — each as a concrete subclass of
    `CliError` taking only `message`. Export all new classes.
  - Files: `src/errors/cli-errors.ts`
  - Acceptance:
    - Existing error classes still construct and carry the correct (renumbered)
      exit codes
    - Each of the 6 new classes can be constructed with a string message and
      its `exitCode` matches the corresponding constant from `exit-codes.ts`
    - All existing `cli-errors` tests pass with updated numeric assertions
    - No inline numeric literals remain in the file (all via imported constants)

- [x] CODE: Create `src/output/envelope.ts`, `src/output/format.ts`,
      `src/output/redact.ts` — port output utilities from other
  - Feature: Port all three files verbatim from `other/src/output/` except
    replace imports from `../errors.js` with `../errors/cli-errors.js` and
    imports from `../output/exit-codes.js` with `../errors/exit-codes.js`.
  - Files: `src/output/envelope.ts` (new), `src/output/format.ts` (new),
    `src/output/redact.ts` (new)
  - Acceptance:
    - `buildEnvelope` returns an object with `schemaVersion`, `command`,
      `success: true`, `timestamp`, and the supplied data keys
    - `buildErrorEnvelope` returns an object with `success: false`, `error.code`,
      and `error.message`
    - `redact` masks any substring matching a GitHub token pattern
    - `outputSuccess` writes JSON to stdout when `ctx.json` is true; calls
      `log.success` otherwise
    - `outputError` redacts the message before writing; writes JSON to stdout
      when `ctx.json` is true; calls `log.error` otherwise

- [x] CODE: Create `src/constants.ts` — shared runtime constants
  - Feature: Export `DEFAULT_GH_CLIENT_ID` (the public OAuth app client id
    `"Iv23liIuGmZRyPd5wUeN"`) and `DEFAULT_PROXY_URL`
    (`"https://uploads.freecode.camp"`). Include the doc comment from
    `other/src/lib/constants.ts` explaining why the client id is safe to
    publish.
  - Files: `src/constants.ts` (new)
  - Acceptance:
    - Both constants are exported with the correct string values
    - TypeScript compiles without error

---

## Phase 2: Auth infrastructure

- [x] CODE: Create `src/auth/token-store.port.ts` — port interface
  - Feature: Define and export a `TokenStore` interface with three methods:
    `saveToken(token: string): Promise<void>`,
    `loadToken(): Promise<string | null>`,
    `deleteToken(): Promise<void>`.
  - Files: `src/auth/token-store.port.ts` (new)
  - Acceptance:
    - Interface compiles and is importable
    - Method signatures match the functions in `other/src/lib/token-store.ts`

- [x] CODE: Create `src/auth/file-token-store.ts` + `.test.ts`
  - Feature: Port `other/src/lib/token-store.ts` as a class
    `FileTokenStore implements TokenStore`. Move `tokenPath`,
    `configBase` as private methods. Keep `saveToken`, `loadToken`,
    `deleteToken` logic identical. Export the class and `tokenPath` (for
    testing).
  - Files: `src/auth/file-token-store.ts` (new),
    `src/auth/file-token-store.test.ts` (new)
  - Acceptance:
    - `saveToken` writes to `$XDG_CONFIG_HOME/universe-cli/token` when the
      env var is set, otherwise `$HOME/.config/universe-cli/token`
    - Written file has mode 0600 and parent directory has mode 0700
    - `loadToken` returns `null` when the file does not exist
    - `loadToken` returns `null` for an all-whitespace file
    - `deleteToken` removes the file; does not throw if the file is absent
    - Refusing to save an empty or whitespace-only token throws

- [x] CODE: Create `src/auth/stub-token-store.ts`
  - Feature: An in-memory `StubTokenStore implements TokenStore`. Stores the
    last saved token; `loadToken` returns it or `null`; `deleteToken` clears
    it.
  - Files: `src/auth/stub-token-store.ts` (new)
  - Acceptance:
    - `saveToken` then `loadToken` returns the saved value
    - `deleteToken` then `loadToken` returns `null`
    - Saving an empty string throws (matches `FileTokenStore` guard)

- [x] CODE: Create `src/auth/device-flow.port.ts` — port interface
  - Feature: Define and export `DeviceFlowOptions` (clientId, scope,
    onPrompt callback with `userCode`, `verificationUri`, `expiresIn`) and
    a `DeviceFlow` interface with
    `run(options: DeviceFlowOptions): Promise<string>` (returns the access
    token).
  - Files: `src/auth/device-flow.port.ts` (new)
  - Acceptance:
    - Types compile and are importable

- [x] CODE: Create `src/auth/github-device-flow.ts` + `.test.ts`
  - Feature: Port `other/src/lib/device-flow.ts` as a class
    `GithubDeviceFlow implements DeviceFlow`. Keep the HTTP fetch logic
    identical. Accept an optional `fetch` override in the constructor for
    testing.
  - Files: `src/auth/github-device-flow.ts` (new),
    `src/auth/github-device-flow.test.ts` (new)
  - Acceptance:
    - POSTs to `https://github.com/login/device/code` with client_id and scope
    - Polls `https://github.com/login/oauth/access_token` until granted or
      expired
    - Calls `onPrompt` with `userCode`, `verificationUri`, `expiresIn` before
      polling begins
    - Throws on `slow_down`, `expired_token`, `access_denied` with descriptive
      messages
    - Tests use an injected `fetch` stub; no real network calls

- [x] CODE: Create `src/auth/stub-device-flow.ts`
  - Feature: A `StubDeviceFlow implements DeviceFlow` that immediately
    resolves with a configurable token string (default `"stub-token"`).
    Accepts a `token` constructor parameter.
  - Files: `src/auth/stub-device-flow.ts` (new)
  - Acceptance:
    - `run()` resolves with the configured token
    - Calls `onPrompt` with dummy values before resolving

- [x] CODE: Create `src/auth/identity-resolver.port.ts` — port interface
  - Feature: Define and export `IdentitySource` union type
    (`"env_GITHUB_TOKEN" | "env_GH_TOKEN" | "gh_cli" | "device_flow"`),
    `ResolvedIdentity` (`{ token: string; source: IdentitySource }`), and
    an `IdentityResolver` interface with
    `resolve(): Promise<ResolvedIdentity | null>`.
  - Files: `src/auth/identity-resolver.port.ts` (new)
  - Acceptance:
    - Types compile and are importable

- [x] CODE: Create `src/auth/github-identity-resolver.ts` + `.test.ts`
  - Feature: Port `other/src/lib/identity.ts` as a class
    `GithubIdentityResolver implements IdentityResolver`. The 3-slot priority
    chain (env vars → `gh auth token` shell-out → stored token) becomes the
    `resolve()` method. Accept `env`, `execGhAuthToken`, and `loadStoredToken`
    as constructor overrides for testing.
  - Files: `src/auth/github-identity-resolver.ts` (new),
    `src/auth/github-identity-resolver.test.ts` (new)
  - Acceptance:
    - Returns `{ token, source: "env_GITHUB_TOKEN" }` when `GITHUB_TOKEN` is
      set
    - Prefers `GITHUB_TOKEN` over `GH_TOKEN` when both are set
    - Falls through to `gh auth token` when env vars are absent
    - Falls through to the stored token when `gh` returns nothing
    - Returns `null` when all three slots yield nothing
    - Tests inject all three overrides; no real shell-outs or file reads

- [x] CODE: Create `src/auth/stub-identity-resolver.ts`
  - Feature: A `StubIdentityResolver implements IdentityResolver` that
    returns a configurable `ResolvedIdentity` or `null`.
  - Files: `src/auth/stub-identity-resolver.ts` (new)
  - Acceptance:
    - Constructor accepts an optional `ResolvedIdentity | null` (default: a
      fixed token with `source: "env_GITHUB_TOKEN"`)
    - `resolve()` returns the configured value

---

## Phase 3: Proxy client

- [x] CODE: Create `src/platform/proxy-client.port.ts` — interface + error
  - Feature: Extract the `ProxyClient` interface, all request/response types
    (`WhoAmIResponse`, `DeployInitRequest`, etc.), and `ProxyError` from
    `other/src/lib/proxy-client.ts`. Also export `wrapProxyError`. Replace
    `CliError` import with `../../errors/cli-errors.js` and exit-code imports
    with `../../errors/exit-codes.js`.
  - Files: `src/platform/proxy-client.port.ts` (new)
  - Acceptance:
    - `ProxyClient` interface has all seven methods defined in other
    - `ProxyError` extends `CliError` from main's hierarchy and carries
      `status` and `code` alongside `exitCode`
    - `wrapProxyError` maps `ProxyError → { code, message }` with prefix;
      passes `CliError` message through; falls back to `EXIT_USAGE`
    - TypeScript compiles without error

- [x] CODE: Create `src/platform/http-proxy-client.ts` + `.test.ts`
  - Feature: Port the `createProxyClient` factory from
    `other/src/lib/proxy-client.ts` as a standalone function in this file.
    All HTTP logic is identical. Replace error/exit-code imports as above.
    Tests port from `other/tests/lib/proxy-client.test.ts`.
  - Files: `src/platform/http-proxy-client.ts` (new),
    `src/platform/http-proxy-client.test.ts` (new)
  - Acceptance:
    - `createProxyClient` returns an object satisfying `ProxyClient`
    - `whoami` sends `GET /api/whoami` with `Authorization: Bearer <token>`
    - `deployUpload` sends `PUT /api/deploy/{id}/upload?path=<rel>` with the
      deploy JWT
    - Non-2xx responses throw `ProxyError` with `status`, `code`, `message`
      extracted from the JSON error envelope
    - Network failures throw `ProxyError` with `status: 0` and
      `code: "network_error"`
    - All requests use an injected `fetch` stub; no real network calls

- [x] CODE: Create `src/platform/proxy-client.stub.ts`
  - Feature: A `StubProxyClient implements ProxyClient` with configurable
    per-method responses. Each method defaults to resolving with a minimal
    valid response object. Constructor accepts a partial overrides map.
  - Files: `src/platform/proxy-client.stub.ts` (new)
  - Acceptance:
    - All seven interface methods are implemented
    - Each can be overridden independently via constructor argument
    - Default responses satisfy the response type shapes

---

## Phase 4: Platform YAML v2

- [x] CODE: Create `src/platform/platform-yaml-v2.schema.ts` — port Zod schema
  - Feature: Port `other/src/lib/platform-yaml.schema.ts` verbatim. No import
    changes needed (only `zod` is imported).
  - Files: `src/platform/platform-yaml-v2.schema.ts` (new)
  - Acceptance: - Valid v2 document `{ site: "my-site", build: { output: "dist" },
deploy: {} }` parses successfully - Document with a v1 field (e.g., `r2:`) is rejected by Zod's `.strict()` - Site name `"bad name"` (space) is rejected - Site name `""` is rejected - `deploy.ignore` defaults to the `DEFAULT_DEPLOY_IGNORE` list when absent

- [x] CODE: Create `src/platform/platform-yaml-v2.ts` + `.test.ts` — parser
  - Feature: Port `other/src/lib/platform-yaml.ts`. Export
    `parsePlatformYaml(raw: string): { ok: true; value: PlatformYamlV2 } |
{ ok: false; error: string }` and the `PlatformYamlV2` type. Include v1
    field detection with migration error messages (as in other).
  - Files: `src/platform/platform-yaml-v2.ts` (new),
    `src/platform/platform-yaml-v2.test.ts` (new)
  - Acceptance:
    - Returns `{ ok: true, value }` for a valid v2 YAML string
    - Returns `{ ok: false, error }` for unparseable YAML
    - Returns `{ ok: false, error }` containing "migrate" for a document that
      has a known v1 field
    - `PlatformYamlV2` type is exported and matches the Zod inferred type

---

## Phase 5: Deploy utilities

- [x] CODE: Create `src/commands/deploy/git.ts` + `.test.ts`
  - Feature: Port `other/src/deploy/git.ts` verbatim. Export `GitState` type
    and `getGitState()`.
  - Files: `src/commands/deploy/git.ts` (new),
    `src/commands/deploy/git.test.ts` (new)
  - Acceptance:
    - Returns `{ dirty: false, hash: "<sha>" }` when the working tree is clean
    - Returns `{ dirty: true, hash: "<sha>" }` when there are uncommitted changes
    - Returns `{ dirty: false, hash: null }` when not in a git repository

- [x] CODE: Create `src/commands/deploy/walk.ts` + `.test.ts`
  - Feature: Port `other/src/deploy/walk.ts` verbatim. Export `WalkedFile`
    type and `walkFiles(dir: string): WalkedFile[]`.
  - Files: `src/commands/deploy/walk.ts` (new),
    `src/commands/deploy/walk.test.ts` (new)
  - Acceptance:
    - Returns an entry per file with `absPath` and `relPath` (relative to `dir`)
    - Recurses into subdirectories
    - Does not include directory entries, only files

- [x] CODE: Create `src/commands/deploy/ignore.ts` + `.test.ts`
  - Feature: Port `other/src/lib/ignore.ts` verbatim. Export
    `createIgnoreFilter(patterns: readonly string[]): (relPath: string) =>
boolean`.
  - Files: `src/commands/deploy/ignore.ts` (new),
    `src/commands/deploy/ignore.test.ts` (new)
  - Acceptance:
    - `"*.map"` pattern matches `"app.js.map"` and `"sub/dir/app.js.map"`
    - `"node_modules/**"` pattern matches `"node_modules/foo/bar.js"`
    - A path not matching any pattern returns `false` (not ignored)
    - Empty pattern list returns `false` for any path

- [x] CODE: Create `src/commands/deploy/build.ts` + `.test.ts`
  - Feature: Port `other/src/lib/build.ts` verbatim. Export `BuildResult`
    type and `runBuild(opts: BuildOptions): Promise<BuildResult>`. Accept
    an optional `exec` override for testing.
  - Files: `src/commands/deploy/build.ts` (new),
    `src/commands/deploy/build.test.ts` (new)
  - Acceptance:
    - When `command` is undefined, returns `{ skipped: true, outputDir }`
      without spawning a process
    - When `command` is set, spawns it in `cwd` and resolves on exit code 0
    - Throws on non-zero exit code with the command's stderr in the message
    - Tests inject an `exec` stub; no real child processes

- [x] CODE: Create `src/commands/deploy/upload.ts` + `.test.ts`
  - Feature: Port `other/src/lib/upload.ts` verbatim. Export `UploadResult`
    type and `uploadFiles(opts: UploadOptions): Promise<UploadResult>`.
    `UploadOptions` accepts a `ProxyClient` (imported from
    `../../platform/proxy-client.port.js`).
  - Files: `src/commands/deploy/upload.ts` (new),
    `src/commands/deploy/upload.test.ts` (new)
  - Acceptance:
    - Calls `client.deployUpload` once per file in the input list
    - Returns `{ fileCount, totalSize, errors: [] }` when all uploads succeed
    - Collects failed file paths in `errors` rather than throwing on partial
      failure
    - Returns the correct `fileCount` and cumulative `totalSize`

---

## Phase 6: Commands

- [x] CODE: Replace `src/commands/deploy/index.ts` — proxy-based `universe static deploy`
  - Feature: Rewrite the stub handler using other's `commands/deploy.ts` logic
    adapted to main's architecture. The handler receives a `deps` object
    containing `identityResolver: IdentityResolver`,
    `proxyClient: ProxyClient` (or a factory), `getGitState`, `runBuild`,
    `walkFiles`, `uploadFiles`, and logging overrides. It does NOT call
    `process.exit()` — on error it throws a `CliError` subclass. Returns
    `HandlerResult` with `exitCode: 0` and `output: ''` on success (output is
    printed directly via clack or JSON). Supports `--json` flag via an input
    option.
  - Files: `src/commands/deploy/index.ts` (replace stub),
    `src/commands/deploy/index.test.ts` (new)
  - Acceptance:
    - Throws `CredentialError` when identity resolves to `null`
    - Throws `ConfigError` when `platform.yaml` is absent
    - Throws `CredentialError` when the site is not in `me.authorizedSites`
    - Logs a warning when the git working tree is dirty
    - Calls `runBuild`, `walkFiles`, `uploadFiles`, `deployInit`,
      `deployFinalize` in order
    - Throws `PartialUploadError` when any upload fails
    - With `json: true`, writes a JSON envelope to stdout
    - With `json: false`, calls `log.success` with deploy summary

- [x] CODE: Replace `src/commands/promote/index.ts` — proxy-based promote
  - Feature: Rewrite the stub using other's `commands/promote.ts` adapted to
    main's architecture. Deps: `identityResolver`, `proxyClient`, logging
    overrides. Reads `platform.yaml` to get the site name (or accepts
    `--from` override). Supports `--json`.
  - Files: `src/commands/promote/index.ts` (replace stub),
    `src/commands/promote/index.test.ts` (new)
  - Acceptance:
    - Throws `CredentialError` when identity resolves to `null`
    - Throws `ConfigError` when `platform.yaml` is absent or invalid
    - Calls `client.sitePromote` with the resolved site name
    - With `json: true`, writes a JSON envelope with `url` and `deployId`
    - With `json: false`, calls `log.success`

- [x] CODE: Replace `src/commands/rollback/index.ts` — proxy-based rollback
  - Feature: Rewrite the stub using other's `commands/rollback.ts`. Deps:
    `identityResolver`, `proxyClient`, logging overrides. Requires `--to
<deployId>`. Reads `platform.yaml` for site name. Supports `--json`.
  - Files: `src/commands/rollback/index.ts` (replace stub),
    `src/commands/rollback/index.test.ts` (new)
  - Acceptance:
    - Throws `BadArgumentsError` when `--to` is absent
    - Throws `CredentialError` when identity resolves to `null`
    - Calls `client.siteRollback` with site and target deploy id
    - With `json: true`, writes a JSON envelope
    - With `json: false`, calls `log.success`

- [x] CODE: Replace `src/commands/list/index.ts` — proxy-based list
  - Feature: Rewrite the stub using other's `commands/ls.ts`. Deps:
    `identityResolver`, `proxyClient`, logging overrides. Accepts optional
    `--site` override; otherwise reads `platform.yaml`. Supports `--json`.
  - Files: `src/commands/list/index.ts` (replace stub),
    `src/commands/list/index.test.ts` (new)
  - Acceptance:
    - Throws `CredentialError` when identity resolves to `null`
    - Calls `client.siteDeploys` with the resolved site name
    - With `json: true`, writes a JSON array envelope
    - With `json: false`, prints deploy ids one per line via `log.info`

- [x] CODE: Create `src/commands/login/index.ts` + `.test.ts`
  - Feature: Port other's `commands/login.ts` adapted to main's architecture.
    Handler deps: `tokenStore: TokenStore`, `deviceFlow: DeviceFlow`,
    `identityResolver: IdentityResolver` (for the `--force` existing-check),
    logging overrides. Does NOT call `process.exit()` — throws `ConfirmError`
    or `CredentialError` instead. Supports `--json`.
  - Files: `src/commands/login/index.ts` (new),
    `src/commands/login/index.test.ts` (new)
  - Acceptance:
    - Throws `ConfirmError` when a token is already stored and `--force` is
      false
    - Calls `deviceFlow.run(...)` with the resolved client id and scope
    - Calls `tokenStore.saveToken` with the returned token
    - With `json: true`, first emits a prompt-phase envelope (before polling),
      then a success envelope after storing
    - With `json: false`, calls `log.info` for the prompt and `log.success`
      after storing

- [x] CODE: Create `src/commands/logout/index.ts` + `.test.ts`
  - Feature: Port other's `commands/logout.ts`. Handler deps:
    `tokenStore: TokenStore`, logging overrides. Supports `--json`.
  - Files: `src/commands/logout/index.ts` (new),
    `src/commands/logout/index.test.ts` (new)
  - Acceptance:
    - Calls `tokenStore.deleteToken()`
    - With `json: true`, writes a success envelope
    - With `json: false`, calls `log.success`
    - Does not throw when no token was stored

- [x] CODE: Create `src/commands/whoami/index.ts` + `.test.ts`
  - Feature: Port other's `commands/whoami.ts`. Handler deps:
    `identityResolver: IdentityResolver`, `proxyClient: ProxyClient`, logging
    overrides. Supports `--json`.
  - Files: `src/commands/whoami/index.ts` (new),
    `src/commands/whoami/index.test.ts` (new)
  - Acceptance:
    - Throws `CredentialError` when identity resolves to `null`
    - Calls `client.whoami()` and surfaces `login` and `authorizedSites`
    - With `json: true`, writes an envelope with `login`, `authorizedSites`,
      and `identitySource`
    - With `json: false`, prints `login` and lists authorized sites via
      `log.info`

---

## Phase 7: Wire-up

- [x] CODE: Update `src/bin.ts` — new deps, commands, router entries
  - Feature: (1) Add `json?: boolean` to `ParsedOptions`. (2) Add `login`,
    `logout`, `whoami` to the `CommandName` union. (3) Introduce a `static`
    namespace: when the first positional is `"static"`, strip it and dispatch
    to a static sub-router that recognises `deploy`, `promote`, `rollback`,
    `list` — preserving any flags placed before the `static` token. (4) Add
    parsers for the new commands: `login` accepts `--force`; `rollback`
    requires `--to`; `list` accepts `--site`; all accept `--json`. (5) Add
    handler binders for `login`, `logout`, `whoami`; update binders for
    `deploy`, `promote`, `rollback`, `list` to pass the real deps. (6) Add
    auth + proxy client deps to `RouteDeps`: `identityResolver:
IdentityResolver`, `tokenStore: TokenStore`, `deviceFlow: DeviceFlow`,
    `proxyClient: ProxyClient`. (7) In the wiring block, replace
    `StubDeployClient`, `StubPromoteClient`, `StubRollbackClient`,
    `StubListClient` with real adapter instances (`GithubIdentityResolver`,
    `FileTokenStore`, `GithubDeviceFlow`, `createProxyClient`). (8) Update
    help text to list `login`, `logout`, `whoami`, and the `static`
    subcommands. (9) Remove the four replaced stub imports.
  - Files: `src/bin.ts`
  - Acceptance:
    - `universe static deploy` is a recognised command
    - `universe deploy` (without `static`) returns `BadArgumentsError`
    - `universe login` is a recognised command; unrecognised args return
      `BadArgumentsError`
    - `universe --json static rollback --to abc` passes `json: true` and
      `to: "abc"` to the rollback handler (flag before namespace token works)
    - `universe static rollback` without `--to` returns `BadArgumentsError`
    - All existing `bin.ts` unit tests pass
    - TypeScript compiles without error

---

## Phase 10: Fix testing gaps

Port test coverage from `tmp/other/tests/commands/` that was missed during Phase 6,
and add the corresponding implementation fixes. Old source files live under
`tmp/other/src/commands/`; old tests under `tmp/other/tests/commands/`.

- [x] CODE: Fix `src/commands/deploy/index.ts` — add `--promote`, `--dir`,
      `nogit-` sha, runbook URL in auth error, ignore filter, and ProxyError
      handling
  - Implementation changes (see `tmp/other/src/commands/deploy.ts`):
    - Add `promote?: boolean` and `dir?: string` to `DeployOptions`
    - When `opts.promote === true`, force `deployMode = "production"` regardless
      of `config.deploy.preview`
    - When `opts.dir !== undefined`, pass `opts.dir` as `outputDir` to
      `runBuild` (overrides `config.build.output`)
    - Change `sha = gitState.hash ?? "unknown"` to
      `` sha = gitState.hash ?? `nogit-${Date.now().toString(36)}` ``
    - Expand the "not authorized" `CredentialError` message to include the
      user's login, their actual authorized sites list, and a link to
      `freeCodeCamp/infra/blob/main/docs/runbooks/01-deploy-new-constellation-site.md`
  - New tests to add (see `tmp/other/tests/commands/deploy.test.ts`): - `--promote flag: forwards mode=production to deployFinalize` - `--dir flag: passes dir as outputDir to runBuild and walkFiles` - `identity/config: v1 platform.yaml fragment (name:/r2: fields) →
ConfigError with message matching /v1|migration/i` - `identity/config: invalid site name ("BAD-Name") → ConfigError` - `preflight auth: not-authorized error message contains runbook URL` - `git state: falls back to nogit- sha when gitState.hash is null` - `ignore filter: deploy.ignore patterns filter files before deployInit and
uploadFiles` - `proxy errors: ProxyError from deployInit propagates (403 → exitCode 12)` - `proxy errors: ProxyError from deployFinalize propagates (422 → exitCode
13)`
  - Files: `src/commands/deploy/index.ts`,
    `src/commands/deploy/index.test.ts`

- [x] CODE: Fix `src/commands/login/index.ts` — env fallback for empty/whitespace
      `UNIVERSE_GH_CLIENT_ID`, device-flow failure propagation
  - Implementation changes (see `tmp/other/src/commands/login.ts`):
    - Replace `process.env["UNIVERSE_GH_CLIENT_ID"] ?? DEFAULT_GH_CLIENT_ID`
      with a trim + empty-check fallback:
      ```ts
      const raw = process.env["UNIVERSE_GH_CLIENT_ID"];
      const clientId =
        raw !== undefined && raw.trim().length > 0 ? raw.trim() : DEFAULT_GH_CLIENT_ID;
      ```
    - Wrap `deps.deviceFlow.run(...)` in a try/catch; rethrow caught errors as
      `CredentialError` (preserving `err.message`)
  - New tests to add (see `tmp/other/tests/commands/login.test.ts`); use
    `vi.stubEnv("UNIVERSE_GH_CLIENT_ID", value)` to control the env: - `falls back to DEFAULT_GH_CLIENT_ID when UNIVERSE_GH_CLIENT_ID is unset` - `falls back to DEFAULT_GH_CLIENT_ID when UNIVERSE_GH_CLIENT_ID is empty
string` - `falls back to DEFAULT_GH_CLIENT_ID when UNIVERSE_GH_CLIENT_ID is
whitespace` - `propagates device-flow failure as CredentialError`
  - Files: `src/commands/login/index.ts`, `src/commands/login/index.test.ts`

- [x] CODE: Fix `src/commands/promote/index.ts` — add `--from` flag (routes to
      `siteRollback`), allow ProxyError to propagate
  - Implementation changes (see `tmp/other/src/commands/promote.ts`):
    - Add `from?: string` to `PromoteOptions`
    - When `opts.from !== undefined`, call
      `deps.proxyClient.siteRollback({ site, to: opts.from })` and skip
      `sitePromote`; use the `AliasResponse` result the same way
  - Note: `ProxyError` already carries the correct exit code via `mapExitCode`
    (403 → EXIT_CREDENTIALS=12, 422 → EXIT_STORAGE=13). No try/catch needed
    in the handler — just let it propagate.
  - New tests to add (see `tmp/other/tests/commands/promote.test.ts`): - `--from flag routes through siteRollback with { site, to: from }; sitePromote
is not called` - `ProxyError 422 no_preview propagates with exitCode EXIT_STORAGE (13)` - `ProxyError 403 user_unauthorized propagates with exitCode
EXIT_CREDENTIALS (12)`
  - Files: `src/commands/promote/index.ts`,
    `src/commands/promote/index.test.ts`

- [x] CODE: Fix `src/commands/whoami/index.ts` — catch ProxyError, emit JSON
      error envelope in JSON mode before rethrowing
  - Implementation changes (see `tmp/other/src/commands/whoami.ts`):
    - Wrap `deps.proxyClient.whoami()` in try/catch
    - In catch: if `opts.json`, write a `buildErrorEnvelope("whoami", err)`
      JSON line before rethrowing
    - Rethrow the original error (ProxyError carries the right exitCode)
  - New tests to add (see `tmp/other/tests/commands/whoami.test.ts`):
    - `ProxyError from whoami propagates (401 → exitCode EXIT_CREDENTIALS / 12)`
    - `in JSON mode, emits error envelope to write before rethrowing`
  - Files: `src/commands/whoami/index.ts`, `src/commands/whoami/index.test.ts`

- [x] CODE: Add `--version` flag to `src/bin.ts`
  - Implementation changes:
    - Read `version` from `package.json` at startup (import with {type : "json"})
    - In `parseArgs`, treat `--version` / `-V` as returning a special
      `"version"` command (like `"help"`)
    - In `route`, output the version string when command is `"version"`
  - Test to add in `src/bin.test.ts`:
    - `"--version" exits with code 0 and outputs the package version`
  - Ref: `tmp/other/tests/cli.test.ts` `"--version outputs package version"`
  - Files: `src/bin.ts`, `src/bin.test.ts`

- [x] CODE: Add `error.name` assertions for Phase-6 error classes in
      `src/errors/cli-errors.test.ts`
  - The implementation already sets `this.name` correctly in every class
    (verified). Tests are simply missing for the ported classes.
  - Tests to add:
    - `ConfigError.name === "ConfigError"`
    - `CredentialError.name === "CredentialError"`
    - `StorageError.name === "StorageError"`
    - `GitError.name === "GitError"`
    - `ConfirmError.name === "ConfirmError"`
    - `PartialUploadError.name === "PartialUploadError"`
  - Ref: `tmp/other/tests/errors.test.ts`
    `"preserves the error name for instanceof-style checks"`
  - Files: `src/errors/cli-errors.test.ts`

- [x] CODE: Update `src/bin.ts` — wire `--promote`, `--dir` (deploy) and `--from`
      (promote) flags through the router
  - Changes needed:
    - Add `dir?: string`, `from?: string`, `promote?: boolean` to
      `ParsedOptions`
    - Update `parseStaticDeploy` to accept `--promote` (boolean) and
      `--dir <value>` flags; reject unknown flags
    - Update `parseStaticPromote` to accept `--from <value>` flag; reject
      unknown flags
    - Update `handlerBinders.deploy` to pass `dir` and `promote` from options
    - Update `handlerBinders.promote` to pass `from` from options
  - New tests to add in `src/bin.test.ts`: - `"static deploy --promote" → handleDeploy called with promote: true` - `"static deploy --dir dist" → handleDeploy called with dir: "dist"` - `"static promote --from older-deploy" → handlePromote called with from:
"older-deploy"` - `"static deploy --dir" (missing value) → BadArgumentsError` - `"static promote --from" (missing value) → BadArgumentsError`
  - Files: `src/bin.ts`, `src/bin.test.ts`

---

## Phase 8: Release pipeline

- [x] TASK: Port `.github/actions/validate-version/` from `other/` into the
      main workspace unchanged

- [x] TASK: Port `.github/workflows/release.yml` from `other/` into the main
      workspace. Update the `permissions` block and trusted publisher config
      if the repository name has changed.

---

## Phase 9: Docs + cleanup

- [x] TASK: Copy `other/docs/FLIGHT-MANUAL.md`, `STAFF-GUIDE.md`,
      `RELEASING.md`, `platform-yaml.md` into `docs/`

- [x] TASK: Delete the `other/` directory once all phases pass CI

---

## Traceability matrix

| Requirement                                         | TODO item                                                                   | Status |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| Publish as `@freecodecamp/universe-cli`             | Phase 1 / TASK: Update `package.json`                                       | mapped |
| Unified exit codes (no collisions)                  | Phase 1 / CODE: `src/errors/exit-codes.ts`                                  | mapped |
| Unified exit codes (no collisions)                  | Phase 1 / CODE: `src/errors/cli-errors.ts`                                  | mapped |
| Structured JSON output                              | Phase 1 / CODE: `src/output/envelope.ts` + `format.ts` + `redact.ts`        | mapped |
| Constants (client id, proxy URL)                    | Phase 1 / CODE: `src/constants.ts`                                          | mapped |
| Token persistence                                   | Phase 2 / CODE: `token-store.port.ts` + `file-token-store.ts`               | mapped |
| Device-flow auth                                    | Phase 2 / CODE: `device-flow.port.ts` + `github-device-flow.ts`             | mapped |
| Identity priority chain                             | Phase 2 / CODE: `identity-resolver.port.ts` + `github-identity-resolver.ts` | mapped |
| Proxy HTTP client                                   | Phase 3 / CODE: `proxy-client.port.ts` + `http-proxy-client.ts`             | mapped |
| Platform YAML v2 parsing                            | Phase 4 / CODE: `platform-yaml-v2.schema.ts` + `platform-yaml-v2.ts`        | mapped |
| Deploy utilities (git, walk, ignore, build, upload) | Phase 5 / CODE: five utility files                                          | mapped |
| Real `deploy` command                               | Phase 6 / CODE: `src/commands/deploy/index.ts`                              | mapped |
| Real `promote` command                              | Phase 6 / CODE: `src/commands/promote/index.ts`                             | mapped |
| Real `rollback` command                             | Phase 6 / CODE: `src/commands/rollback/index.ts`                            | mapped |
| Real `list` command                                 | Phase 6 / CODE: `src/commands/list/index.ts`                                | mapped |
| `login` command                                     | Phase 6 / CODE: `src/commands/login/index.ts`                               | mapped |
| `logout` command                                    | Phase 6 / CODE: `src/commands/logout/index.ts`                              | mapped |
| `whoami` command                                    | Phase 6 / CODE: `src/commands/whoami/index.ts`                              | mapped |
| All commands wired into router                      | Phase 7 / CODE: `src/bin.ts`                                                | mapped |
| OIDC release pipeline                               | Phase 8 / TASK: port `release.yml`                                          | mapped |
| Ops documentation                                   | Phase 9 / TASK: copy `other/docs/`                                          | mapped |
| Remove `other/`                                     | Phase 9 / TASK: delete `other/`                                             | mapped |

---

## Deferred decisions

- **`static` namespace** — keeping `universe static deploy|promote|rollback|list`
  for now. Whether to also support a shorter alias (or remove the prefix
  entirely) is deferred until there has been time to discuss the long-term
  command hierarchy across runtime types.
