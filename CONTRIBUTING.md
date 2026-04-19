# Contributing

Thanks for your interest in improving the Universe CLI.

## Development Setup

Prerequisites: Node 22+ (Node 24 pinned for CI — see `.nvmrc`) and pnpm 10+.

```sh
pnpm install
pnpm lint          # oxlint
pnpm test          # vitest run
pnpm tsc --noEmit  # typecheck
pnpm build         # tsup → dist/
```

A husky pre-commit hook runs `pnpm lint` and `pnpm test` on every commit.

See the [Flight Manual](docs/FLIGHT-MANUAL.md) for the full build, test, and credential setup runbook.

## Proposing Changes

1. Open an issue first for anything beyond a small fix so we can align on scope.
2. Fork the repository and create a topic branch.
3. Keep changes focused. Include tests for new behavior and update the docs that describe the affected surface (README, Staff Guide, or Flight Manual).
4. Run `pnpm lint`, `pnpm test`, and `pnpm tsc --noEmit` before opening a pull request.
5. Open a pull request against `main` and describe the change, the motivation, and any user-visible impact.

Commit messages should be imperative and scoped (for example, `deploy: skip hidden files during upload`).

## Releases

Releases are cut manually by maintainers via the GitHub `Release` workflow. See [RELEASING.md](docs/RELEASING.md) for the procedure.

## Security

Do not file public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the reporting channel.

## Code of Conduct

This project follows the [freeCodeCamp Code of Conduct](https://www.freecodecamp.org/news/code-of-conduct/). By participating you agree to uphold it.
