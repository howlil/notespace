# Notespace — Code Patterns

This file contains repository-specific implementation conventions. It is not a generic frontend/Go skill or a duplicate of global SWE rules.

## Repository command surface

Use `Taskfile.yml` as the normal repo-level entrypoint:

```sh
task dev
task check
task build
task e2e
task verify
task up
task down
task logs
```

Use underlying `pnpm`, `go`, Playwright, or Docker commands when a narrower diagnostic/test loop is useful. Keep Taskfile as the canonical human/agent orchestration layer; do not add Turborepo or another task orchestrator without a concrete need.

## Project-centric naming

Use `Project` for the user/domain aggregate that owns both editing surfaces.

Avoid introducing independent top-level domain concepts such as `Note` or `Canvas` when the code means the Project-owned document/canvas state. Implementation names may refer to `document`, `canvas`, Tiptap, or Excalidraw inside their owned boundary.

## Web conventions

Current stack:

- React 18 + TypeScript;
- TanStack Start/Router in SPA-oriented deployment;
- Vite;
- Tailwind CSS 4;
- Tiptap StarterKit;
- Excalidraw;
- Radix Dialog primitives;
- Geist font assets served locally.

Patterns:

- keep route code focused on routing/loading/navigation rather than making routes the entire application architecture;
- keep Project behavior in Project/workspace/domain modules rather than generic UI components;
- isolate Tiptap and Excalidraw specifics behind focused integration components/adapters;
- prefer local state/logic until multiple real owners justify extraction;
- do not introduce a global store, generic service layer, or utility dump preemptively;
- preserve strict TypeScript boundaries; avoid widening editor payloads to `any` merely to bypass third-party types;
- lazy-load/editor-split large editor dependencies when the existing implementation does so; do not eagerly move them into the primary bundle without evidence.

For user-facing UI, preserve the current restrained design direction documented in `PROJECT.md`; reuse existing tokens/components before inventing a parallel visual system.

## Document snapshot pattern

The server contract currently stores a versioned snapshot:

```text
format: "tiptap"
version: 1
data: editor JSON
```

Rules:

- treat the persisted wrapper as Notespace-owned even when `data` is editor-native;
- evolve format/version deliberately;
- existing valid snapshots must remain readable across non-destructive feature evolution;
- stable product block IDs used for Milestone 2 must survive normal Tiptap normalization/editing and reload;
- do not use text, DOM position, or mutable editor position as durable relationship identity.

## Canvas snapshot pattern

The server contract currently stores:

```text
format: "excalidraw"
version: 1
data: { elements, appState, files }
```

Rules:

- keep Excalidraw-specific manipulation inside the canvas integration boundary;
- expose only product-required adapter capabilities;
- if product-owned reference metadata is carried by Excalidraw elements, keep Project relationship semantics outside renderer-native incidental identity;
- preserve scene round-trip behavior when changing workspace/container sizing or editor lifecycle.

## Autosave/concurrency pattern

Current behavior uses:

- immediate local editing state;
- serialized debounced saves;
- complete Project snapshot updates;
- optimistic server `version` guard;
- visible retry/error state;
- navigation flush where possible;
- unload warning while meaningful changes are unacknowledged.

Do not introduce parallel unsynchronized save paths. Any change to conflict/merge semantics is a material data/product decision.

## Go conventions

Current server ownership:

```text
apps/server/cmd/notespace        composition/startup
apps/server/internal/project     Project domain/service contract
apps/server/internal/httpapi     HTTP boundary
apps/server/internal/persistence SQLite implementation
apps/server/migrations           embedded schema migrations
```

Patterns:

- keep domain validation/invariants in `internal/project` when they are not transport/storage-specific;
- keep HTTP mapping/status/error handling in `internal/httpapi`;
- keep SQLite SQL/connection concerns in `internal/persistence`;
- use explicit SQL and embedded migrations rather than adding an ORM without a concrete requirement;
- keep the server CGO-free while `modernc.org/sqlite` remains the chosen persistence driver;
- wrap errors only when context materially improves diagnosis; preserve domain error semantics needed by the HTTP boundary;
- prefer small cohesive packages over generic `utils`/`common` packages.

## Persistence conventions

Current SQLite choices are intentional:

- pure-Go `modernc.org/sqlite`;
- one connection in the current implementation;
- WAL;
- FULL synchronous mode;
- embedded ordered migrations;
- optimistic Project version updates.

Do not change pragmas, connection model, schema ownership, or migration behavior as incidental cleanup. Changes need evidence tied to reliability/performance/feature requirements.

## Testing conventions

Use the narrowest layer that proves the behavior:

- Go package tests beside domain/HTTP/persistence/migration code;
- focused web/domain unit tests for pure behavior such as autosave;
- Playwright for cross-surface/browser behavior;
- Docker persistence smoke for final deployment composition and restart durability.

Prefer testing product behavior and boundaries over implementation trivia. Regression tests should remain near the layer that previously failed.

## Change discipline

For implementation work:

- reuse the current ownership pattern first;
- extend a cohesive existing module before adding a new abstraction;
- keep refactors local to what the change requires;
- remove dead code made obsolete by the change;
- do not mix unrelated renames/reorganization/dependency upgrades into a feature slice;
- record material architectural/product decisions in `DECISIONS.md`, not as long code comments or temporary planning files.
