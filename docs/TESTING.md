# Notespace Testing and Verification

This document describes the current testing strategy and CI behavior.

The goal is not maximum test count. The goal is to give each meaningful behavior one clear owner and to catch regressions at the lowest boundary that can explain the failure.

## Test ownership model

```text
pure business rule / state transition
→ Node or Go domain/service test

frontend orchestration with injectable side effects
→ node:test

SQLite transaction / query / concurrency invariant
→ real SQLite integration test

HTTP decoding / status / headers
→ Go httpapi contract test

browser-only interaction / race
→ WebdriverIO journey

critical cross-system journey
→ critical WebdriverIO journey

runtime persistence
→ Docker restart smoke
```

Do not create one test per source file.

A test is justified when it protects a business rule, state transition, failure boundary, transaction invariant, transport contract, browser behavior, or regression that would otherwise be hard to localize.

## Frontend unit tests

The frontend deliberately uses Node's built-in test runner instead of a jsdom/React Testing Library stack.

Root command:

```sh
bun run test
```

The test runner discovers `*.test.ts` and `*.test.tsx` files under the application and repository test surfaces.

Use `node:test` for:

- pure domain rules;
- serialization/HTTP adapter contracts through injected transports;
- orchestration cores with injected dependencies;
- cache/event primitives that can be exercised without mounting React;
- third-party compatibility adapters that can be represented with small fakes.

Current examples include:

- Workspace autosave and conflict rules;
- Canvas merge and scene transformations;
- Workspace naming and pagination rules;
- `granular-save-core` Canvas conflict/rebase orchestration;
- image-store remote/local fallback and concurrent-load deduplication;
- image HTTP contract and Workspace-scoped cache behavior;
- Canvas image persistence, cache eviction and legacy fallback;
- Quick Open route mapping;
- browser conflict/library-change event adapters;
- Excalidraw native action compatibility.

### Why orchestration cores exist

React hooks/components should not be split solely to make tests easy.

Extract a small core when the logic has an independent failure model.

Example:

```text
React hook
  ↓
flush registered Canvas asset writes
  ↓
durable asset store
```

The core can prove:

- accepted storage → authored Canvas reference may be committed;
- ownership rejection → no broken durable reference;
- storage error → error is surfaced.

React remains responsible for wiring the result into the editor.

The same pattern is used for Workspace save conflict handling and Canvas asset persistence.

## Go tests

Run all server checks with:

```sh
task check:server
```

or directly inside `apps/server`:

```sh
node ../../scripts/verify/check-gofmt.mjs
go vet ./...
go test -race ./...
```

The real server-process integration proof runs the built Go binary against a temporary SQLite database, waits for the
readiness handshake, exercises Workspace/Canvas HTTP mutations, shuts the process down through its parent-lifecycle
stdin protocol, relaunches it with the same database, and verifies durable state:

```sh
bun run test:server:process
```

This is intentionally separate from package tests because it proves command wiring, process lifecycle, HTTP routing, and
SQLite durability together. It uses observable readiness/process-exit signals rather than arbitrary sleeps.

### Application/service tests

Application packages use small behavioral fakes for their consumer-owned ports.

Examples:

- Workspace validation, granular Canvas service behavior, aggregate compatibility updates;
- planning Task/Milestone transitions and global Task operations;
- activity recording/query normalization and reference resolution;
- asset validation and ownership checks;
- icon validation/cache/concurrent fetch behavior.

Do not build fake databases for persistence semantics.

### SQLite tests

Use a real temporary SQLite database for:

- transactions;
- foreign keys;
- optimistic concurrency;
- Canvas versioning and legacy compatibility migration;
- planning position concurrency and cardinality;
- Today/Inbox projections;
- asset lifecycle;
- FTS/search repair;
- Trash atomicity;
- backup/restore rollback;
- migration compatibility;
- database integrity.

These tests own SQLite-specific behavior; service tests should not duplicate it through mocks.

### HTTP contract tests

`internal/httpapi` tests own:

- request decoding;
- query/path/header semantics;
- `If-Match`;
- response status and error codes;
- security/cache headers;
- planning and backup transport;
- icon transport;
- same-origin mutation behavior;
- request observability.

They should use representative invalid domain input, not repeat every domain validation permutation.

## Browser E2E — WebdriverIO standalone

There is one browser runner: `scripts/verify/browser-e2e.mjs`. It is WebdriverIO standalone plus Node's built-in test runner against headless installed Chrome and a real isolated Go/SQLite server. No Mocha/Cucumber runner, no Playwright, no downloaded browser bundle.

Suites are grouped by capability and discovered recursively. `tests/browser-discovery.test.ts` protects discovery and configured script entrypoints; `tests/architecture-boundaries.test.ts` protects web feature entries and the lazy Canvas boundary. Go architecture checks cover private handler/query packages and transaction ownership. Aggregate SQLite rollback/restore proofs stay with Store.

```sh
bun run test:e2e            # build the web app, then every browser journey
bun run test:e2e:critical   # existing build required; legacy `critical:` set
bun run test:e2e:smoke      # existing build required; P0 + core create/navigation/search
bun run test:e2e:affected --changed-files paths.json  # JSON array of repo-relative old/new paths
task e2e:smoke              # builds first, then risk smoke (same set as the PR gate)
task e2e:target SPEC=tests/e2e/library/search.e2e.mjs # builds first, then one journey file
node scripts/verify/browser-e2e.mjs --mode smoke --list # inspect without starting fixtures
node scripts/verify/browser-e2e.mjs --file tests/e2e/library/search.e2e.mjs   # one journey file
```

### Suite structure

```text
tests/e2e/
├── canvas/, library/, settings/, compatibility/   owned *.e2e.mjs journeys
└── support/
    ├── harness.mjs     UI/API helpers and scoped fixture lifetime
    ├── browser.mjs     Chrome session
    ├── server.mjs      isolated Go/SQLite process
    ├── proxy.mjs       transport fault injection (503, 409, abort, hold)
    └── resolve.mjs     in-page role/name resolution
```

Rules for this suite:

- each file starts its own Go server on an ephemeral port with its own SQLite file, so files are independent and run concurrently;
- the browser talks to a local proxy in front of the real server; failures are injected there (`injectFault`), never by mocking the application or the database;
- assertions read either the real DOM or the real HTTP API, so a simulated transport failure cannot hide durable state;
- journeys are independent: no ordering dependency between files or tests;
- `critical:` remains the legacy Verify set during #200 migration; the new PR ci lane uses affected + risk smoke.
- `browser-proof-policy.mjs` maps every discovered case to its suite property/risk, with case-specific security/recovery overrides. P0 is loss/security/recovery, P1 functional, P2 interaction/layout, P3 cosmetic-only. Smoke includes all P0 cases and core creation/navigation/search; affected unions whole affected suites with that smoke floor. Full retains every case.
- Shared/unknown changed paths, unclassified suites and unsupported/dynamic case registrations fall back to the full run rather than disappearing. Invalid paths/options, missing inputs, empty suites and empty selections fail. Supply both old/new paths for renames; complete diff collection belongs to the CI classifier.
- `--file` still runs one complete suite within `tests/e2e`; `--list` validates/prints full, smoke, affected, master (legacy critical plus all P0 smoke) or legacy plans without acquiring browser/server resources.

Coverage includes canonical Home/category/Workspace navigation, Library/first-run shell, Canvas authoring (flowchart spawn, bounded code execution, undo-safe output, PNG/SVG code-block export, opt-in isolated HTML preview, embeds), workspace/category search and Quick Open, Settings and backup lifecycle, pagination snapshots, category races, Library recovery, Canvas peer sync across tabs, and the retired Capture/Plan/Today/Inbox data boundaries that must stay readable while their UI stays gone. Isolated HTML preview behavior and adversarial sandbox containment are proved in Chromium by `tests/e2e/canvas/workspace-html-preview.e2e.mjs` and in native Windows WebView2 by `scripts/verify/desktop-webdriver-smoke.mjs`. Standalone Note routes remain absent; Canvas-native Note cards are covered by `tests/e2e/canvas/canvas-note.e2e.mjs`.

Only admit new browser tests for behavior that cannot be proven at a cheaper boundary. Prefer Node unit, HTTP integration and SQLite tests for ordinary rules, CRUD and failure cases. Avoid arbitrary waits; wait on observable state.

Removed with the Playwright migration, because the UI they asserted no longer exists: pane split/focus-mode/view-switcher geometry (`workspace/layout`, `workspace/m5-visual-acceptance`), the retired Activity dock popup ownership (`popup-behavior`, `study-history`), and Excalidraw-native chrome details (type-conversion popup, third-party "More tools" labels). Their Notespace-owned behaviors are covered by the Canvas, shell and Activity-retirement journeys.

## Native desktop verification

The Tauri shell keeps the web application as the product-behavior owner. Native checks cover only WebView and
sidecar-specific risks:

```sh
bun run build
node scripts/dev/prepare-desktop-sidecar.mjs
bun run test:desktop:lifecycle
cargo tauri build --debug --no-bundle -- --locked
bun run test:desktop:native
```

`test:desktop:native` requires `tauri-driver` and the matching Edge WebDriver on Windows. Its WebView2 capability sets
an explicit user-data folder so the launch/relaunch persistence assertion uses the same profile. The production shell
uses the stable Tauri `dataDirectory`; WebdriverIO owns every browser journey, including multi-tab Canvas peer sync.

The release lane also runs `bun run test:desktop:critical` against the release executable. This journey creates a
Workspace through the UI, edits the Canvas while a save is active, closes the native
window, relaunches the same executable, and verifies the latest authored data from the same SQLite data directory.
The critical command requires an isolated
`NOTESPACE_DESKTOP_TEST_DATA_DIR`; the desktop runtime uses that path only when the test environment provides it.
The critical runner uses the Canvas save boundary so the close journey can deterministically exercise an in-flight
Canvas save without synchronizing on arbitrary sleeps.

Windows release verification builds the MSI bundle with:

```sh
cargo tauri build -- --locked
```

## Browser and desktop CI

### Pull requests and `master`

`ci.yml` is the only PR/master workflow. Its `classify` job selects lanes from the changed paths with `scripts/verify/ci-plan.mjs`:

- docs-only changes select no lanes;
- landing-only changes select the `landing` lane;
- any other PR change selects `web`, `server`, `browser` (affected proof), and `compose`;
- native-relevant paths (desktop, release, workflows, Taskfile, `package.json`, the lockfile, and `docs/DESKTOP_BETA_RELEASE_*.md`) also select `desktop` and `release-policy`;
- an unreadable or empty PR diff, and every master, scheduled, or manual run, selects every lane.

`ci / gate` runs with `always()` and fails when any selected lane did not succeed, or when an unselected lane failed. Master branch protection requires only `ci / gate`. Publishers require the current-master push `ci` run and its exact-attempt successful gate; neither regression nor legacy names are authority. Exercise the read-only preflight without publishing: `GITHUB_REPOSITORY=howlil/notespace node scripts/release/assert-desktop-release-ci.mjs --collect <full-current-master-SHA>`.

Master pushes run every lane: full Node/web, Go unit/integration/race (including real SQLite migration/restore), landing, native Windows 2022, and Compose restart/readback. Browser master proof is the exact union of legacy critical and P0 smoke (**31 cases**). Browser PR proof runs the affected suites plus the P0 smoke floor; an unknown changed path falls back to the full inventory.

Scheduled and manual runs (`workflow_dispatch`, daily 03:17 UTC) run the full browser inventory and extended desktop checks. They report `regression / gate`, separate from required `ci / gate`, and have event-isolated concurrency so they cannot cancel master proof. Trigger manually with `gh workflow run ci.yml --ref master`; this performs verification only, never publication.

`verify-desktop.yml` is a reusable workflow called by `ci.yml` only. It has no triggers of its own. Its `check-desktop` job runs the deterministic policy and YAML checks on Linux. `check-desktop-windows` runs one critical native navigation, pending-save close, and SQLite shutdown/relaunch journey on Windows Server 2022. Extended Windows-latest builds run only for regression and master. Windows native caches restore on PRs and save only after a successful master proof.

Focused policy proof: `node --test scripts/verify/ci-plan.test.mjs` (lane matrices and gate rules). Parsed workflow contract: `python scripts/verify/test-desktop-workflow-yaml.py` with the pinned PyYAML tooling.

The retired `verify.yml` and `verify-landing-build.yml` workflows are gone; `ci.yml` covers their checks.

## Local verification ladder

The operating loop lives in `AGENTS.md`; this section owns command selection.
Start with the nearest existing proof that can observe the risk. These are escalation
options, not a mandatory sequence of every test layer:

| Change boundary | First faithful proof | Escalate when |
| --- | --- | --- |
| Documentation/instructions only | Inspect changed text, links, referenced paths/commands and applicable existing contracts | A documented executable boundary also changes; no local product build/full suite just for prose |
| Web pure rule/orchestration | Existing colocated Node test; relevant type/lint/architecture check | DOM/focus/rendered geometry or real transport/persistence cannot be proved there: use the affected existing browser journey |
| Go capability/validation | Existing package test | SQL/transaction/restore changes need real SQLite; concurrency needs race proof; process durability needs restart/readback |
| Rust readiness/runtime rule | Filter the existing Rust tests for that module | Host/process/close/flush/security behavior requires matching runtime/PE/lifecycle and actual Windows native acceptance; a unit test is not that proof |
| CI/release policy | Existing classifier/request/CLI and parsed workflow policy tests | Trigger/SHA/skip/permission/concurrency changes require real GitHub behavior; publication still needs separate authorization |

Unrelated edits do not invalidate already observed proof. Rerun what the diff affects;
keep the authoritative required CI gates and conservative unknown-impact fallback.
Full/manual regression and release-artifact acceptance are separate stages, not
per-iteration defaults. Do not add tests that lint Issues or documentation formatting.

Useful commands (run from repository root unless shown otherwise):

```sh
# one frontend test file
task test:web TEST=apps/web/src/features/workspace-authoring/canvas/code/canvas-code-block-layout.test.ts

# one Go package (task includes race; plain package test is also available)
task test:server PACKAGE=./internal/activity
(cd apps/server && go test ./internal/activity)

# one Rust module's existing tests; does not launch the app/native journey
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked runtime::readiness::tests

# all frontend/backend static + unit/integration checks
task check

# production builds
task build

# full local release verification
task verify
```

`task verify` builds production artifacts, runs frontend/server checks, and runs the PR browser smoke set. It does not authorize publication or replace signed MSI/installed-upgrade/release-binary native acceptance.

## Docker persistence smoke

CI starts the real Compose stack and runs:

```text
create durable state
→ restart container
→ read durable state back
```

This protects the deployment-level invariant that SQLite data survives an application restart with the configured persistent volume.

It is not a substitute for transaction-level SQLite tests.

## Performance evidence

Scale/performance evidence is explicit rather than part of every inner-loop test.

```sh
task perf:evidence
```

This currently includes focused frontend evidence plus SQLite persistence scale evidence gated behind `NOTESPACE_SCALE_EVIDENCE=1`.

Use performance tests for a concrete performance question; do not turn the default test suite into a benchmark suite.

## Bug-fix workflow

For a regression:

```text
find the lowest owner
→ add or identify a failing behavioral test
→ confirm the failure mechanism
→ make the smallest fix
→ run the nearest test
→ escalate verification according to blast radius
```

Examples:

```text
Workspace navigation loses a pending Canvas edit
→ route loader freshness, autosave boundary, and critical WebdriverIO re-entry proof

Workspace delete ID whitespace bug
→ activity service query test

stale Library category response overwrites current view
→ request-generation fix + browser race regression

asset rejected after Workspace ownership disappears
→ asset orchestration unit test
```

## What not to do

Do not:

- require one test per file/function;
- add React testing infrastructure only to chase coverage percentage;
- mock SQLite for transaction behavior;
- duplicate every domain invalid case at both HTTP and browser layers;
- snapshot large objects when a behavioral assertion is clearer;
- rely on sleeps for correctness when a deterministic signal can be used;
- mark every browser journey `critical:`;
- keep adding tests after the relevant risk has one clear owner and evidence.

Stop when the behavior is protected at the correct boundary and the relevant gates are green.
