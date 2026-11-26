# Notespace Architecture

This document describes the current implementation. It is a map of the codebase, runtime boundaries, and data ownership—not a future roadmap.

For repository-local implementation rules, see [`.agents/engineering.md`](../.agents/engineering.md).

## System shape

Notespace is a single-owner, self-hosted application:

```text
Browser
  ↓
React / TanStack Start SPA
  ↓
Notespace modules + entities
  ↓
platform clients
  ↓
Go net/http API
  ↓
application services
  ↓
SQLite adapter
  ↓
one SQLite database
```

Canonical user-owned state lives in SQLite. Browser storage is used for local UI preferences and image compatibility caching; it is not the durable source of truth for authored Workspace content.

The production container serves both the built SPA and the API from one Go process.

## Product model

The main user-facing model is:

```text
Home / Category Explorer
└── Workspace
    ├── Canvas
    ├── durable image assets
    └── Canvas conflict recovery and durable images

Settings
└── Data & backup (portable export, import, Trash, native backups)
```

The former Capture, Task, Milestone, Activity, legacy Notes and History domains are retired. Migration `0031_contract_retired_domains.sql` removes their schema objects; legacy backup decoding is distinct from current authored state. These capabilities no longer have active HTTP routes or UI owners.

A Workspace is the main spatial unit and Canvas is the authoring surface. Canvas Notes have separate canonical content and placement identities. Assets, Trash, backup/restore and workspace search are separate capabilities around authored state.

## Repository map

```text
apps/
├── web/src/
│   ├── routes/              URL boundary
│   ├── app/                 page, shell, Quick Open and Settings composition
│   ├── modules/             capability-owned workflows: library, workspace, canvas, note-editor
│   ├── platform/            HTTP clients, assets, desktop IPC, runtime barriers
│   ├── entities/            pure Workspace and Note rules
│   └── shared/              reusable foundations
├── server/
│   ├── cmd/notespace/        process entrypoint
│   ├── internal/             strict 4-tier architecture
│   │   ├── app/              Tier 1: composition root, config, auth, SPA web, desktop/
│   │   ├── httpapi/          Tier 2: router facade + middleware/, transport/, handler/
│   │   ├── domain/           Tier 3: pure models, apperr/, archive/, icon contract, parsers
│   │   └── infra/            Tier 4: sqlite/ (+ migrations/sql/), store/ (+ paging/), eraser/
│   └── tests/                AST architecture guard + black-box httpapi/ integration suite
└── desktop/src-tauri/src/
    ├── lib.rs               Tauri assembly and command registration
    ├── runtime.rs           crate-private runtime facade
    ├── runtime/             state, sidecar, readiness, shutdown
    └── window.rs recovery.rs updates.rs diagnostics.rs

tests/e2e/                   canvas, library, settings, support
scripts/                     dev, verify, release, assets
```

The web and server are both capability-oriented. Notespace deliberately avoids generic application-wide `controllers/services/repositories` folders.

## Web architecture

### Routes

`apps/web/src/routes` owns URL parsing, route loading, redirects, and page selection. Routed surfaces are Home / Library and Workspace. Routes do not own editor workflows or mutation orchestration.

### App

`apps/web/src/app` composes pages (`pages/home`, `pages/workspace`), the persistent shell (`shell/PersistentAppShell.tsx` is the only mount of `LibraryPageShell`), Settings and Quick Open from modules. Product logic stays in the owning module or entity.

### Modules

```text
modules/
├── library/         collection, explorer, backup
├── workspace/       session, save orchestration, authoring composition
├── canvas/          core (Excalidraw orchestrator), chrome, objects, selection
└── note-editor/     Markdown editor, read view, SVG export, Note store
```

Outside callers use a module's `index.ts`; internals import each other directly. `workspace` may use `canvas` and `note-editor`, and `canvas` may use `note-editor`; other modules compose in `app`. CanvasEditor stays lazy and the Explorer provider stays mounted at the root across route changes.

Important orchestration boundaries:

- `modules/workspace/model/granular-save-core.ts` — Canvas conflict/rebase behavior for the active save path;
- `modules/canvas/core/assets/canvas-assets.ts` — durable Canvas-image persistence boundary.

These exist so behavior with meaningful failure modes can be tested without mounting the React tree.

### Notes

A Note is Markdown text in `{ type: "markdown", text }` and nothing else. `modules/note-editor` holds one CodeMirror editor for it and one token model, `model/note-markdown.ts`, that lexes the text with marked and feeds both the React read view and the SVG export. The read view never mounts an editor, builds React elements instead of HTML strings (KaTeX output is the only injected markup), and re-lexes only when the text changes. The same text drives the label, search text, excerpt and backlinks on the server. The Markdown conventions are listed in the [user guide](USER_GUIDE.md#writing-in-markdown); the format decision is `K8` in [`.agents/engineering.md`](../.agents/engineering.md).

### Entities

`apps/web/src/entities` holds framework-independent rules: Workspace and Canvas shapes, and Note rules such as the Canvas reference, derived label, link and asset-source safety. Entities must not depend on React, browser APIs or HTTP. Pure rules inside modules live in `model/` folders under the same restriction.

### Platform

```text
platform/
├── api/        typed HTTP clients and library invalidation
├── assets/     image normalization, durable API, local cache, image-store facade
├── desktop/    native chrome, lifecycle, recovery, updates
└── runtime/    quiescence and durability barriers, external links
```

The frontend has no planning, activity or capture client. Platform code never imports modules.

Asset handling splits responsibility between:

```text
image normalization
      ↓
remote durable API
      ↓
local compatibility cache
      ↓
image-store orchestration facade
```

The server is the durable owner of image assets. IndexedDB is a compatibility/read-through cache. Memory uses a 32 MiB/64-entry LRU. Disk maintenance targets 128 MiB but preserves unconfirmed legacy copies until migration upload succeeds. Permanent deletion and successful library restore invalidate the corresponding cache. An asset rejected because Workspace ownership disappeared is not treated as persisted, and authored Canvas references are only committed after durable storage succeeds.

## Authoring and consistency

### Granular Canvas persistence

Primary authoring uses resource-specific writes:

```text
Canvas edit
  ↓
Canvas autosave queue
  ↓
PATCH Canvas with Canvas version
  ↓
SQLite transaction
```

Canvas has its own optimistic version and Excalidraw-specific element reconciliation.

The original standalone Note model was retired by migrations `0025_remove_notes.sql` and `0026_scrub_retired_note_artifacts.sql`. Current Canvas Notes are a distinct canonical capability introduced by `0027_canvas_notes.sql` and extended by subsequent migrations through `0034_note_markdown_assets.sql`; `0033_note_markdown_only.sql` converts every earlier rich Note to Markdown in one transaction and keeps each original in `canvas_note_legacy_documents`. Note content and placement identities are saved independently from Canvas geometry; current note APIs and library backup records are not the retired standalone Note contract. Historical migration checksums remain supported.

### Granular save conflict recovery

The legacy aggregate Workspace HTTP save path is retired.
Current authoring uses the granular Canvas save path. Its active
orchestration lives in `modules/workspace/model/granular-save-core.ts`:

```text
save candidate
  ↓
409 conflict?
  ├── no  → accept durable result
  └── yes
       ↓
     fetch latest
       ├── candidate already converged → accept latest
       ├── independent changes + known base → three-way rebase → retry
       ├── Canvas-only independent changes → merge Canvas → retry
       └── true same-field conflict → stop + publish recovery draft
```

Retries use the latest server version. After three unresolved conflicts the save stops and exposes the recovery path instead of overwriting remote state.

### Same-browser Canvas synchronization

Two tabs viewing the same Workspace use `BroadcastChannel` for Canvas element changes.

This path:

- is browser-local;
- is separate from server autosave;
- reconciles Excalidraw element versions;
- does not make Notespace a cross-device multiplayer or CRDT application.

Pan/zoom remain per-tab view state and are not authored Canvas state.

## Library request ownership

Library category/all-workspace pages use request generations so an older async response cannot overwrite a newer user selection.

```text
request A starts
user selects B
request B starts
request B commits
request A finishes later
→ ignored because A no longer owns the page generation
```

This is a frontend consistency rule, not a backend caching mechanism.

## Server architecture

The server enforces a strict 4-tier one-way DAG (`app` → `httpapi` → `domain` / `infra`):

```text
cmd/notespace
    ↓
Tier 1: internal/app (+ desktop/)
    ├──→ Tier 2: internal/httpapi (router.go)
    │       ├──→ httpapi/middleware ──→ httpapi/transport
    │       ├──→ httpapi/handler    ──→ httpapi/transport, infra/store, domain
    │       └──→ httpapi/transport  ──→ domain, domain/apperr
    ├──→ Tier 4: internal/infra/store
    │       ├──→ infra/sqlite (+ migrations/sql/)
    │       ├──→ infra/store/paging ──→ domain
    │       ├──→ domain/archive     ──→ domain, domain/apperr
    │       └──→ Tier 3: internal/domain ──→ domain/apperr
    ├──→ Tier 4: internal/infra/sqlite (read-only manual snapshot worker)
    └──→ Tier 4: internal/infra/eraser ──→ domain, domain/apperr
```

`cmd/notespace` delegates directly to `internal/app`, which is the composition root: it parses configuration, opens `store.Store`, wires `httpapi`, wraps owner auth / SPA serving / desktop sidecar boundaries, and manages graceful shutdown.

### Tier 2 — `internal/httpapi`

Owns HTTP transport concerns only and never imports `database/sql`, `infra/sqlite`, or `infra/eraser`:

- `router.go` — public `New(Dependencies)` facade, route table, and middleware exports;
- `httpapi/middleware` — same-origin mutation guard and request observability (consuming a consumer-owned `PoolStats` snapshot);
- `httpapi/transport` — JSON/binary body decoding, bounded body limits, `apperr` → HTTP status mapping, and `If-Match` / query parsing;
- `httpapi/handler` — thin capability handlers (`workspace`, `note`, `asset`, `backup`, `search`, `icon`, `health`) delegating directly to `store.Store` or `domain.IconSource`.

### Tier 3 — `internal/domain` (`+ domain/apperr`, `domain/archive`)

Owns pure product models, structured error taxonomy (`domain/apperr`), external icon contract (`icon.go`), validation rules, and format codecs with **zero** `database/sql` and **zero** `net/http` dependencies:

- `workspace.go`, `note.go`, `asset.go`, `search.go`, `backup.go`, `errors.go`, `icon.go` — canonical structs, invariants, and query normalization;
- `document.go` — Markdown Note envelope validator, plain-text/label/excerpt summarizer, and text-based backlink extractor;
- `scene.go` — single-pass Excalidraw scene validator, Note placement extractor, and retired-artifact scrubber;
- `domain/archive` — SQL-free ZIP backup manifest/blob codec and compressed Trash envelope codec;
- `domain/legacynote` — the only reader of the retired rich Note document, used by the 0033 migration hook and backup import.

### Tier 4 — `internal/infra` (`sqlite`, `store`, `eraser`)

- **`infra/sqlite` (`+ sqlite/migrations/sql/`):** pure SQLite infrastructure with **zero** domain imports — dual-pool connection lifecycle (serialized writer `MaxOpenConns=1`, WAL, `synchronous=FULL`, `foreign_keys=1`, `busy_timeout=5000`, `BEGIN IMMEDIATE` + concurrent `mode=ro` reader pool), `DBTX`/`WithTx`/`WithReadTx`, verified `VACUUM INTO` snapshots (`snapshot.go`), and append-only SQL migrations embedded via `sql/*.sql`.
- **`infra/store` (`+ store/paging/`):** single transactional persistence coordinator (`Store`) composing `*sqlite.DB` and the SQL-free `store/paging` cache, executing atomic cross-entity transactions across `workspace.go`, `note.go`, `asset.go`, `search.go`, and `backup.go`.
- **`infra/eraser`:** external Eraser SVG retrieval, sanitization, bounded caching, and singleflight deduplication implementing `domain.IconSource`.

### `apps/server/tests`

- `tests/architecture_test.go` enforces the exact 4 top-level folders in `internal/` (`app`, `domain`, `httpapi`, `infra`) and the dependency DAG via Go AST inspection.
- `tests/httpapi/` houses the consolidated black-box HTTP integration suite (`package httpapi_test`).

## Persistence model

Migration files remain append-only under `apps/server/internal/infra/sqlite/migrations/sql`.

The schema retains the historical `projects` table name for Workspaces. Migration `0031_contract_retired_domains.sql` removes the retired planning, activity, capture and history tables as well as obsolete authored columns. Historical migration names do not describe the current product.

Current persistence covers:

- Categories;
- Workspaces;
- granular Canvas;
- canonical Canvas Notes and note placements;
- durable assets and asset lifecycle;
- Workspace Trash snapshots and Note Trash;
- FTS/search projection;
- migration metadata and integrity fingerprints.

### Derived search state

Authored state is authoritative; FTS rows are derived.

Granular Canvas saves may commit authored state before FTS refresh. Search detects stale projection metadata and repairs the index lazily.

A successful authored save is therefore not turned into a failed save because a derived search projection could not be refreshed synchronously.

## Trash, backup, and restore

Trash is not a raw delete.

```text
Trash Workspace
  ↓
snapshot authored Workspace + Note placements + Assets
  ↓
write Trash record
  ↓
remove active Workspace
  ↓
COMMIT
```

Full-library restore follows the inverse safety rule:

```text
validate complete input
  ↓
replace canonical state in one transaction
  ↓
validate resulting database
  ↓
COMMIT or ROLLBACK
```

The application ZIP backup is currently capped at 64 MiB because archive assembly is in-memory. Larger installations should use an SQLite-safe infrastructure backup until archive streaming exists.

## HTTP routes

Canonical client terminology:

```text
/workspaces/:id
/api/workspaces/*
```

Current Canvas Notes use `/api/notes/*` and workspace-scoped `/api/workspaces/{id}/note-instances`; note Trash has its own endpoints. See the [HTTP router](../apps/server/internal/httpapi/router.go) for the authoritative route inventory.

Legacy `/api/projects/*`, full-snapshot `PATCH /api/workspaces/{id}`, and retired `planning`, `capture`, and `activity` endpoints have been removed.

## Process, security, and deployment

The Go process:

1. opens and migrates SQLite;
2. constructs application services;
3. wires the HTTP API;
4. wraps same-origin mutation protection;
5. adds request observability;
6. serves the built SPA;
7. optionally wraps everything except `/api/health` in owner Basic auth;
8. handles graceful shutdown.

`NOTESPACE_PASSWORD` enables a fixed-user (`notespace`) Basic-auth deployment gate. It is not an account system.

Use HTTPS termination at the reverse proxy/platform for remote deployments.

The Docker runtime:

- runs as an unprivileged user;
- drops Linux capabilities;
- uses `no-new-privileges`;
- stores SQLite under `/data`;
- keeps the Compose volume name stable across project-name changes;
- health-checks `/api/health`.

## Verification

Testing ownership and CI behavior are documented in [`docs/TESTING.md`](TESTING.md).

The key rule is:

```text
behavior
→ lowest boundary that owns it
→ one clear piece of evidence
```

Do not infer correctness from file-count coverage.
