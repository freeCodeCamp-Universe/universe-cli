# CLI Merge Plan

Merge `tmp/other/` (v0.4.0 — production static-site deployment CLI) into the
main workspace (v3.24.0 — scaffolding spike), keeping:

- **Main's** architecture (ports/adapters, DI, custom parser, co-located tests,
  max TypeScript strictness, oxlint + oxfmt)
- **Other's** implemented commands, auth system, proxy client, and release pipeline

---

## Structural decisions

### Exit codes

Other's codes (10–19) are published stable contracts; main's spike codes that
collide are renumbered to 21–31. A new `src/errors/exit-codes.ts` exports
every constant so there is one place to look.

| Range | Owner                                              |
| ----- | -------------------------------------------------- |
| 0     | success                                            |
| 3–9   | main (create/scaffold operations — no conflicts)   |
| 10–19 | other (stable published codes — preserved exactly) |
| 21–31 | main (renumbered from former 10–20 collisions)     |

Renumbered main codes:

| Error               | Old | New |
| ------------------- | --- | --- |
| DEPLOYMENT          | 10  | 21  |
| PROMOTION           | 11  | 22  |
| ROLLBACK            | 12  | 23  |
| LOGS                | 13  | 24  |
| STATUS              | 14  | 25  |
| LIST                | 15  | 26  |
| TEARDOWN            | 16  | 27  |
| INVALID_NAME        | 17  | 28  |
| BAD_ARGUMENTS       | 18  | 29  |
| PACKAGE_INSTALL     | 19  | 30  |
| REPO_INITIALISATION | 20  | 31  |

### Output pattern

Ported commands print directly — clack for human output,
`process.stdout.write` for `--json` — and return
`{ exitCode: 0, output: '' }`. The `output` string field stays for
`create`'s interactive flow. On error, commands throw `CliError` and
let the router catch it (no direct `process.exit()` in command logic).

### `--json` flag

Added to `ParsedOptions`. New ported commands support it. Existing
commands (`create`, `register`, etc.) ignore it for now.

### Command namespace

The `static` subcommand prefix is preserved. The platform CLI supports
multiple runtimes, so namespacing by project type keeps the design space open
for future `universe node deploy`, etc. Top-level auth commands stay flat:

- `universe login / logout / whoami`
- `universe static deploy / promote / rollback / list`

The custom parser handles `static` as a namespace token: when the first
positional is `static`, the remaining args are dispatched to a static
sub-router. Flags placed before `static` (e.g. `universe --json static
deploy`) are preserved.

### Platform YAML schemas

Two schemas coexist:

- Main's existing manifest schema — used by `create` to write `platform.yaml`
- Other's v2 static schema — used by `deploy`/`promote`/`rollback`/`list`
  to read an existing `platform.yaml`

---

## New directory layout (additions only)

```
src/
├── auth/                          # NEW — auth ports + adapters
│   ├── identity-resolver.port.ts
│   ├── github-identity-resolver.ts
│   ├── github-identity-resolver.test.ts
│   ├── stub-identity-resolver.ts
│   ├── token-store.port.ts
│   ├── file-token-store.ts
│   ├── file-token-store.test.ts
│   ├── stub-token-store.ts
│   ├── device-flow.port.ts
│   ├── github-device-flow.ts
│   ├── github-device-flow.test.ts
│   └── stub-device-flow.ts
├── constants.ts                   # NEW — DEFAULT_GH_CLIENT_ID, DEFAULT_PROXY_URL
├── errors/
│   ├── cli-errors.ts              # UPDATED — add 6 new error classes
│   └── exit-codes.ts              # NEW — all exit code constants
├── output/                        # NEW — port from other
│   ├── envelope.ts
│   ├── format.ts
│   └── redact.ts
├── platform/
│   ├── http-proxy-client.ts       # NEW — replaces proxy-client.stub.ts for deploy
│   ├── proxy-client.port.ts       # NEW — ProxyClient interface
│   ├── proxy-client.stub.ts       # NEW
│   ├── proxy-client.test.ts       # NEW
│   ├── platform-yaml-v2.schema.ts # NEW — static deploy v2 schema
│   └── platform-yaml-v2.ts        # NEW — parser + types
└── commands/
    ├── deploy/
    │   ├── index.ts               # REPLACED — real proxy-based implementation
    │   ├── index.test.ts          # NEW
    │   ├── build.ts               # NEW — from other/src/lib/build.ts
    │   ├── build.test.ts          # NEW
    │   ├── git.ts                 # NEW — from other/src/deploy/git.ts
    │   ├── git.test.ts            # NEW
    │   ├── ignore.ts              # NEW — from other/src/lib/ignore.ts
    │   ├── ignore.test.ts         # NEW
    │   ├── upload.ts              # NEW — from other/src/lib/upload.ts
    │   ├── upload.test.ts         # NEW
    │   ├── walk.ts                # NEW — from other/src/deploy/walk.ts
    │   └── walk.test.ts           # NEW
    ├── list/
    │   ├── index.ts               # REPLACED — real proxy-based implementation
    │   └── index.test.ts          # NEW
    ├── login/                     # NEW
    │   ├── index.ts
    │   └── index.test.ts
    ├── logout/                    # NEW
    │   ├── index.ts
    │   └── index.test.ts
    ├── promote/
    │   ├── index.ts               # REPLACED — real proxy-based implementation
    │   └── index.test.ts          # NEW
    ├── rollback/
    │   ├── index.ts               # REPLACED — real proxy-based implementation
    │   └── index.test.ts          # NEW
    └── whoami/                    # NEW
        ├── index.ts
        └── index.test.ts

.github/
├── actions/
│   └── validate-version/          # NEW — from other
└── workflows/
    └── release.yml                # NEW — OIDC trusted publisher + SEA binaries

docs/                              # NEW — ops docs from other
├── FLIGHT-MANUAL.md
├── STAFF-GUIDE.md
├── RELEASING.md
└── platform-yaml.md
```

---

## Phase checklist

### Phase 1 — Foundation

- [ ] `package.json` — rename to `@freecodecamp/universe-cli`; add `engines`,
      `homepage`, `bugs`, `repository`, `publishConfig`, `files`, `keywords`;
      remove spike metadata
- [ ] `src/errors/exit-codes.ts` — new file; all exit code constants (merged,
      renumbered)
- [ ] `src/errors/cli-errors.ts` — switch to import exit codes from
      `exit-codes.ts`; renumber main's colliding codes; add `ConfigError`,
      `CredentialError`, `StorageError`, `GitError`, `ConfirmError`,
      `PartialUploadError`
- [ ] `src/output/envelope.ts` — port from other
- [ ] `src/output/format.ts` — port from other
- [ ] `src/output/redact.ts` — port from other
- [ ] `src/constants.ts` — `DEFAULT_GH_CLIENT_ID`, `DEFAULT_PROXY_URL`

### Phase 2 — Auth infrastructure

- [ ] `src/auth/identity-resolver.port.ts`
- [ ] `src/auth/github-identity-resolver.ts` + `.test.ts` (port from
      `other/src/lib/identity.ts`)
- [ ] `src/auth/stub-identity-resolver.ts`
- [ ] `src/auth/token-store.port.ts`
- [ ] `src/auth/file-token-store.ts` + `.test.ts` (port from
      `other/src/lib/token-store.ts`)
- [ ] `src/auth/stub-token-store.ts`
- [ ] `src/auth/device-flow.port.ts`
- [ ] `src/auth/github-device-flow.ts` + `.test.ts` (port from
      `other/src/lib/device-flow.ts`)
- [ ] `src/auth/stub-device-flow.ts`

### Phase 3 — Proxy client

- [ ] `src/platform/proxy-client.port.ts` — `ProxyClient` interface extracted
      from other's proxy-client.ts; `ProxyError` class here too
- [ ] `src/platform/http-proxy-client.ts` + `.test.ts` (port concrete impl
      from other)
- [ ] `src/platform/proxy-client.stub.ts`

### Phase 4 — Platform YAML v2

- [ ] `src/platform/platform-yaml-v2.schema.ts` (port from other)
- [ ] `src/platform/platform-yaml-v2.ts` — parser + `PlatformYamlV2` type +
      `.test.ts`

### Phase 5 — Deploy utilities

- [ ] `src/commands/deploy/git.ts` + `.test.ts`
- [ ] `src/commands/deploy/walk.ts` + `.test.ts`
- [ ] `src/commands/deploy/ignore.ts` + `.test.ts`
- [ ] `src/commands/deploy/build.ts` + `.test.ts`
- [ ] `src/commands/deploy/upload.ts` + `.test.ts`

### Phase 6 — Commands

- [ ] `src/commands/deploy/index.ts` — replace stub; `--json` support;
      port from other's `commands/deploy.ts`
- [ ] `src/commands/deploy/index.test.ts`
- [ ] `src/commands/promote/index.ts` — replace stub; port from other
- [ ] `src/commands/promote/index.test.ts`
- [ ] `src/commands/rollback/index.ts` — replace stub; port from other
- [ ] `src/commands/rollback/index.test.ts`
- [ ] `src/commands/list/index.ts` — replace stub; port from other's `ls.ts`
- [ ] `src/commands/list/index.test.ts`
- [ ] `src/commands/login/index.ts` — port from other
- [ ] `src/commands/login/index.test.ts`
- [ ] `src/commands/logout/index.ts` — port from other
- [ ] `src/commands/logout/index.test.ts`
- [ ] `src/commands/whoami/index.ts` — port from other
- [ ] `src/commands/whoami/index.test.ts`

### Phase 7 — Wire-up

- [ ] `src/bin.ts` — add `json` to `ParsedOptions`; add `login`, `logout`,
      `whoami` to `CommandName`; add arg parsers + handler binders for all new
      commands; update `RouteDeps` with auth + proxy client deps; wire real
      adapters; remove platform stubs for deploy/promote/rollback/list; update
      help text

### Phase 8 — Release pipeline

- [ ] `.github/actions/validate-version/` — port from other
- [ ] `.github/workflows/release.yml` — port from other (OIDC trusted
      publisher + multi-platform SEA binaries)

### Phase 9 — Docs + cleanup

- [ ] `docs/FLIGHT-MANUAL.md` — port from other
- [ ] `docs/STAFF-GUIDE.md` — port from other
- [ ] `docs/RELEASING.md` — port from other
- [ ] `docs/platform-yaml.md` — port from other
- [ ] `CHANGELOG.md` — add v1.0.0 entry describing the merge
- [ ] Remove `other/` from the workspace once all phases pass CI

---

## Deferred decisions

- **`static` namespace** — keeping `universe static deploy|promote|rollback|list`
  for now. Whether to also support a shorter alias (or remove the prefix
  entirely) is deferred until there has been time to discuss the long-term
  command hierarchy across runtime types.

---

## Out of scope (follow-up work)

- `--json` support for existing commands (`create`, `register`, `logs`,
  `status`, `teardown`)
- support aliases `ls` for `list` etc.
- Full implementations of `register`, `logs`, `status`, `teardown` (still
  stubs post-merge; now with correct exit codes)
- OIDC identity slot in `github-identity-resolver.ts` (deferred per ADR-016;
  re-add when artemis grows an OIDC verifier)
- Woodpecker OIDC slot (same deferral)
