# Notespace Testing and Verification

This document reflects the actual test layout, owners, commands, and CI gates in this repository.

The goal is one clear owner per behavior at the lowest layer that can prove it—not redundant test counts or regex-on-source checks.

## Ownership model

```text
web layer/module import & SDK boundaries
→ ESLint (`notespace/web-boundaries` + `no-restricted-globals` in `eslint.config.mjs`)

pure frontend rules, state machines, token contrast, injectable orchestration
→ colocated `node:test` under `apps/web/src/**/*.test.ts(x)`

Go capability/service rules & validation
→ Go package tests under `apps/server/internal/.../*_test.go` and `apps/server/tests/`

SQLite transactions, migrations, FTS search, concurrency, backup/restore
→ real temporary SQLite integration tests under `apps/server/internal/infra/sqlite/` and `apps/server/internal/infra/store/`

HTTP transport, status codes, If-Match, headers, desktop loopback security
→ Go tests under `apps/server/tests/httpapi/`, `apps/server/internal/httpapi/`, and `apps/server/internal/app/`

browser-only interaction, DOM/focus/race, CSP sandbox, multi-tab sync
→ WebdriverIO standalone journeys under `tests/e2e/`

Rust runtime readiness, shutdown, recovery, preview isolation
→ Rust `#[test]` under `apps/desktop/src-tauri/src/`

Windows WebView2 close/flush/sidecar lifecycle & relaunch durability
→ native desktop checks under `scripts/verify/`

CI lane planning, workflow YAML security invariants, release CLI/manifest logic
→ `scripts/verify/`, `scripts/release/`, `scripts/assets/` tests

container restart durability
→ Compose smoke (`scripts/verify/smoke-persistence.py`)
```

Do not write regex/`readFileSync` tests that mirror JSX markup, Tailwind classes, internal function names, or deleted-file tombstones. Enforce import and layer boundaries in `eslint.config.mjs`.

## Frontend unit tests

The frontend uses Node's built-in test runner (`--experimental-strip-types --test`) without jsdom or React Testing Library.

```sh
bun run test
# or one focused file:
task test:web TEST=apps/web/src/modules/canvas/objects/code-block/model/canvas-code-block-layout.test.ts
```

`scripts/verify/run-node-tests.mjs` discovers all `*.test.ts` and `*.test.tsx` files colocated under `apps/web/src/`.

Good fits for `node:test`:
- pure domain/model logic (`autosave`, `canvas-merge`, `canvas-conflict-retry`, `granular-save-core`, `note-store`, `note-markdown`, `diagram`, `routing`);
- serialization, export, and HTML preview CSP/escaping (`canvas-code-block-export`, `note-export`, `html-preview-frame`);
- HTTP/cache/runtime orchestration with injected fakes (`workspace-api`, `image-store-core`, `durability-barrier`, `desktop-quiescence`);
- mathematical WCAG AA contrast verification of CSS palette tokens (`apps/web/src/shared/styles/design-tokens.test.ts`).

Static checks:

```sh
bun run typecheck
bun run lint
```

## Go server tests

```sh
task check:server
# or inside apps/server:
node ../../scripts/verify/check-gofmt.mjs
go vet ./...
go test -race ./...
# focused package:
task test:server PACKAGE=./internal/infra/store
```

Real server binary process-lifecycle & durability integration proof:

```sh
bun run test:server:process
```

- `apps/server/internal/app/desktop/boundary_test.go` verifies runtime loopback security (DNS rebinding, Origin, Sec-Fetch-Site, non-loopback bind rejection, CSP/frame headers).
- `apps/server/internal/infra/sqlite/` and `apps/server/internal/infra/store/` use real temporary SQLite files for transactions, rollback atomicity, optimistic concurrency, migrations, FTS search, Trash, and ZIP backup/restore. Do not mock SQLite for persistence semantics.
- Markdown Note proof: `domain/document_test.go` (envelope, summary, backlinks), `domain/legacynote/convert_test.go` (rich → Markdown, loss guard), `infra/store/note_markdown_migration_test.go` (0033 conversion, rollback, backup import and rejection) and `infra/sqlite/migrations/note_markdown_assets_test.go` (assets survive the rewrite); `apps/web/src/modules/note-editor/model/note-markdown.test.ts` and `note-export.test.ts` cover tokens, toggles and export.
- `apps/server/tests/httpapi/` (and `apps/server/internal/httpapi/`) test HTTP decoding, `If-Match`, error codes, headers, and concurrency.

## Browser E2E — WebdriverIO standalone

Runner: `scripts/verify/browser-e2e.mjs` (WebdriverIO standalone + `node:test` against installed headless Chrome and an isolated Go/SQLite server per file).

```text
tests/e2e/
├── canvas/     Canvas authoring, toolbar, code/HTML preview, Note cards (Markdown editing, read view, embeds, images), persistence, recovery, peer sync
├── library/    Home/Explorer shell, category workflows, pagination, races, navigation, search, edge constraints
├── settings/   Settings/palette/backup modal lifecycle, Trash & ZIP restore
└── support/    harness.mjs, browser.mjs, server.mjs, proxy.mjs (fault injection), resolve.mjs
```

Commands:

```sh
bun run test:e2e                                  # builds @notespace/web, runs all browser suites
bun run test:e2e:smoke                            # existing build required; P0 + core create/nav/search
bun run test:e2e:critical                         # existing build required; legacy critical: set
bun run test:e2e:affected --changed-files paths.json
task e2e:smoke                                    # builds first, then runs risk smoke
task e2e:target SPEC=tests/e2e/library/search.e2e.mjs
node scripts/verify/browser-e2e.mjs --mode smoke --list   # inspect plan without starting fixtures
```

Policy & discovery:
- `scripts/verify/browser-proof-policy.mjs` maps every `tests/e2e/**/*.e2e.mjs` file to its risk tier (`P0` loss/security/recovery, `P1` functional, `P2` interaction/layout, `P3` cosmetic) and owner mapping for `--mode affected`.
- Unknown paths, unclassified suites, or dynamic test registrations conservatively fall back to the full suite.
- `scripts/verify/browser-discovery.test.mjs` verifies discovery, CLI validation, policy coverage, and configured script entrypoints.
- Each `.e2e.mjs` file spawns its own isolated server, SQLite file, fault proxy, and Chrome session; inject transport failures via `injectFault` instead of mocking the app or DB.

## Scripts, CI, and release policy tests

Run all script and policy tests directly:

```sh
node --test scripts/release/*.test.mjs scripts/assets/*.test.mjs scripts/verify/*.test.mjs
python scripts/verify/test-desktop-workflow-yaml.py
python scripts/verify/test-desktop-upgrade-inventory.py
```

- `scripts/verify/test-desktop-workflow-yaml.py` is the single parsed-YAML owner for `.github/workflows/*.yml` structure and security invariants (requires PyYAML).
- `scripts/verify/ci-plan.test.mjs` verifies CI lane classification and gate enforcement.
- `scripts/verify/check-desktop-webdriver-policy.test.mjs` verifies Tauri command ACL least-privilege parity (`lib.rs`, `build.rs`, `capabilities/*.json`) and Windows GUI subsystem flags.
- `scripts/release/*.test.mjs` verify SemVer/beta resolution, release-request admission, exact-master CI gate verification, updater manifests, and signing config preparation.

## Landing tests

```sh
bun run --cwd landing build
node --test landing/tests/*.test.mjs
```

Landing tests verify built Astro HTML, WebP screenshot integrity/dimensions/alt text, MSI download links, README self-host parity, static Wrangler config, and GitHub release asset filtering (`windows-release.test.mjs`). They stay independent of `apps/web/src` internals.

## Native desktop verification

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Full local desktop shell verification:

```sh
task desktop:check
```

Windows WebView2 native E2E (requires `tauri-driver` + matching EdgeDriver):

```sh
bun run test:desktop:native
bun run test:desktop:critical   # requires isolated NOTESPACE_DESKTOP_TEST_DATA_DIR
```

## CI lanes (`ci.yml`)

`.github/workflows/ci.yml` runs `classify` (`scripts/verify/ci-plan.mjs`) to select lanes:
- docs-only changes select no lanes;
- landing-only changes select `landing`;
- PRs run only owning lanes (`web`, `server`, `browser` affected+smoke, `landing`, `desktop`, `release-policy`, `compose`), falling back to all lanes for shared root config or unknown paths;
- `master` pushes run all lanes for any non-docs, non-landing change;
- scheduled/manual (`workflow_dispatch`) runs execute the full browser suite and extended desktop checks, reporting `regression / gate`;
- `ci / gate` aggregates every selected lane and is the required check for `master` and publishers (`assert-desktop-release-ci.mjs --collect`).

## Docker persistence smoke & performance evidence

- Compose durability smoke: `python3 scripts/verify/smoke-persistence.py --compose-restart` (runs in the `compose` CI lane).
- Explicit scale measurements (not part of default unit tests):

```sh
task perf:evidence
```

## Local verification ladder

| Change area | First proof | Escalate when |
| --- | --- | --- |
| Docs only | Review changed paths/commands | Executable contract also changed |
| Web import/layer boundary | `bun run lint` | Shared ESLint boundary rule changed |
| Web logic/model/adapter | Focused `task test:web TEST=...` | DOM/browser lifecycle/race → `task e2e:target SPEC=...` |
| Go capability/HTTP/SQLite | `task test:server PACKAGE=...` | Concurrency/tx/process → `task check:server`, `bun run test:server:process` |
| Rust runtime | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | Close/flush/WebView2 → `task desktop:check` / Windows native acceptance |
| CI/release scripts or workflows | `node --test scripts/.../*.test.mjs` + `test-desktop-workflow-yaml.py` | Actual GitHub Actions behavior on PR/master |
