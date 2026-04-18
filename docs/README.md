# Universe CLI Design Notes (Session Archive)

This folder preserves the full planning and design work from the static deploy CLI discovery session so there is no context loss across sessions.

Files:

- `docs/00-source-inputs.md`: Source context captured from the session (ADR, user stories, Vite context, repo shape).
- `docs/01-tooling-research-and-recommendations.md`: Tooling research outcomes and rationale.
- `docs/02-static-cli-spec-v0.2.md`: Detailed functional and technical spec (locked decisions included).
- `docs/03-engineering-backlog.md`: Ticket-ready backlog with acceptance checks and test coverage.
- `docs/04-static-cli-spec-v0.3.md`: Implementation kickoff spec version. This is now the canonical source of truth for future work.
- `docs/99-session-handoff.md`: Session continuity guide for next implementation sessions.

Locked decisions from this session:

- Deploy target: static build output (default `dist/`) to S3-compatible storage.
- Most users are expected to use Vite-based static projects (including MPA).
- Git dirty tree behavior: soft fail (warning only).
- Missing git hash behavior: hard fail unless `--force`.
- Credential fallback includes named rclone remote, default `gxy-static`.

Canonical workflow moving forward:

- Read `docs/04-static-cli-spec-v0.3.md` first.
- Treat `docs/02-static-cli-spec-v0.2.md` as immutable baseline archive.
- Use `docs/03-engineering-backlog.md` as implementation task map.

Current implementation status:

- The shipped CLI currently implements `universe static deploy`, `universe static promote`, and `universe static rollback`.
- `docs/04-static-cli-spec-v0.3.md` also describes planned commands that are not shipped yet.
