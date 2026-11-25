# Contributing to Notespace

Thank you for helping improve Notespace. Feedback, reproducible bug reports, documentation corrections and focused proposals are useful contributions.

## Before starting

- Read the [README](README.md), [code of conduct](CODE_OF_CONDUCT.md) and [license status](README.md#license-status). No general open-source license has yet been adopted; clarify permission with the maintainer before reusing code or submitting substantial code changes.
- Search [existing issues](https://github.com/howlil/notespace/issues) and [pull requests](https://github.com/howlil/notespace/pulls).
- For large features, public API changes, migrations, security boundaries or new dependencies, discuss the scope first. Small fixes can be proposed directly.
- Report security vulnerabilities using [SECURITY.md](SECURITY.md), not a public bug report.

## Development workflow

1. Follow [development setup](docs/DEVELOPMENT.md) and use a separate test library.
2. Branch from `master`. Keep one coherent change per PR.
3. Inspect the owning code and tests. Read the relevant [engineering contract](.agents/engineering.md), [architecture](docs/ARCHITECTURE.md), and [design rules](DESIGN.md) when applicable.
4. Implement the smallest change that preserves product and data contracts. Update the relevant docs alongside behavior changes.
5. Run the closest meaningful proof from [testing guidance](docs/TESTING.md). Docs-only changes require text, path, link and command review, not an unrelated full app build.
6. Open a pull request explaining the problem, scope, verification and remaining risks. Wait for required CI checks and maintainer review.

```sh
bun install --frozen-lockfile
task dev
# Example for frontend/backend code changes (not required for prose-only edits):
task check
```

## Pull request expectations

Use clear commit messages (for example `fix(canvas): preserve a pending draft`). Include before/after evidence for visual behavior, regression coverage for material bugs, and migration/rollback considerations for persistence changes. Do not include personal workspace data, secrets, generated binaries, or unrelated formatting changes.

AI-assisted contributions follow the same standard: contributors are responsible for understanding the diff, verifying behavior and disclosing material uncertainty. Do not paste model-generated output without review.

The maintainer decides scope and merge readiness. CI success is not release authorization. Publication and deployment follow the existing [release contract](docs/DESKTOP_FIRST_RELEASE.md).

For questions, see [Support](SUPPORT.md).
