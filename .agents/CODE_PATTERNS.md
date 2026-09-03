# Notespace — Code Patterns

This file contains repository-specific implementation conventions. It is not a generic SWE handbook.

## Repository command surface

Use `Taskfile.yml` as the normal repo-level entrypoint:

```sh
task dev
task check
task check:web
task check:server
task test:web TEST=path/to/test.ts
task test:server PACKAGE=./internal/httpapi
task build
task verify
task up
task down
task logs
```

Use the narrowest deterministic command that proves the changed boundary first. Use broader automated gates only when the behavior/risk crosses those boundaries. Do not add Turborepo or another orchestration layer without measured need.

## Product naming

User-facing model is:

`Category → Workspace → Notes / Canvas`

Rules:

- use `Category`, `Workspace`, `Note`, and `Canvas` in new UI copy and product-facing code where the user model is intended;
- existing `Project`, `/api/projects`, `internal/project`, and related storage names are compatibility implementation detail;
- do not perform a broad internal rename merely for cosmetic consistency unless explicitly requested;
- do not reintroduce “Project” into user-facing UI because legacy code uses that term.

## Web stack and ownership

Current stack:

- React + TypeScript;
- TanStack Start/Router;
- Vite;
- Tailwind CSS 4 plus repository CSS tokens;
- Tiptap;
- Excalidraw;
- Radix primitives where behavior-heavy accessible components are needed;
- Geist font assets served locally.

Patterns:

- keep routes focused on loading/navigation rather than making them application architecture;
- keep workspace/product behavior in domain/feature owners rather than generic UI components;
- isolate Tiptap and Excalidraw specifics behind adapters/integration components;
- prefer local state until multiple real owners justify extraction;
- avoid preemptive global stores, generic service layers, and `utils` dumps;
- preserve strict TypeScript boundaries; do not widen editor payloads to `any` to silence third-party types;
- preserve lazy loading/code splitting for large editor dependencies where present.

## UI implementation

Root `DESIGN.md` is the visual/interaction contract.

Implementation rules:

- start from product hierarchy and interaction state, not from decorative components;
- reuse current tokens/components/primitives before adding parallel styling systems;
- prefer Radix behavior primitives when they solve an existing accessibility/state-management problem;
- keep density compact and surfaces restrained;
- do not add card wrappers, modal flows, gradients, glow, glass, bento, or animation without a hierarchy/interaction reason;
- do not remove visible keyboard focus merely to make the UI look cleaner;
- for simple create/rename flows, prefer seamless inline interaction when it matches the current pattern;
- preserve accessible names and keyboard reachability for interactive controls;
- keep Home/library chrome out of the Workspace focus surface.

## Workspace snapshots

The server stores versioned authored workspace state. Existing project-named structures may wrap:

- workspace identity/metadata/version;
- notes/document snapshots using Tiptap data;
- Excalidraw canvas snapshot;
- split/layout state;
- Notespace-owned relationships.

Rules:

- persisted wrappers remain Notespace-owned even when editor-native payloads live inside;
- evolve format/version deliberately and preserve readable valid legacy snapshots;
- stable product IDs used for relationships must survive ordinary editor normalization/editing/reload;
- visible text, DOM positions, mutable editor positions, and canvas coordinates are not durable relationship identity.

## Autosave and concurrency

Current behavior uses:

- immediate local authored state;
- serialized/debounced saves;
- complete workspace/project snapshot updates;
- optimistic server version guard;
- visible retry/error state;
- navigation flush where possible;
- unload warning while meaningful changes remain unacknowledged.

Do not create parallel unsynchronized save paths. Any change to merge/conflict semantics is material.

## Go ownership

Current server boundaries:

```text
apps/server/cmd/notespace        composition/startup
apps/server/internal/project     workspace/category domain compatibility owner
apps/server/internal/httpapi     HTTP mapping/boundary
apps/server/internal/persistence SQLite implementation
apps/server/internal/study       study activity domain
apps/server/migrations           embedded schema migrations
```

Patterns:

- domain invariants belong in the owning domain package when not transport/storage-specific;
- HTTP mapping/status/error translation belongs in `internal/httpapi`;
- SQL/connection concerns belong in `internal/persistence`;
- use explicit SQL/embedded migrations rather than adding an ORM without a concrete requirement;
- preserve CGO-free server while `modernc.org/sqlite` remains the chosen driver;
- prefer small cohesive packages over generic `common`/`utils` packages;
- wrap errors only when context materially improves diagnosis and preserve domain error semantics used by the HTTP boundary.

## Persistence

Current SQLite choices are intentional:

- pure-Go `modernc.org/sqlite`;
- one connection in the current implementation;
- WAL;
- FULL synchronous mode;
- embedded ordered migrations;
- optimistic version updates;
- stable Compose volume ownership.

Do not change pragmas, connection model, migration ownership, conflict semantics, or data-volume behavior as incidental cleanup.

## Testing

Use the narrowest automated layer that proves behavior:

- focused web/domain unit tests for pure logic;
- Go package tests for domain/HTTP/persistence/migrations;
- deterministic component/integration tests for cross-owner interaction semantics where isolated tests are insufficient;
- Docker restart smoke for deployment/persistence composition only.

Manual acceptance testing, live-browser/black-box testing, and manual screenshot review are not required merge or release gates. UI/design tests should assert stable product contracts, not exact CSS implementation or pixel snapshots.

When an environment-specific behavior cannot be reproduced deterministically, document the residual risk rather than introducing a human/browser acceptance requirement.

## Change discipline

- reuse the current owner first;
- extend a cohesive module before adding a new abstraction;
- keep refactors local to the requested change;
- remove dead code made obsolete by the change;
- avoid unrelated renames/reorganization/dependency upgrades;
- keep explicitly requested CI/reliability/knowledge cleanup classified as engineering work, not a fake product slice;
- update `CURRENT_ITERATION.md` with concise current evidence, not historical diaries;
- integrate coherent logical changes after relevant automated gates pass.
