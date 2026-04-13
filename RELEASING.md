# Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please).

## How It Works

1. Push commits to `main` using conventional commit format (`feat:`, `fix:`, `chore:`)
2. release-please opens (or updates) a **Release PR** with version bump and changelog
3. Review and merge the Release PR when ready to cut a release
4. On merge, release-please creates a git tag (`v0.2.0`) and GitHub Release
5. The tag triggers the build workflow, which produces standalone binaries

## Binaries

The build workflow (`.github/workflows/release.yml`) produces:

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |

Each binary is a Node SEA (Single Executable Application) — no Node.js install required.

SHA256 checksums are attached to every release.

## Setup (one-time, for repo admins)

1. Create a fine-grained PAT at https://github.com/settings/personal-access-tokens
   - Repository access: this repo only
   - Permissions: Contents (read/write), Pull requests (read/write)
2. Add the PAT as a repo secret named `RELEASE_TOKEN`
   - Settings > Secrets and variables > Actions > New repository secret

The PAT is needed because `GITHUB_TOKEN` events do not trigger downstream workflows (GitHub platform constraint).

## Commit Format

| Prefix                         | Version bump  | Example                          |
| ------------------------------ | ------------- | -------------------------------- |
| `feat:`                        | Minor (0.x.0) | `feat: add list command`         |
| `fix:`                         | Patch (0.0.x) | `fix: handle empty alias file`   |
| `chore:`                       | No bump       | `chore: update deps`             |
| `feat!:` or `BREAKING CHANGE:` | Major (x.0.0) | `feat!: change deploy ID format` |

## Manual Release (escape hatch)

If release-please is unavailable:

```sh
# Bump version in package.json manually
git tag v0.2.0
git push origin main --tags
```
