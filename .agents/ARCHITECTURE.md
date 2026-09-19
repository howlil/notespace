# Notespace — Architecture Boundaries

## Objective

Keep Notespace a simple self-hosted modular monolith whose implementation preserves a Category → Workspace hierarchy while each workspace owns its Notes, Canvas, durable assets, and study context.

```text
Browser / Category library or Workspace editor
        ↓
Notespace application boundary
        ├── document integration → Tiptap
        ├── canvas integration   → Excalidraw
        │       └── same-browser peer sync → BroadcastChannel
        └── Category + Workspace API
                ↓
        Project service/domain
                ↓
          SQLite persistence
          ├── authored snapshots
          ├── durable image assets
          ├── FTS search projection
          ├── legacy history compatibility
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

`apps/server/internal/project` owns category summaries plus the workspace compatibility view. Notes and Canvas now have independent authored persistence/version boundaries; the hydrated `Project` response remains an API compatibility aggregate. Existing package and HTTP `project` naming remains compatibility debt.

```text
Category
└── Workspace
    ├── identity + title + timestamps + version
    ├── Notes[] snapshots
    ├── Canvas snapshot
    └── split ratio compatibility field
```

A category owns grouping only; a workspace owns authored Note/Canvas state. Notespace no longer exposes cross-surface Send/Link relationships. The legacy references field remains wire/storage compatibility only and new authored state normalizes it to empty.

Project versioning guards Workspace metadata and the legacy whole-workspace compatibility route. Canonical Notes use per-Note versions and Canvas uses its own version, so conflicts stay scoped to the resource being edited. Do not reintroduce a generic whole-workspace last-write-wins policy.

## HTTP boundary

`apps/server/internal/httpapi` owns request/response mapping, validation/error translation, asset transfer, export composition, and API composition. Browser/editor-specific structures must not become routing concerns.

Workspace version conflicts return HTTP 409 with `workspace_conflict`. The browser may recover automatically only when the conflicting authored difference is Canvas-only; other aggregate conflicts remain explicit.

## Persistence boundary

`apps/server/internal/persistence` owns SQLite persistence.

Current constraints:

- `database/sql` with pure-Go `modernc.org/sqlite`;
- explicit SQL and embedded migrations;
- one database connection;
- SQLite WAL with FULL synchronous durability;
- canonical Note rows live in `workspace_notes` with per-Note optimistic versions;
- canonical Canvas state lives in `workspace_canvas` with its own optimistic version;
- `projects` is metadata-only; legacy aggregate payloads are hydrated at the API/backup boundary from canonical `workspace_notes` and `workspace_canvas` rows;
- `/data` maps to a stable named volume configured by `NOTESPACE_DATA_VOLUME`;
- category deletion refuses non-empty categories;
- normal autosave updates authored snapshots directly and does not create periodic history checkpoints;
- legacy history tables/read-restore paths and one creation baseline remain only for backup-format compatibility;
- image binaries live in `workspace_assets` as workspace-scoped SQLite BLOBs, so the same durable database/volume backup includes authored images;
- browser IndexedDB is a cache and legacy migration source only;
- global retrieval uses `workspace_search` FTS5 plus `workspace_search_meta` as a derived projection. Authored snapshots remain authoritative; stale projection rows are rebuilt lazily by workspace version/category/title;
- export includes notes, canvas metadata, and every durable workspace asset in one ZIP.

Schema/data migrations are architecture-sensitive. Destructive or irreversible migrations require explicit user approval and recovery evidence.

## Study activity domain

`apps/server/internal/study` owns durable study segments and derived activity summaries. The browser workspace feature owns the user-visible manual session lifecycle. Study telemetry stays separate from authored workspace versioning.

- Start, Pause/Resume, and End are explicit user actions; focus, visibility, idle state, and workspace unmount do not own those transitions;
- an active logical session is retained client-side so reload/navigation does not implicitly End it;
- heartbeats persist monotonic `active_seconds` for the current local-date segment;
- a logical manual session may span midnight; the browser finalizes the old date segment and continues the same logical session in a new date segment without exposing an automatic End;
- `activity_date` follows browser local date;
- multiple durable segments/sessions on one date aggregate into daily totals;
- streaks derive from daily totals with the 10 active-minute threshold;
- study rows intentionally survive workspace deletion and retain title snapshots.

## Web application

`apps/web` owns browser interaction and presentation.

Responsibility boundaries:

- routes/loaders: navigation and data entry points;
- Project/workspace domain modules: authored state and API orchestration;
- `features/workspace/pane-layout.ts`: pane-tree invariants (max four panes, max one Canvas), layout repair, split/resize tree operations;
- `features/workspace/workspace-content.ts`: note snapshot normalization, stable block identity, and legacy relationship cleanup;
- `features/study/use-study-session.ts`: manual study-session state machine and local continuity across reload/navigation;
- `features/study/study-timer.ts`: pure elapsed-time, pause/resume, rollover, and aggregation logic;
- `integrations/canvas/CanvasEditor.tsx`: Excalidraw composition root; peer transport, asset lifecycle, and native flowchart interaction live behind dedicated hooks;
- `domain/project/canvas-merge.ts`: pure fallback merge for Canvas-only durable-version races;
- `domain/assets/local-image-assets.ts`: server-backed durable asset transfer plus browser cache/read-through migration;
- generic UI primitives: presentation only.

Do not introduce a global state library without demonstrated cross-cutting need.

## Document integration

Tiptap is the structured document editor. Notespace owns serialized snapshots and stable block identity required for exact search/deep-link navigation. Stable block IDs must not be repurposed into an implicit linking system.

## Canvas integration

Excalidraw is the spatial editor and owns live Canvas geometry, selection, native bindings, resize/move behavior, and undo/redo. Structured Diagram metadata owns semantic identity such as catalog component, labels, edges/groups, and compatibility bootstrap geometry; ordinary native move/resize must not mirror a second live geometry source back into semantic metadata on every frame. Scene metadata is persisted with Canvas state; binary image data is stored through the durable asset boundary rather than embedded into every authored snapshot.

For the same Workspace in sibling tabs of one browser, Canvas element snapshots use `BroadcastChannel` as a local transport and Excalidraw's `reconcileElements()` semantics for convergence. This path does not involve the server and is coalesced independently from durable autosave. It is intentionally not a cross-device collaboration protocol.

Pan and zoom stay local to each Excalidraw instance. They are presentation state, not authored content, and must not cause durable writes.

## Edit and autosave

```text
Canvas authored change
  ├─ ~80 ms coalesced BroadcastChannel → sibling browser tabs
  │       → Excalidraw element reconciliation
  │
  └─ local Canvas draft
          → serialized debounce/coalescing
          → Canvas-only update with canvas version
          → workspace_canvas durable SQLite write
          → acknowledged canvas version replaces local version

Note authored change
  → per-Note serialized debounce/coalescing
  → Note-only update with note version
  → workspace_notes durable SQLite write
  → acknowledged note version replaces only that Note
```

Network/server failure → keep pending snapshot → retry is allowed.

Canvas version conflict → keep the Canvas queue isolated from Note queues; reconcile only Canvas state where the client has a safe Excalidraw merge path.

Note version conflict → block only that Note save queue and preserve its local draft. Other Notes and Canvas must remain independently saveable. Workspace metadata conflicts remain explicit; do not introduce whole-workspace last-write-wins.

## State taxonomy

- **Domain state:** workspace identity, authored Notes/Canvas content, durable assets.
- **Derived state:** FTS search projection, study summaries.
- **Presentation state:** pane tree, selection, Canvas pan/zoom/focus state where not explicitly persisted.
- **Runtime state:** server health, storage/configuration, same-browser peer channel.

Do not collapse these into one unbounded store.

## Security boundary

Notespace remains a trusted/private single-user instance. Same-origin mutation defenses are not an authentication system. App-level authentication, multi-user identity, or authorization changes the security boundary and requires explicit product/architecture approval.

Treat content, imported payloads, images, URLs, and future embeds as untrusted input. Preserve server validation, safe file/MIME handling, no arbitrary script execution, no client-controlled filesystem paths, and no secret exposure.

## Material changes requiring approval

Stop before changing workspace ownership semantics; adding independently deployed services; replacing Tiptap/Excalidraw; replacing SQLite; introducing cross-device collaboration/CRDT/event sourcing; adding authentication/authorization or hosted infrastructure; changing public API/data contracts incompatibly; destructive migrations; or broad plugin architecture.