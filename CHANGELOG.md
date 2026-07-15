# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.11.0...universe-cli-v0.12.0) (2026-07-15)


### Features

* **cli:** add audit ls command ([#29](https://github.com/freeCodeCamp-Universe/universe-cli/issues/29)) ([f7c9882](https://github.com/freeCodeCamp-Universe/universe-cli/commit/f7c98825f382fa385d1fd437459b0b54a758491d))

## [0.11.0](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.10.1...universe-cli-v0.11.0) (2026-07-14)


### Features

* add 'create' command ([#21](https://github.com/freeCodeCamp-Universe/universe-cli/issues/21)) ([e0392b8](https://github.com/freeCodeCamp-Universe/universe-cli/commit/e0392b82b4505d1ab503de87ac8d6cfb14c292a7))


### Bug Fixes

* **proxy:** map 429 rate-limit to EXIT_STORAGE ([f920e71](https://github.com/freeCodeCamp-Universe/universe-cli/commit/f920e715a8240e393187fad02362eb9f0f60b62d))

## [0.10.1](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.10.0...universe-cli-v0.10.1) (2026-06-03)


### Bug Fixes

* use node types, not DOM ([#19](https://github.com/freeCodeCamp-Universe/universe-cli/issues/19)) ([c36daf1](https://github.com/freeCodeCamp-Universe/universe-cli/commit/c36daf1ba30c58ffc5ed44a2ed814ca3bd081f36))

## [0.10.0](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.9.0...universe-cli-v0.10.0) (2026-06-02)


### Features

* **deploy:** reuse preview on --promote of same hash ([#8](https://github.com/freeCodeCamp-Universe/universe-cli/issues/8)) ([5a659e5](https://github.com/freeCodeCamp-Universe/universe-cli/commit/5a659e51c958a9d0b006c56ca2e2ea9cc92de561))
* **init:** scaffold platform.yaml command ([#5](https://github.com/freeCodeCamp-Universe/universe-cli/issues/5)) ([9bf5c07](https://github.com/freeCodeCamp-Universe/universe-cli/commit/9bf5c0776e1747f81adc9557b0917a8006b8494f))
* **ls:** show preview/production STATE per deploy ([#7](https://github.com/freeCodeCamp-Universe/universe-cli/issues/7)) ([e1eabe5](https://github.com/freeCodeCamp-Universe/universe-cli/commit/e1eabe57b4722c44ebac14952f9704e575d4657f))
* replace cac with commander, default to showing help ([#12](https://github.com/freeCodeCamp-Universe/universe-cli/issues/12)) ([139a50c](https://github.com/freeCodeCamp-Universe/universe-cli/commit/139a50c9eda191670bd7dd1c357e363312f2f50e))

## [0.9.0](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.8.1...universe-cli-v0.9.0) (2026-06-02)


### Features

* **repo:** add rm command to delete requests ([53259c5](https://github.com/freeCodeCamp-Universe/universe-cli/commit/53259c54b98822629009988e00474f3271f454ef))
* **repo:** ls --all flag + already_exists hint ([763e197](https://github.com/freeCodeCamp-Universe/universe-cli/commit/763e1971cf1c2136ec975bd8ef0da2961c5ebad2))


### Bug Fixes

* **cli:** env-gated refresh worker + harden tests ([284d071](https://github.com/freeCodeCamp-Universe/universe-cli/commit/284d0717ebce77d77269d5449bccb4b1cd387b8a))
* **update-notifier:** detached refresh worker ([e7877f4](https://github.com/freeCodeCamp-Universe/universe-cli/commit/e7877f4ac53256f8f3efc6435aee8eec476a9f27))

## [0.8.1](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.8.0...universe-cli-v0.8.1) (2026-06-01)


### Bug Fixes

* **update-notifier:** 6h TTL + --version force-check ([2036bb8](https://github.com/freeCodeCamp-Universe/universe-cli/commit/2036bb84b890f748f2362a88156662441fc1bdb0))

## [0.8.0](https://github.com/freeCodeCamp-Universe/universe-cli/compare/universe-cli-v0.7.2...universe-cli-v0.8.0) (2026-06-01)


### ⚠ BREAKING CHANGES

* **identity:** identity chain now prefers the `universe login` device-flow token (slot 3) over `gh auth token` (slot 4). CI is unaffected — `$GITHUB_TOKEN` / `$GH_TOKEN` env vars (slots 1+2) still win. Staff using `gh` as fallback continue to work when no `universe login` token exists.

### Features

* **client:** add getAlias() to proxy-client ([1450434](https://github.com/freeCodeCamp-Universe/universe-cli/commit/14504349baf23f1c11d2e7a9490c20af1b978033))
* **client:** extend promote/rollback schema + AliasDriftError ([0cebc30](https://github.com/freeCodeCamp-Universe/universe-cli/commit/0cebc30fcffe422488ec9f42585ebed58b123089))
* **cli:** guard top-level unhandled errors ([330bd21](https://github.com/freeCodeCamp-Universe/universe-cli/commit/330bd213684f8cc789c7db29c7ea0942bdcf88a2))
* **cli:** wire login/logout/whoami top-level ([ff85afe](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ff85afef11aa7b498c3aa07d3b363dc155821613))
* **commands:** add login (device flow) ([045aedc](https://github.com/freeCodeCamp-Universe/universe-cli/commit/045aedcc324195b6396da2b8523eeb07bfe15c2e))
* **commands:** add logout ([759ea1a](https://github.com/freeCodeCamp-Universe/universe-cli/commit/759ea1a84267c28a9de975b09701411353a50961))
* **commands:** add ls + wire static ns ([392e88e](https://github.com/freeCodeCamp-Universe/universe-cli/commit/392e88e72deda7a289c2118ecf89c879446fac04))
* **commands:** add whoami ([18b2871](https://github.com/freeCodeCamp-Universe/universe-cli/commit/18b287100f52644bb18d89527b053891ae658037))
* **commands:** rewrite deploy for artemis proxy ([2fe7c22](https://github.com/freeCodeCamp-Universe/universe-cli/commit/2fe7c2213e8e45ea9017c426193bf769e044f7e4))
* **commands:** rewrite promote + rollback for proxy ([bd02b9e](https://github.com/freeCodeCamp-Universe/universe-cli/commit/bd02b9efbcb090409aa272a78c883181bbe65f73))
* **identity:** prefer device-flow over gh CLI ([37b9281](https://github.com/freeCodeCamp-Universe/universe-cli/commit/37b92816a6da454eced93cebbede80f0a2c92893))
* implement static deploy CLI (Epic 0-2) ([12db222](https://github.com/freeCodeCamp-Universe/universe-cli/commit/12db222f00702bcc46ac402216ce15f0464f4cdd))
* **lib:** add build runner for platform.yaml ([99581b0](https://github.com/freeCodeCamp-Universe/universe-cli/commit/99581b0ad1ee13d8c09ebd0f6e08763d9746203a))
* **lib:** add GitHub OAuth device flow ([99be630](https://github.com/freeCodeCamp-Universe/universe-cli/commit/99be6309a03689a5bd0affa2c42827004762cbe5))
* **lib:** add gitignore-style ignore filter ([50b8ced](https://github.com/freeCodeCamp-Universe/universe-cli/commit/50b8ced2d26a85fee65e45143d82e3bb7eff890d))
* **lib:** add identity priority chain (Q10) ([9f304d6](https://github.com/freeCodeCamp-Universe/universe-cli/commit/9f304d6b70c2b73a32d95cc933d1c609ec4e2cb8))
* **lib:** add platform.yaml v2 schema + parser ([8788648](https://github.com/freeCodeCamp-Universe/universe-cli/commit/8788648c8bbb0ccc9fe2b989fa9a26382d5b0591))
* **lib:** add proxy-client for artemis API ([ccc71ab](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ccc71abf057fc91ee8a7ee33f85a3b5eabc6e9ba))
* **lib:** add token-store for device-flow auth ([7438612](https://github.com/freeCodeCamp-Universe/universe-cli/commit/74386123658f2bac4f54e38336a2a5192b198958))
* **lib:** add upload to proxy plane ([73bf894](https://github.com/freeCodeCamp-Universe/universe-cli/commit/73bf8941594b507acf4b667f6e465621d93881bb))
* **login:** bake default GH OAuth client_id ([0a3f1ce](https://github.com/freeCodeCamp-Universe/universe-cli/commit/0a3f1ce8d83edbf3974f54e8336350a8e8e3b715))
* **login:** warn when authorized site count is zero ([84df1d5](https://github.com/freeCodeCamp-Universe/universe-cli/commit/84df1d5ef7947a07e052d7d5536963e6046967e3))
* **output:** surface proxy error kind + request id ([deb1b46](https://github.com/freeCodeCamp-Universe/universe-cli/commit/deb1b4609a2ccdae854dfd98b5caefafd463a66a))
* **promote:** pre-flight getAlias + body-pin POST ([f476208](https://github.com/freeCodeCamp-Universe/universe-cli/commit/f476208f3386c06eef6e2ded05515ca7dda5b538))
* **promote:** surface 409 alias_drift + one-shot retry ([d260fd0](https://github.com/freeCodeCamp-Universe/universe-cli/commit/d260fd0228e1ad3bcdd4818a316744d80d52cc37))
* **proxy-client:** add 4 registry methods ([3fce262](https://github.com/freeCodeCamp-Universe/universe-cli/commit/3fce262d17c26f2e119ed9939ff7b8392ca08984))
* **proxy:** UNIVERSE_DEBUG round-trip trace to stderr ([a0c1338](https://github.com/freeCodeCamp-Universe/universe-cli/commit/a0c133880f54228da7d2387d6f1392e0f1e123ce))
* publish to npm with OIDC provenance ([f6a090e](https://github.com/freeCodeCamp-Universe/universe-cli/commit/f6a090eb7ec09ee60a7bfc90d270f6ba39589c9d))
* **repo:** add repo approve command ([d205f9a](https://github.com/freeCodeCamp-Universe/universe-cli/commit/d205f9a5101f9b11c5019730f9bee65c51a3996c))
* **repo:** add repo command shared helpers ([6545d6a](https://github.com/freeCodeCamp-Universe/universe-cli/commit/6545d6a7e2252622c35fbefb7c3bfd473fcb7ebf))
* **repo:** add repo create command ([7d47e70](https://github.com/freeCodeCamp-Universe/universe-cli/commit/7d47e7038d86bff22bec9a06932c4446cd148804))
* **repo:** add repo ls command ([7582f20](https://github.com/freeCodeCamp-Universe/universe-cli/commit/7582f200dc91be53f8b07feb70a55dc933f7187a))
* **repo:** add repo reject command ([cdb5137](https://github.com/freeCodeCamp-Universe/universe-cli/commit/cdb51376bb38f86e0e4f16f975e7cd7157735eba))
* **repo:** add repo status command ([380c5ea](https://github.com/freeCodeCamp-Universe/universe-cli/commit/380c5eaf50e6b3b26bcf3aeee9044d0250505f0b))
* **repo:** add repo-request proxy-client methods ([5b0c444](https://github.com/freeCodeCamp-Universe/universe-cli/commit/5b0c4446147f5065c971a26049b9ad73b96bab50))
* **repo:** add repo-request zod schema ([142d3be](https://github.com/freeCodeCamp-Universe/universe-cli/commit/142d3bedd71b1d793129b70f83f16a055a3f4482))
* **repo:** include identitySource in error envelopes ([ba2956e](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ba2956ebcc115927a5634d54708e4e7150451d7e))
* **repo:** structured json envelope for approved_failed approve ([ac6c904](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ac6c904fbc3cbe19a34f827f911381808d069801))
* **repo:** wire repo namespace dispatch ([9d940a6](https://github.com/freeCodeCamp-Universe/universe-cli/commit/9d940a626844bf660c6e19fa78466d7b749fffbd))
* **rollback:** pre-flight getAlias + CAS expectedCurrent ([5e3d26d](https://github.com/freeCodeCamp-Universe/universe-cli/commit/5e3d26d6a17bd3ceb477b16be5157540d6a2b980))
* **sites:** register/ls/update/rm commands ([d10342a](https://github.com/freeCodeCamp-Universe/universe-cli/commit/d10342a7fda305c26dd62eba6445c5008010abae))
* Tier 1 hardening (T1.1, T1.2, T1.3a, T1.6) ([475ec3f](https://github.com/freeCodeCamp-Universe/universe-cli/commit/475ec3fdd9d29e602ff39c5ce39a53242c8579bf))
* Tier 1 security hardening (T1.3b, T1.4, T1.4b, T1.4c, T1.5) ([2610b47](https://github.com/freeCodeCamp-Universe/universe-cli/commit/2610b47548995d05336453ad64cdf2fb785279f8))
* Tier 2 hygiene (T2.1-T2.9) — ship v0.3.0 ([ea20726](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ea20726d68777b74d76fbff0874c324244c0dd66))
* universe platform QOL ([#10](https://github.com/freeCodeCamp-Universe/universe-cli/issues/10)) ([5d69f87](https://github.com/freeCodeCamp-Universe/universe-cli/commit/5d69f87d6e2c799a7dc15a47f0c2b7fb02522c83))
* v0.5.0 - sites --mine + UX fixes + docs ([e573e94](https://github.com/freeCodeCamp-Universe/universe-cli/commit/e573e94810b6f541e986c8d71d4f194d1a1cc0ce))
* **whoami:** surface resolved proxy url ([ffcd0c8](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ffcd0c88e7300c0ff2c43dd837edce9e643649f9))


### Bug Fixes

* add update notice, strip comments ([78813f2](https://github.com/freeCodeCamp-Universe/universe-cli/commit/78813f2cb7c4a7133d08b3de22730a8dcc518963))
* **ci:** allow same version in npm publish job ([0eb49f8](https://github.com/freeCodeCamp-Universe/universe-cli/commit/0eb49f81a474b4e6b85cec68f6d50f0801f0806b))
* **ci:** bundle all deps for SEA, fix macOS binary signing ([0173ed8](https://github.com/freeCodeCamp-Universe/universe-cli/commit/0173ed87f56d0cd299cf3c7058d32746820c01ff))
* **ci:** remove duplicate pnpm version — use packageManager field ([6a720bc](https://github.com/freeCodeCamp-Universe/universe-cli/commit/6a720bc4e3f15ef1b665a417023c5a506658fd5d))
* **ci:** upgrade npm to 11+ for Trusted Publisher OIDC ([4e5700e](https://github.com/freeCodeCamp-Universe/universe-cli/commit/4e5700e707b591dac99ff5db0f538bd5df40ca59))
* **ci:** use Node 24 for publish job, drop npm self-upgrade step ([a1f7125](https://github.com/freeCodeCamp-Universe/universe-cli/commit/a1f7125c6abb7603087a0bd948eda1f5b53ff19c))
* **cli:** actionable hint on user_unauthorized ([294468d](https://github.com/freeCodeCamp-Universe/universe-cli/commit/294468dadb92811143891b9dcfb25123e871cfc4))
* **cli:** catch cac parse errors in repo dispatch ([78b81b2](https://github.com/freeCodeCamp-Universe/universe-cli/commit/78b81b26bc0bf00eb705290dbfffdea030990e25))
* **client:** widen DEPLOY_ID_RE to server parity ([f3dd1a5](https://github.com/freeCodeCamp-Universe/universe-cli/commit/f3dd1a575d5e503edd7b9c8b4082df146952bf4d))
* **cli:** error on unknown repo subcommand instead of silent exit 0 ([0da1bbc](https://github.com/freeCodeCamp-Universe/universe-cli/commit/0da1bbc6540b0bce5f8e37b3dab92734eb157e60))
* **config:** reject consecutive hyphens in site name (D19) ([fe3d0b7](https://github.com/freeCodeCamp-Universe/universe-cli/commit/fe3d0b7ef395a52c86c0757464da6e8a4767b5d4))
* **deploy:** cap inline auth list at 10 entries ([76cebe9](https://github.com/freeCodeCamp-Universe/universe-cli/commit/76cebe95efc302d7bd81ab99b05b5b64facfae95))
* **deploy:** pin --from &lt;id&gt; in preview next-hint ([37af29d](https://github.com/freeCodeCamp-Universe/universe-cli/commit/37af29df46a0dc60edcdf37804d8769fa5f91f37))
* **deploy:** self-contained preflight error UX ([c0ea74e](https://github.com/freeCodeCamp-Universe/universe-cli/commit/c0ea74e8dc79660b213f6af39a0abf8056c79de1))
* **deploy:** silence info+warn under --json (B2) ([6c61708](https://github.com/freeCodeCamp-Universe/universe-cli/commit/6c61708b91a3764ad8d3b04ad2b704f18deda3a3))
* improve command output UX and add credential setup docs ([aad38e0](https://github.com/freeCodeCamp-Universe/universe-cli/commit/aad38e05155e808cce52c7f1f3cd55a26bfabc73))
* **lib:** tsc clean for whoami + identity ([ae9c477](https://github.com/freeCodeCamp-Universe/universe-cli/commit/ae9c4776be92345792378c27c18625d8ea34bdc2))
* **ls:** sort deploys newest-first ([99f7fff](https://github.com/freeCodeCamp-Universe/universe-cli/commit/99f7fffff1ec3c1774b02451a93d92e8d7b33ab7))
* **output:** route human error messages to stderr ([931b110](https://github.com/freeCodeCamp-Universe/universe-cli/commit/931b110cfcbc3533d1c1b21c9a64b36691c882b7))
* pin node versions ([5b3451c](https://github.com/freeCodeCamp-Universe/universe-cli/commit/5b3451cef4e39b9cba7fd94a3ee4afa6ae690a87))
* pin postject as devDependency, use pnpm exec in CI ([782230d](https://github.com/freeCodeCamp-Universe/universe-cli/commit/782230dc97859b504c133e37f4c4a569de49fcb6))
* **pkg:** add repository field required by npm provenance validation ([3e15f64](https://github.com/freeCodeCamp-Universe/universe-cli/commit/3e15f64e6a70970984502f2a797b1659833c390b))
* **proxy:** name target host in network/timeout errors ([8ba8a25](https://github.com/freeCodeCamp-Universe/universe-cli/commit/8ba8a2535e13f7acf32c9eb5a64c8cccc9c0fd2a))
* **proxy:** validate repo response shapes at client boundary ([06e040d](https://github.com/freeCodeCamp-Universe/universe-cli/commit/06e040d016a99dbb5159976a9125985fd0a49282))
* **release:** grant reusable test job contents:read ([0bb6102](https://github.com/freeCodeCamp-Universe/universe-cli/commit/0bb6102cdab0a163fc8fb2d1ad0698505858ddd7))
* replace tinyglobby with Node built-in readdirSync for SEA compatibility ([4c7556a](https://github.com/freeCodeCamp-Universe/universe-cli/commit/4c7556aa524dcd111e7d11ff7e982446f9da8713))
* **repo:** coerce numeric create/reject options to strings ([b050207](https://github.com/freeCodeCamp-Universe/universe-cli/commit/b0502073623250a4ef64ad95334e7f70256389ac))
* **repo:** require --yes in non-TTY + standard error envelope ([bc1b521](https://github.com/freeCodeCamp-Universe/universe-cli/commit/bc1b521bba332a959256c9145df7a424b3fec16b))
* **repo:** standardize approved_failed error envelope ([d09e7da](https://github.com/freeCodeCamp-Universe/universe-cli/commit/d09e7da3bcce1cae7a49d1c90a9d2dacfbdc3a60))
* **repo:** validate create input before client setup ([7b13ff8](https://github.com/freeCodeCamp-Universe/universe-cli/commit/7b13ff863648cc576aa0bef4032cbad0812af4b4))
* **repo:** validate ls --status against allowed set ([099a044](https://github.com/freeCodeCamp-Universe/universe-cli/commit/099a0447234f2697d49cfb63f2b3047ac925f093))
* resolve doc inconsistencies and simplify user experience ([33bf49a](https://github.com/freeCodeCamp-Universe/universe-cli/commit/33bf49ab3d4382673fb0294c57fd7cfb12b2663f))
* split tsup config — ESM normal, CJS bundles all deps for SEA ([1e5f209](https://github.com/freeCodeCamp-Universe/universe-cli/commit/1e5f2092151d6ed0d98f3ef68f3b555ea8222bf0))
* **static:** warn on prod-only alias divergence ([75f71e9](https://github.com/freeCodeCamp-Universe/universe-cli/commit/75f71e9ab28c226b914a3c1bfd7187aa8aa55424))

## [Unreleased]



## [0.7.2] - 2026-05-26


### Fixed

- add update notice, strip comments



## [0.7.1] - 2026-05-25


### Added

- warn when authorized site count is zero (login)
- prefer device-flow over gh CLI (identity)



## [0.7.0] - 2026-05-23

### Added

- End-to-end test suite covering all 11 CLI verbs against a local fake-artemis fixture. Two layers under `tests/e2e/`: in-process command-handler tests with the real `proxy-client` (sequence + behavior coverage) and a spawned-binary smoke matrix (cac dispatch + tsup-output regression guard). See `docs/README.md` §Internal conventions for extension notes.
- Opt-in real-artemis smoke via `pnpm test:smoke` (`tests/e2e/smoke-real-artemis.test.ts`). Gated on `UNIVERSE_E2E_REAL=1`; reads `UNIVERSE_REAL_TOKEN` and `UNIVERSE_REAL_SITE` from env. Asserts the production-alias closed loop by fetching the public URL post-deploy and matching a freshly-deployed marker — the diagnostic test for "sites not updating" reports.

### Fixed

- `static deploy --json` no longer prints the build-skipped notice or the git-dirty warning to stdout. Both `info()` and `warn()` are now gated behind `!options.json`, so machine consumers can parse stdout as a single JSON document.
- `static ls` now returns deploys newest-first. Previously artemis returned the list lexicographically ascending and the CLI did not re-sort, so the top of the list was always the OLDEST deploy. Operators reading `ls` after a successful deploy saw a stale top entry and reasonably concluded that the deploy had not landed — the most likely root cause of the "sites are not updating" reports. The CLI now sorts descending by deployId regardless of server order.

## [0.6.0] - 2026-05-13

### Added

- pre-flight getAlias + CAS expectedCurrent (rollback)
- surface 409 alias_drift + one-shot retry (promote)
- pre-flight getAlias + body-pin POST (promote)
- extend promote/rollback schema + AliasDriftError (client)
- add getAlias() to proxy-client (client)

### Fixed

- widen DEPLOY_ID_RE to server parity (client)

## [0.5.1] - 2026-05-13

### Fixed

- warn on prod-only alias divergence (static)
- pin --from <id> in preview next-hint (deploy)
- sort deploys newest-first (ls)
- silence info+warn under --json (B2) (deploy)

## [0.5.0] - 2026-05-11

Static-apps registry consumer + output UX hardening. The artemis proxy gained four new endpoints (`POST /api/site/register`, `GET /api/sites`, `PATCH /api/site/{slug}`, `DELETE /api/site/{slug}`) replacing the git-tracked `artemis/config/sites.yaml` ops loop with a Valkey-backed registry. This release wires the CLI to those endpoints and fixes two v0.4-era output bugs surfaced during smoke testing.

This is a non-breaking release for the v0.4 happy paths. The `whoami` envelope shape changed — see **Changed** below if you parse it in CI.

### Added

- `universe sites <subcommand>` namespace — distinct from the existing per-site `universe ls` (which lists deploys), this lists / mutates the registry of every static site.
  - `universe sites register <slug> [--team=<name>...]` — POST `/api/site/register`. `--team` accepts repeated flags or comma-separated values; omitted → server defaults to `[RegistryAuthzTeam]` (typically `staff`). Staff-only.
  - `universe sites ls [--json] [--mine]` — GET `/api/sites`. Open to any GitHub bearer (no special team membership required). Renders a plain text table (slug / teams / created-by / created-at) or a `{count, scope, sites[]}` JSON envelope. `--mine` intersects with the caller's authorized sites (client-side filter against `/api/whoami`) for "what can I deploy" queries that don't dump the full org-wide registry.
  - `universe sites update <slug> --team=<name>...` — PATCH `/api/site/{slug}`. `--team` is required with at least one entry; CLI rejects empty with `EXIT_USAGE` before round-tripping. Staff only.
  - `universe sites rm <slug>` — DELETE `/api/site/{slug}`. R2 deploy bytes are NOT touched (post-GA cleanup cron handles that). Staff only.
- `src/lib/proxy-client.ts` — four typed methods (`registerSite`, `listSites`, `updateSite`, `deleteSite`) mirroring the artemis Go handler shapes. Exports `SiteRow` (slug, teams, createdAt, updatedAt, createdBy) — the canonical wire shape returned by register / list / update.
- `src/commands/sites/_shared.ts` — `parseTeamsFlag` helper, identity resolution, and shared `SitesCommandDeps` interface so all four commands share one wiring pattern.

### Changed

- **`whoami` envelope no longer enumerates `authorizedSites`.** The JSON envelope now exposes `authorizedSitesCount` (number) instead of `authorizedSites` (array); the pretty output prints the count plus a pointer to `universe sites ls --mine`. Inlining the full list does not scale to staff who belong to dozens of teams. **JSON consumers reading the old `authorizedSites` array must switch to `sites ls --mine --json`.**
- **Deploy preflight error** (`site is not registered for your GitHub identity`) reworked for self-contained recovery: surfaces a "Did you mean?" hint (case-insensitive substring, Damerau-Levenshtein ≤ 2 fallback) when the typo is close to a registered slug, and names the admin remediation commands (`universe sites register …` / `universe sites update …`, staff-gated) directly in the body. Authorized-list rendering is scale-aware: inline when the caller's authorized count is ≤ 10, otherwise the count plus a `universe sites ls --mine` redirect (matches the `whoami` split above). Did-you-mean stays inline regardless of size — it's the primary typo-recovery surface. No external runbook redirect.

### Fixed

- **Duplicate error output on every non-`--json` failure.** Each command's catch path called both `log.error(message)` (clack pretty) and `exitWithCode(code, message)`, and the latter unconditionally re-wrote `message` to stderr — surfacing every error twice (decorated
  - raw). `exitWithCode` now drops the message arg and only exits; callers retain ownership of user-facing output.

### Notes

- Authz: staff-only commands rely on the artemis `requireRegistryAuthz` middleware (configurable via the `REGISTRY_AUTHZ_TEAM` env on the proxy; `staff` by default). The CLI does not pre-check team membership — it forwards the GitHub bearer and surfaces 403 responses.
- Identity: same chain as v0.4 — `$GITHUB_TOKEN` / `$GH_TOKEN` env → `gh auth token` → device-flow stored token. Run `universe login` first if no slot resolves.

## [0.4.0] - 2026-04-27

Proxy-plane pivot. Staff and CI hold only a `platform.yaml` + a GitHub identity; the R2 admin token lives exclusively inside the `artemis` proxy at `uploads.freecode.camp`. Locked by Universe ADR-016 + sprint 2026-04-26 DECISIONS Q9–Q15 + 2026-04-27 CLI namespace amendment.

This is a BREAKING release. v0.3.x consumers must migrate `platform.yaml` to the v2 schema and update the CLI surface (see **Changed**). The CLI no longer holds R2 credentials and never will.

### Added

- `universe login` / `logout` / `whoami` top-level commands. `login` drives a GitHub OAuth device flow against the baked-in `DEFAULT_GH_CLIENT_ID` (override via `UNIVERSE_GH_CLIENT_ID`) and persists the bearer at `~/.config/universe-cli/token` (mode 0600).
- `universe static ls [--site <site>]` lists recent deploys for the current (or specified) site.
- `src/lib/proxy-client.ts` — typed fetch wrapper for the artemis routes (`/api/whoami`, `/api/deploy/{init,upload,finalize}`, `/api/site/{site}/{deploys,promote,rollback}`). 401/403 → `EXIT_CREDENTIALS`; 422/5xx → `EXIT_STORAGE`; other 4xx → `EXIT_USAGE`. Exports `wrapProxyError(cmd, err)` so commands map thrown errors to one envelope/exit pair.
- `src/lib/identity.ts` — three-slot priority chain (post-F7): `$GITHUB_TOKEN` / `$GH_TOKEN` env → `gh auth token` shell-out → device-flow stored token. `whoami` surfaces the resolved slot.
- `src/lib/device-flow.ts` — RFC-8628 GitHub device flow with `slow_down` + `expired_token` + `access_denied` handling.
- `src/lib/token-store.ts` — `~/.config/universe-cli/token` reader / writer / deleter; respects `$XDG_CONFIG_HOME`; file mode 0600 + dir mode 0700.
- `src/lib/build.ts` — runs `platform.yaml` `build.command` in cwd via `shell: true` and verifies `build.output` directory landed.
- `src/lib/upload.ts` — per-file PUT to artemis with a configurable concurrency cap (default 6) and per-file error isolation. Surfaces partial uploads via `result.errors[]` so the caller can refuse to finalize. Hand-rolled async semaphore + inline static-site MIME map (no `p-limit` / `mrmime` runtime deps).
- `src/lib/ignore.ts` — minimal gitignore-style matcher for the upload set (`*`, `**`, `?`, anchored vs basename matches).
- `src/lib/constants.ts` — `DEFAULT_GH_CLIENT_ID` (public OAuth App client id, safe to ship in source) and `DEFAULT_PROXY_URL` (`https://uploads.freecode.camp`).
- `platform.yaml` v2 schema (`src/lib/platform-yaml.{ts,schema.ts}`) with zod validator and strict unknown-key rejection. v1 migration detector: any of `r2`, `stack`, `domain`, `static`, `name` at the root produces a clear error pointing at `docs/platform-yaml.md`.
- Husky pre-commit gate runs `pnpm lint` + `pnpm typecheck` + `pnpm test`.
- Release workflow now derives the npm dist-tag from the version string (`alpha` / `beta` / `next` / `latest`) and flags GitHub prerelease badges automatically.

### Changed

- **BREAKING (CLI surface):**
  - `universe static deploy --force` → removed; missing git state auto-falls-back to a synthetic sha.
  - `universe static deploy --output-dir` → `--dir`.
  - `universe static promote <deployId>` (positional) → `--from <deployId>` (flag).
  - `universe static rollback --confirm` → `--to <deployId>` (required).
  - cli.ts now detects `static` as the first non-flag positional, so `universe --json static deploy` works alongside `universe static deploy --json`.
- **BREAKING (network):** CLI no longer reads R2 credentials. All uploads are streamed through the artemis proxy. Direct-to-R2 paths (`@aws-sdk/client-s3`, `rclone` config probing, `~/.aws/credentials`) are gone. Set `UNIVERSE_PROXY_URL` to override the default proxy host.
- **BREAKING (`platform.yaml`):** v1 → v2. Removed `name` (renamed to `site`), `stack`, `domain`, `static.*`, `r2.*`. New shape: `site` (required) + `build` (defaulted) + `deploy` (defaulted).
- `docs/platform-yaml.md` — `universe deploy` → `universe static deploy` references updated.

### Removed

- `src/credentials/` — R2 credential resolver.
- `src/storage/` — direct S3 client + alias / deploys / operations helpers.
- `src/deploy/{upload,id,preflight,metadata}.ts` — pre-pivot deploy pipeline. The proxy now owns deploy id minting, alias atomicity, and metadata.
- `src/config/{loader,schema}.ts` — replaced by `src/lib/platform-yaml.*` (v2).
- `errors.OutputDirError`, `errors.AliasError`, `errors.DeployNotFoundError` — no callers post-pivot.
- Identity slots `gha_oidc` and `woodpecker_oidc` — artemis validates bearers via GitHub `GET /user`, which only accepts user-scoped PATs / OAuth tokens. Re-add when artemis grows an OIDC verifier.
- Runtime deps: `@aws-sdk/client-s3`, `@smithy/util-stream`, `aws-sdk-client-mock`, `aws-sdk-client-mock-vitest`, `mrmime`, `p-limit`.

## [0.3.3] - 2026-04-18

Release 0.3.3

## [0.3.2] - 2026-04-18

Release 0.3.2

## [0.3.1] - 2026-04-18

Release 0.3.1

## [0.3.0] - 2026-04-15

Tier 2 hygiene release. Focuses on runtime alignment, workflow hygiene, and dependency updates. All Tier 2 findings from the adversarial review landed.

### Security

- Redaction regex extended to catch whitespace-before-separator, JSON-quoted credential values, Bearer authorization tokens, and additional AWS prefixes (ASIA, AROA, AIDA, ACCA, ANPA, ABIA, AGPA) (T2.6).
- S3 endpoint validated at credential resolution time: rejects malformed URLs, plaintext `http://` for non-localhost hosts, and URLs containing `user:pass@` userinfo (T2.5).
- Workflow permissions scoped per job: `test`/`build` get `contents: read`, `publish` adds only `id-token: write`, `release` is the only job with `contents: write` (T2.3).
- New preflight job verifies `inputs.version`, `package.json.version`, and a matching `CHANGELOG.md ## [X.Y.Z]` heading all agree before test/build/publish run. Prevents silent version drift (T2.8).

### Added

- `engines.node >= 22.11.0` in `package.json` so installs on older Node fail with a clear message.
- `description`, `keywords`, `bugs`, `homepage` fields in `package.json` for npm search visibility (T2.7).
- `.github/actions/check-version-consistency` composite action.

### Changed

- CI and SEA build matrix run on Node 24 (Active LTS since 2025-10-28). tsup target bumped to `node22` (T2.1).
- All six GitHub Actions SHAs updated: `actions/checkout` v5, `actions/setup-node` v5, `pnpm/action-setup` v5, `actions/upload-artifact` v5, `actions/download-artifact` v5, `softprops/action-gh-release` v2.4.1. Closes the Node 20 runtime deprecation warnings (T2.2).
- `pnpm` packageManager bumped to 10.33.0 (T2.4a).
- `p-limit` upgraded to v7 (T2.4b).
- `cac` upgraded to v7. Output channel changed to `console.info`, test spies updated (T2.4c).
- `zod` upgraded to v4. `.default({})` replaced with `.prefault({})` to match v4 default semantics (T2.4d).
- Zod validation errors now surface human-readable issue lists via `safeParse` instead of the raw JSON stringification that v3 `parse()` produced (T2.5).

## [0.2.0] - 2026-04-15

Tier 1 hardening release. Addresses security-critical and correctness findings from the adversarial review of 0.1.1.

### Security

- Reject symlinked directories and files whose target resolves outside the deploy output directory. Prevents `dist/link -> ~/.aws` from exfiltrating credentials to R2 (T1.4, T1.4b).
- Reject `output_dir` values in `platform.yaml` and `--output-dir` that are absolute or escape the project root (T1.4c).
- Eliminate the shell-injection vector on the `workflow_dispatch` version input by validating semver in a dedicated composite action and referencing the input through `$VERSION` env bindings instead of raw `${{ inputs.version }}` in `run:` blocks (T1.2).

### Added

- Typed error hierarchy: `CliError` abstract class with `ConfigError`, `CredentialError`, `StorageError`, `OutputDirError`, `GitError`, `AliasError`, `DeployNotFoundError`, `ConfirmError`. `handleActionError` now maps each subclass to its declared `exitCode` so CI automation can distinguish config errors (11) from credential errors (12) from storage errors (13) (T1.3a, T1.3b).
- `repository` field in `package.json` so npm provenance validation passes.

### Changed

- Upload now uses a single shared file walker (`walkFiles` in `src/deploy/walk.ts`). `preflight` and `upload` no longer disagree on which files count as deployable (T1.4b).
- `@types/node` bumped from `^20.19.39` to `^24.12.2` to match the Node 22/24 runtime, surfacing and fixing `Dirent.path` → `Dirent.parentPath` (T1.6).
- `src/cli.ts` uses static imports for command modules. Eliminates the documented Node SEA `useCodeCache` + `import()` incompatibility and drops the CJS bundle from 1.81MB to 1.56MB (T1.1).

### Fixed

- Deploy ID collision exhaust now throws `StorageError` instead of silently re-generating and potentially overwriting an active production deploy (T1.5).

## [0.1.1] - 2026-04-15

Canary release verifying the Node 24 + Trusted Publisher OIDC end-to-end publish path.

### Added

- Linux ARM64 Node SEA binary (`universe-linux-arm64`) for Raspberry Pi, AWS Graviton, and similar ARM64 hosts

### Changed

- Release notes now extracted from `CHANGELOG.md` at release time — this file is the single source of truth for release content
- CI restructured: reusable `test.yml` workflow, new `ci.yml` running on push/PR, `release.yml` calls the shared test workflow
- npm publish authenticates via Trusted Publisher OIDC — no stored token, provenance attestation on every release
- Publish job runs on Node 24 to access npm 11+ (required for Trusted Publisher OIDC credential exchange)

## [0.1.0] - 2026-04-13

### Added

- `universe static deploy` — deploy a static site to R2 with preview URLs
- `universe static promote` — promote a preview deployment to production
- `universe static rollback` — rollback production to the previous deployment
- Node SEA binaries for macOS (Apple Silicon, Intel) and Linux x64
- npm distribution via `@freecodecamp/universe-cli` package with OIDC provenance
- `--json` flag on all commands for CI integration
- `platform.yaml` based site configuration
