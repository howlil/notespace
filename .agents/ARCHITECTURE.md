# Notespace — Architecture Boundaries

## Objective

Keep Notespace a simple self-hosted modular monolith whose implementation preserves a Category → Workspace hierarchy while each workspace owns its Notes, Canvas, durable assets, history, and study context.

```text
Browser / Category library or Workspace editor
        ↓
Notespace application boundary
        ├── document integration → Tiptap
        ├── canvas integration   → Excalidraw
        └── Category + Workspace API
                ↓
        Project service/domain
                ↓
          SQLite persistence
          ├── authored snapshots
          ├── durable image assets
          ├── FTS search projection
          ├── history
          └── study activity
```

## Deployable shape

- `apps/web`: React + TanStack Start/Router + Vite frontend;
- `apps/server`: Go HTTP server and Project domain/persistence;
- SQLite is the durable store;
- Go serves the built web shell/assets and same-origin API;
- Docker packages the application as one self-hosted deployable.

Do not split services or add infrastructure unless a concrete requirement proves the operational cost is justified.

## Category and workspace domain

`apps/server/internal/project` owns category summaries plus the workspace aggregate. Existing package and HTTP `project` naming remains compatibility debt.

```text
Category
└── Workspace
    ├── identity + title + timestamps + version
    ├── Notes[] snapshots
    ├── Canvas snapshot
    └── split ratio compatibility field
```

A category owns grouping only; a workspace owns authored Note/Canvas state. Notespace no longer exposes cross-surface Send/Link relationships. The legacy references field remains wire/storage compatibility only and new authored state normalizes it to empty.

Optimistic Project versioning is the concurrent-write policy. Do not silently replace it with merge/CRDT semantics.

## HTTP boundary

`apps/server/internal/httpapi` owns request/response mapping, validation/error translation, asset transfer, export composition, and API composition. Browser/editor-specific structures must not become routing concerns.

True workspace version conflicts return HTTP 409 with `workspace_conflict`; the client distinguishes this from retryable transport/server failures.

## Persistence boundary

`apps/server/internal/persistence` owns SQLite persistence.

Current constraints:

- `database/sql` with pure-Go `modernc.org/sqlite`;
- explicit SQL and embedded migrations;
- one database connection;
- SQLite WAL with FULL synchronous durability;
- persisted snapshots remain versioned;
- `/data` maps to a stable named volume configured by `NOTESPACE_DATA_VOLUME`;
- category deletion refuses non-empty categories;
- history stores bounded compressed pre-update snapshots and restores through normal optimistic update;
- image binaries live in `workspace_assets` as workspace-scoped SQLite BLOBs, so the same durable database/volume backup includes authored images;
- browser IndexedDB is a cache and legacy migration source only;
- global retrieval uses `workspace_search` FTS5 plus `workspace_search_meta` as a derived projection. Authored snapshots remain authoritative; stale projection rows are rebuilt lazily by workspace version/category/title;
- export includes notes, canvas metadata, and every durable workspace asset in one ZIP.

Schema/data migrations are architecture-sensitive. Destructive or irreversible migrations require explicit user approval and recovery evidence.

## Study activity domain

`apps/server/internal/study` owns automatic study sessions and derived activity summaries. Telemetry stays separate from authored workspace versioning.

- heartbeats use monotonic `active_seconds`;
- `activity_date` follows browser local date;
- streaks derive from daily totals with the 10 active-minute threshold;
- study rows intentionally survive workspace deletion and retain title snapshots.

## Web application

`apps/web` owns browser interaction and presentation.

Responsibility boundaries:

- routes/loaders: navigation and data entry points;
- Project/workspace domain modules: authored state and API orchestration;
- `features/workspace/pane-layout.ts`: pane-tree invariants (max four panes, max one Canvas), layout repair, split/resize tree operations;
- `features/workspace/workspace-content.ts`: note snapshot normalization, stable block identity, legacy relationship cleanup, history-preview helpers;
- editor adapters: Tiptap/Excalidraw integration details;
- `domain/assets/local-image-assets.ts`: server-backed durable asset transfer plus browser cache/read-through migration;
- generic UI primitives: presentation only.

Do not introduce a global state library without demonstrated cross-cutting need.

## Document integration

Tiptap is the structured document editor. Notespace owns serialized snapshots and stable block identity required for exact search/deep-link navigation. Stable block IDs must not be repurposed into an implicit linking system.

## Canvas integration

Excalidraw is the spatial editor. Scene metadata may be persisted in the workspace snapshot; binary image data is stored through the durable asset boundary rather than embedded into every authored snapshot.

## Edit and autosave

```text
editor change
  → local Workspace draft
  → serialized debounce/coalescing
  → complete Workspace update with optimistic version
  → durable SQLite write
  → acknowledged version replaces local version
```

Network/server failure → keep pending snapshot → retry is allowed.

Version conflict → keep pending snapshot → enter `conflict` state → stop automatic retries → explicit reload/recovery required.

## State taxonomy

- **Domain state:** workspace identity, authored Notes/Canvas content, durable assets.
- **Derived state:** FTS search projection, study summaries.
- **Presentation state:** pane tree, selection, viewport/focus state where not explicitly persisted.
- **Runtime state:** server health, storage/configuration.

Do not collapse these into one unbounded store.

## Security boundary

Notespace remains a trusted/private single-user instance. Same-origin mutation defenses are not an authentication system. App-level authentication, multi-user identity, or authorization changes the security boundary and requires explicit product/architecture approval.

Treat content, imported payloads, images, URLs, and future embeds as untrusted input. Preserve server validation, safe file/MIME handling, no arbitrary script execution, no client-controlled filesystem paths, and no secret exposure.

## Material changes requiring approval

Stop before changing workspace ownership semantics; adding independently deployed services; replacing Tiptap/Excalidraw; replacing SQLite; introducing collaboration/CRDT/event sourcing; adding authentication/authorization or hosted infrastructure; changing public API/data contracts incompatibly; destructive migrations; or broad plugin architecture.
