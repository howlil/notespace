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

A category owns grouping only; a workspace owns authored Note/Canvas state. The legacy generic cross-surface Send/Link system remains removed: the legacy `references` field is wire/storage compatibility only and new authored state normalizes it to empty. The one scoped cross-surface reference is an explicit Note → Canvas Frame embed stored inside the Note document as a Tiptap `canvasFrameLink` node. It stores the Canvas `frameId` plus a lightweight insertion-time preview; Canvas remains authoritative and clicking the embed navigates to the live frame. Preview image elements retain only their Canvas `fileId` (plus geometry), and the Note renderer resolves that blob through the workspace asset store at render time. Image bytes are not duplicated into the Note document.

`Project.version` is the aggregate revision/ETag for Workspace metadata and legacy whole-workspace compatibility writes. Every canonical Note/Canvas mutation advances that aggregate revision so a stale aggregate snapshot cannot overwrite newer child state. Canonical Notes still use per-Note versions and Canvas uses its own version for their write guards, so granular conflicts stay scoped to the resource being edited. Do not use the aggregate revision as the concurrency guard for granular Note/Canvas writes.

## HTTP boundary

`apps/server/internal/httpapi` owns request/response mapping, validation/error translation, asset transfer, export composition, and API composition. Browser/editor-specific structures must not become routing concerns.

Legacy aggregate Workspace conflicts return HTTP 409 with `workspace_conflict`. Granular Note/Canvas writes use their own resource versions. Note conflicts remain explicit and preserve the local draft; Canvas conflicts may fetch the latest Canvas, reconcile Excalidraw elements, and retry before surfacing recovery.

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
- global retrieval uses `workspace_search` FTS5 plus `workspace_search_meta` as a derived projection. Authored snapshots remain authoritative; stale projection rows are detected by aggregate revision/category/title plus `notes_revision`. Canvas-only writes advance the stored projection revision without rebuilding searchable Note content;
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

Tiptap is the structured document editor. Notespace owns serialized snapshots and stable block identity required for exact search/deep-link navigation. Stable block IDs must not be repurposed into an implicit linking system. Note transactions mark the workspace dirty immediately, while full Tiptap JSON snapshots are checkpointed on a short throttle and synchronously materialized before workspace flush/navigation. This keeps typing off the full-document serialization path without hiding unsnapshotted edits from durability guards. Canvas Frame embeds use the explicit Excalidraw `frameId`, not Note block identity. Their insertion-time preview is bounded to 160 representative elements and rendered only near the viewport; `elementCount` remains the exact authored descendant count and Canvas remains authoritative. In single-Note/non-split presentation the authored column is centered and article-width; split panes use the available pane width.

## Canvas integration

Excalidraw is the spatial editor and owns live Canvas geometry, selection, native bindings, resize/move behavior, and undo/redo. Structured Diagram metadata owns semantic identity such as catalog component, labels, edges/groups, and compatibility bootstrap geometry; ordinary native move/resize must not mirror a second live geometry source back into semantic metadata on every frame. Canvas Code Blocks remain ordinary Excalidraw elements for geometry and lifecycle, with Notespace-owned code/language/theme plus `heightMode` metadata stored in the element `customData.notespaceCodeBlock`. Code-specific settings/actions live in the contextual Canvas action bar, not inside the rendered card. A code card is always syntax-highlighted preview by default; double-clicking the selected card enters inline editing, where a transparent text input is layered over the same live highlighted rendering so color feedback updates while typing. Escape or blur returns to preview without a separate edit-mode control. `heightMode=auto` derives element height from wrapped rendered code; a user-driven vertical resize switches that block to `manual`, while `Fit code height` returns it to `auto`. Excalidraw remains authoritative for width/height, and the HTML code layer is a render/edit/measurement adapter only, never a second geometry or persistence source. Scene metadata is persisted with Canvas state; binary image data is stored through the durable asset boundary rather than embedded into every authored snapshot.

For the same Workspace in sibling tabs of one browser, Canvas element snapshots use `BroadcastChannel` as a local transport and Excalidraw's `reconcileElements()` semantics for convergence. This path does not involve the server and is coalesced independently from durable autosave. It is intentionally not a cross-device collaboration protocol.

Pan and zoom stay local to each Excalidraw instance. They are presentation state, not authored content, and must not cause durable writes.

Canvas external embeds use Excalidraw embeddable elements and their existing `link` field as the single authored source of truth. Notespace disables Excalidraw's domain allowlist (`validateEmbeddable={true}`) so the editor never emits the upstream whitelist warning for otherwise renderable links. URL normalization/sanitization, provider-specific transforms, and iframe sandboxing remain Excalidraw-owned; Notespace does not proxy or server-fetch arbitrary embed URLs. A link being accepted by the editor is permission to attempt browser rendering, not a promise that a third-party site will permit framing: CSP `frame-ancestors`, `X-Frame-Options`, authentication, cookie, or third-party browser policy may still prevent live rendering.

Canvas Code Block execution is an explicit browser-local action and is not authored state. Only JavaScript is runnable in the current boundary. Each run uses a disposable Web Worker, has a finite timeout/output budget, and attempts to disable ordinary Worker network APIs before user code starts. stdout/stderr/result stay ephemeral and must not enter Canvas snapshots, autosave, peer sync, backup, or server APIs. This local runner is a damage-limiting execution environment for the owner's own snippets, not a hardened hostile-code sandbox; server-side or multi-language arbitrary execution requires a separate approved isolation design.

## Edit and autosave

```text
Canvas authored change
  ├─ high-frequency UI path keeps only interaction state/code overlays needed by React
  ├─ ~80 ms coalesced BroadcastChannel → sibling browser tabs
  │       → Excalidraw element reconciliation
  │
  └─ local Canvas draft
          → serialized debounce/coalescing
          → Canvas-only update with canvas version
          → workspace_canvas durable SQLite write
          → acknowledgement advances the autosave version only

Note authored change
  → mark unsnapshotted local edit dirty immediately
  → ~120 ms full-document snapshot checkpoint, or synchronous snapshot on blur/flush
  → per-Note serialized debounce/coalescing
  → Note-only update with note version
  → workspace_notes durable SQLite write
  → acknowledgement advances only that Note's autosave version
```

Network/server failure → keep pending snapshot → retry is allowed.

Canvas version conflict → keep the Canvas queue isolated from Note queues; reconcile only Canvas state where the client has a safe Excalidraw merge path.

Note version conflict → block only that Note save queue and preserve its local draft. Other Notes and Canvas must remain independently saveable. Workspace metadata conflicts remain explicit; do not introduce whole-workspace last-write-wins.

## State taxonomy

- **Domain state:** workspace identity, authored Notes/Canvas content, durable assets.
- **Derived state:** FTS search projection, study summaries.
- **Presentation state:** pane tree, selection, Canvas pan/zoom/focus state where not explicitly persisted.
- **Runtime state:** server health, storage/configuration, same-browser peer channel, ephemeral local Code Block execution/output.

Do not collapse these into one unbounded store.

## Security boundary

Notespace remains a trusted/private single-user instance. Same-origin mutation defenses are not an authentication system. App-level authentication, multi-user identity, or authorization changes the security boundary and requires explicit product/architecture approval.

Treat content, imported payloads, images, URLs, and embeds as untrusted input. Preserve server validation, safe file/MIME handling, no server-side arbitrary code execution, no client-controlled filesystem paths, no arbitrary server-side URL fetching, and no secret exposure. The Canvas JavaScript runner must remain explicit user-triggered, browser-local, disposable, time/output bounded, and isolated from durable/peer state.

## Material changes requiring approval

Stop before changing workspace ownership semantics; adding independently deployed services; replacing Tiptap/Excalidraw; replacing SQLite; introducing cross-device collaboration/CRDT/event sourcing; adding authentication/authorization or hosted infrastructure; changing public API/data contracts incompatibly; destructive migrations; or broad plugin architecture.