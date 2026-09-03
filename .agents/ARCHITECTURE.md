# Notespace — Architecture Boundaries

## Objective

Keep Notespace a simple self-hosted modular monolith whose implementation preserves a Category → Workspace hierarchy while each workspace owns its document and canvas editing state.

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
        Study activity API → Study service/domain → SQLite persistence
```

## Deployable shape

Current production shape:

- `apps/web`: React + TanStack Start/Router + Vite frontend;
- `apps/server`: Go HTTP server and Project domain/persistence;
- SQLite is the durable store;
- Go serves the built web shell/assets and same-origin API;
- Docker packages the application as one self-hosted deployable.

Do not split services or add infrastructure unless a concrete requirement proves the operational cost is justified.

## Ownership boundaries

### Category and workspace domain

`apps/server/internal/project` owns the category summaries plus the workspace aggregate and their application-level contracts. The package and legacy HTTP paths retain `project` naming for compatibility.

Current aggregate:

```text
Category
└── Workspace
    ├── identity + title + timestamps + version
    ├── versioned document snapshot
    ├── versioned canvas snapshot
    └── split ratio
```

Rules:

- A category owns grouping only; a workspace owns document and canvas state.
- A separate independently navigable Note or Canvas aggregate requires explicit product approval.
- Optimistic Project versioning is the current concurrent-write policy. Do not silently replace it with merge/CRDT semantics.

### HTTP boundary

`apps/server/internal/httpapi` owns HTTP request/response mapping, validation/error translation, and API composition.

Keep product/domain rules out of route wiring where they can live in the Project service. Do not let browser-specific or editor-specific structures become server routing concerns.

### Persistence boundary

`apps/server/internal/persistence` owns SQLite persistence for category and workspace state.

Current constraints:

- `database/sql` with pure-Go `modernc.org/sqlite`;
- explicit SQL and embedded migrations;
- one database connection in the current implementation;
- SQLite WAL with FULL synchronous durability configuration;
- persisted snapshots remain versioned so editor formats can evolve deliberately.
- Compose maps `/data` to a stable physical named volume configured by `NOTESPACE_DATA_VOLUME`; changing or removing that volume is a deployment-level data-loss operation.
- Category deletion is transactional and refuses non-empty categories; workspace title rename reuses optimistic version checks so metadata edits cannot overwrite newer authored state.
- Search traverses Project-owned note snapshots and returns product IDs for exact-context navigation; it does not introduce a graph aggregate.
- History stores bounded pre-update workspace snapshots in SQLite and restores through the normal optimistic Project update path.
- Export is assembled at the HTTP boundary as a portable ZIP containing manifest, notes, canvas, and relationships; editor-native state remains inside those versioned files.

Schema/data migrations are architecture-sensitive. Destructive or irreversible migrations require explicit user approval and recovery evidence.

### Study activity domain

`apps/server/internal/study` owns automatic study sessions and derived activity summaries. Study sessions are persisted separately from the versioned Project snapshot because heartbeat writes are cumulative telemetry, not authored content updates.

Rules:

- browser activity contributes cumulative `active_seconds`; persistence uses a monotonic maximum so retries cannot double-count;
- `activity_date` is the browser's local calendar date, with the client splitting a session at midnight;
- streaks are derived from daily totals using the 10 active-minute study-day threshold rather than stored counters;
- study rows intentionally do not cascade with workspace deletion and retain a workspace title snapshot for history;
- the study domain does not depend on Tiptap or Excalidraw internals.

### Web application

`apps/web` owns browser interaction and category/workspace presentation.

Keep responsibility local:

- routes/loaders: navigation and data entry points;
- Project/workspace domain modules: product behavior and client-side orchestration;
- editor adapters/components: Tiptap/Excalidraw integration details;
- generic UI primitives: presentation only, not Project semantics.

Do not create a global state abstraction or shared utility layer without a demonstrated cross-cutting need.

### Document integration

Tiptap is the current structured document editor. Notespace owns the serialized Project document snapshot and any product-owned block identity used for cross-surface relationships.

Dependency direction:

```text
Project/document behavior
        ↓
Notespace document adapter
        ↓
Tiptap
```

Do not use mutable document position, visible label text, or editor-private incidental identity as a durable product relationship key.

### Canvas integration

Excalidraw is the current freeform canvas editor.

Dependency direction:

```text
Project/canvas behavior
        ↓
Notespace canvas adapter
        ↓
Excalidraw
```

Excalidraw scene data may be persisted as a versioned canvas snapshot, but unrelated product code must not depend on Excalidraw internals. Product-owned relationship metadata may be carried through the adapter when required by a bounded feature.

## Major flows

### Open Project

```text
route/load
  → GET Project
  → initialize workspace
      ├── document adapter receives document snapshot
      └── canvas adapter receives canvas snapshot
  → restore split/layout state
```

### Edit and autosave

```text
editor change
  → local Project draft state
  → serialized save queue / debounce
  → complete Project update with optimistic version
  → durable SQLite write
  → acknowledged version replaces local version
```

Current behavior uses serialized debounced saves, visible retry on failure, navigation flush where possible, and unload warning for unacknowledged changes.

### Cross-surface relationship

Approved Milestone 2 architecture:

```text
stable document block identity
        ↕
Project-owned relationship
        ↕
canvas object metadata / adapter capability
```

Project-owned relationship state is authoritative. Missing targets must remain recoverable/diagnosable rather than triggering implicit relinking.

## State taxonomy

Keep these categories distinct:

- **Domain state:** Project identity, authored document/canvas content, durable relationships.
- **Presentation state:** split ratio, selection, viewport/focus state where not explicitly persisted.
- **Runtime/instance state:** server version, health, storage/configuration.

Do not put all categories into one unbounded state store.

## Security boundaries

Treat Project content, imported payloads, editor snapshots, files/images, URLs, and future embeds as untrusted input.

Preserve:

- server-side schema/input validation;
- no arbitrary script execution from Project content;
- safe handling of HTML/SVG/URLs/files;
- no client-controlled filesystem paths;
- secrets only from deployment configuration;
- no secret exposure through Project/diagnostic responses.

Authentication/authorization is currently not a committed architecture. Introducing it changes the security boundary and requires explicit product/architecture approval.

## Infrastructure boundaries

Self-hosting is a product constraint:

- minimize mandatory processes and external services;
- make durable data ownership explicit;
- keep core editing functional without hosted dependencies;
- preserve restart durability for acknowledged saves;
- treat backup/restore and migrations as recovery concerns, not merely file operations.

## Material changes requiring approval

Stop and surface the decision before:

- changing Project ownership semantics;
- adding an independently deployed backend/service;
- replacing Tiptap or Excalidraw as a primary editor;
- replacing SQLite/persistence technology when migration/deployment semantics change;
- introducing collaboration/CRDT/event-sourcing architecture;
- adding authentication/authorization or external hosted infrastructure;
- changing public API/data contracts;
- destructive/irreversible data migrations;
- adding a broad plugin/extensibility architecture.

Local helper placement, small adapter methods, test structure, and refactors strictly required for an approved change remain implementation-level decisions.
