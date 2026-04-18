# Releasing

Releases are manual — you decide when to cut one.

## Prerequisites

- **npm Trusted Publisher** — the `@freecodecamp/universe-cli` package on npm must have GitHub Actions configured as a trusted publisher (Owner: `freeCodeCamp-Universe`, Repository: `universe-cli`, Workflow: `release.yml`). Configure at https://www.npmjs.com/package/@freecodecamp/universe-cli/access.

No npm token is required — the workflow authenticates via OIDC token exchange.

## How to Release

1. Add a `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md` describing the release. The workflow extracts this section verbatim as the GitHub Release body and fails if the section is missing.
2. Commit and push the CHANGELOG change to `main`.
3. Go to **Actions** > **Release** > **Run workflow**
4. Enter the version (e.g., `0.2.0`) — must match the CHANGELOG heading
5. Click **Run workflow**

The workflow:

- Runs tests and typecheck (via reusable `test.yml`)
- Builds Node SEA binaries for 4 platforms
- Signs macOS binaries
- Publishes to npm with OIDC provenance (via Trusted Publisher)
- Creates a git tag `v0.2.0` and a GitHub Release with binaries + SHA256 checksums

## Binaries

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |
| Linux ARM64         | `universe-linux-arm64`  |

Each binary is a Node SEA (Single Executable Application) — no Node.js install required.

## Idempotency

Re-running `release.yml` for the same version is safe. Each side effect has a guard so partial-failure runs converge without manual cleanup:

- **Bump commit** — skipped when `git diff --quiet` reports no pending version/CHANGELOG change.
- **Git tag** — skipped when `v$VERSION` already exists on `origin` (`git ls-remote --exit-code --tags`).
- **npm publish** — skipped when `@freecodecamp/universe-cli@$VERSION` is already on the registry (`npm view ... version`).
- **GitHub Release** — `softprops/action-gh-release` updates an existing release with the same tag instead of failing.

Example recoveries:

- Publish succeeds, build fails → re-run: publish is skipped, build retries, release is created.
- Build succeeds, publish fails → re-run: artifacts rebuild, publish retries, release completes.
- Tag pushed, GH release step fails → re-run: tag step skipped, softprops creates the release against the existing tag.

Destructive cleanup (delete the tag, yank from npm) is not required for normal failures — re-trigger the workflow first.

## Local Tag (escape hatch)

If GitHub Actions is unavailable:

```sh
git tag v0.2.0
git push origin v0.2.0
```

Then manually build and attach binaries to the GitHub Release.
