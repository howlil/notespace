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
→ Playwright

critical cross-system journey
→ critical Playwright

runtime persistence
→ Docker restart smoke
```

Do not create one test per source file.

A test is justified when it protects a business rule, state transition, failure boundary, transaction invariant, transport contract, browser behavior, or regression that would otherwise be hard to localize.

## Frontend unit tests

The frontend deliberately uses Node's built-in test runner instead of a jsdom/React Testing Library stack.

Root command:

```sh
pnpm test
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
- planning Today/Inbox projection membership;
- `save-workspace-core` conflict/rebase orchestration;
- image-store remote/local fallback and concurrent-load deduplication;
- image HTTP contract and Workspace-scoped cache behavior;
- document/Canvas durable image boundaries;
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
prepareDocumentImage(...)
  ↓
durable asset store
```

The core can prove:

- accepted storage → authored node may be committed;
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
node ../../scripts/check-gofmt.mjs
go vet ./...
go test -race ./...
```

### Application/service tests

Application packages use small behavioral fakes for their consumer-owned ports.

Examples:

- Workspace validation, granular Note/Canvas service behavior, aggregate compatibility updates;
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
- Note/Canvas versioning;
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

## Playwright

Playwright owns real browser behavior and cross-system wiring.

Run the full suite:

```sh
task e2e
```

Run critical journeys only:

```sh
task e2e:critical
```

Run one spec:

```sh
task e2e:target SPEC=tests/today.spec.ts
```

Current browser coverage includes:

- route/reload/navigation behavior;
- Workspace authoring;
- planning, Today, and Inbox;
- global search and exact context navigation;
- activity session recovery/cross-tab behavior;
- Trash recovery;
- full-library backup/restore;
- Canvas toolbar behavior;
- Library request race protection;
- carried-forward Today removal.

### When to use Playwright

Prefer Playwright when correctness depends on:

- browser event ordering;
- real routing;
- DOM focus/keyboard/pointer behavior;
- multiple tabs;
- BroadcastChannel;
- browser file/directory APIs;
- a race between network responses and UI selection;
- complete frontend → HTTP → SQLite wiring.

Do not use Playwright to enumerate pure domain edge cases.

## Critical versus full browser suite

The CI lanes are intentionally different.

### Pull request

Every pull request runs:

```text
web production build
→ TypeScript typecheck
→ lint
→ Node tests
→ gofmt / go vet / go test -race / Go build
→ critical Playwright journeys
→ Docker Compose validation
→ container build + health
→ persistence restart smoke
```

Critical Playwright tests are selected with the `@critical` marker.

A browser regression should be marked critical when it protects a high-value cross-system flow that should block a merge.

### Push to `master`

A push to the default branch runs the same static/server/runtime gates, but runs the **full Playwright suite** instead of the critical-only subset.

This catches broader browser regressions after merge while keeping pull-request browser work focused.

## Local verification ladder

Start narrow.

```text
changed behavior
  ↓
nearest focused test
  ↓
affected package/module checks
  ↓
static checks
  ↓
affected browser/integration boundary
  ↓
full verification when release confidence is required
```

Useful commands:

```sh
# one frontend test file
task test:web TEST=apps/web/src/features/library/save-workspace.test.ts

# one Go package
task test:server PACKAGE=./internal/activity

# all frontend/backend static + unit/integration checks
task check

# production builds
task build

# full local release verification
task verify
```

`task verify` builds production artifacts, runs frontend/server checks, and runs the full Playwright suite.

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
carried-forward task cannot leave Today
→ planning projection/action boundary + Playwright regression

Workspace delete ID whitespace bug
→ activity service query test

stale Library category response overwrites current view
→ request-generation fix + Playwright race regression

asset rejected after Workspace ownership disappears
→ asset orchestration unit test
```

## What not to do

Do not:

- require one test per file/function;
- add React testing infrastructure only to chase coverage percentage;
- mock SQLite for transaction behavior;
- duplicate every domain invalid case at HTTP and Playwright layers;
- snapshot large objects when a behavioral assertion is clearer;
- rely on sleeps for correctness when a deterministic signal can be used;
- mark every browser test `@critical`;
- keep adding tests after the relevant risk has one clear owner and evidence.

Stop when the behavior is protected at the correct boundary and the relevant gates are green.
