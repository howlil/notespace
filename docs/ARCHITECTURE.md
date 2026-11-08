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
Notespace feature + domain code
  ↓
HTTP adapters
  ↓
Go net/http API
  ↓
application services
  ↓
SQLite adapter
  ↓
one SQLite database
```

Canonical user-owned state lives in SQLite. Browser storage is used for local UI preferences, activity recovery, and image compatibility caching; it is not the durable source of truth for authored Workspace content.

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

Historical Capture, Task, Milestone and Activity rows may still exist in SQLite and backup archives. They are not exposed through the retired Today/Inbox screens. Keeping their storage and API compatibility separate from UI ownership prevents destructive upgrades.

A Workspace is the main authored unit and Canvas is its only authored content. Planning, assets, activity, Trash, backup/restore, and workspace search are separate capabilities around that authored state.

## Repository map

```text
apps/
├── web/src/
│   ├── routes/              URL boundary
│   ├── pages/               home, workspace, shell composition
│   ├── features/            capability-owned user workflows
│   ├── domain/              pure product rules
│   ├── adapters/            HTTP, browser, assets, desktop
│   └── shared/              reusable foundations
├── server/
│   ├── cmd/notespace/        process bootstrap
│   ├── internal/
│   │   ├── workspace/ planning/ activity/ capture/ asset/ icon/ library/
│   │   ├── httpapi/          facade, capability handlers, internal/transport
│   │   └── sqlite/           Store facade and transaction coordinators
│   │       └── internal/    dbtx, workspace, planning, activity, capture,
│   │                       assets, search, backup query packages
│   └── migrations/
└── desktop/src-tauri/src/
    ├── lib.rs               Tauri assembly and command registration
    ├── runtime.rs           crate-private runtime facade
    ├── runtime/             state, sidecar, readiness, shutdown
    └── window.rs recovery.rs updates.rs diagnostics.rs

tests/e2e/                   canvas, library, settings, compatibility, support
scripts/                     dev, verify, release, assets
```

The web and server are both capability-oriented. Notespace deliberately avoids generic application-wide `controllers/services/repositories` folders.

## Web architecture

### Routes

`apps/web/src/routes` owns URL parsing, route loading, redirects, and page selection.

Current routed surfaces include:

- Home / Library
- Workspace

Routes should not own editor workflows or mutation orchestration.

### Pages

`apps/web/src/pages` composes routed screens.

Examples:

- `pages/home/HomePage.tsx`
- `pages/workspace/WorkspacePage.tsx`
- `pages/shell/LibraryPageShell.tsx`
- `features/library/explorer/LibrarySidebar.tsx`

A page may combine sibling features through props or render slots. Product logic should remain in the owning feature or domain module.

### Features

Current feature owners are:

```text
features/
├── library/                 collection, explorer, backup
├── search/
├── workspace-authoring/     session, canvas
├── settings/
└── desktop/                 chrome, lifecycle, recovery, updates
```

`workspace-authoring` owns the Canvas session, Canvas behavior, and granular save orchestration.

Pages and routes consume feature `index.ts` entries. Feature internals import their own modules directly. CanvasEditor remains lazy; public authoring exports do not eagerly load the editor engine. The Explorer provider stays mounted in the root application across route changes.

Important orchestration boundaries include:

- `features/workspace-authoring/session/granular-save-core.ts` — Canvas conflict/rebase behavior for the active authoring save path;
- `features/workspace-authoring/canvas/assets/canvas-assets.ts` — durable Canvas-image persistence boundary.

These modules exist so behavior with meaningful failure modes can be tested without mounting the full React tree.

### Domain

`apps/web/src/domain` contains framework-independent Notespace rules:

```text
domain/
├── code/
├── diagram/
└── workspace/
```

Examples of domain-owned behavior:

- Workspace and Canvas shapes;
- autosave state transitions;
- Canvas merge/conflict rules;
- diagram routing/layout rules;
- code language/theme behavior.

Domain code must not depend on React, browser APIs, HTTP, or feature implementation.

### Adapters

`apps/web/src/adapters` owns side-effect boundaries:

```text
adapters/
├── http/
├── browser/
└── assets/
```

HTTP adapters map live frontend calls to the Go API. The frontend has no active planning, activity or capture client. Retired Capture, Today, Inbox and Plan UI clients have no frontend owner; historical records and compatible backend APIs remain in Go/SQLite.

Browser adapters own process-local/browser-global events such as library revision notifications and Workspace conflict events.

Asset adapters split responsibility between:

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

The Note route, Note API, Note capture conversion, Note search projection and Note-containing backup payloads are retired. Migration `0025_remove_notes.sql` retires relational Note data; `0026_scrub_retired_note_artifacts.sql` and its transactional Go hook scrub hidden Canvas, history and Trash payloads. Explicit historical checksums remain supported.

### Aggregate compatibility save

The legacy/aggregate Workspace HTTP save path still exists for compatibility,
but current authoring uses the granular Canvas save path. Its active
orchestration lives in `features/workspace-authoring/session/granular-save-core.ts`:

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

The server dependency graph is:

```text
cmd/notespace
    ↓
httpapi
    ↓
workspace / planning / activity / asset / library / icon
    ↓
consumer-owned ports
    ↓
sqlite
```

`cmd/notespace` is the composition root. It selects concrete adapters and wires services.

### Application packages

#### `workspace`

Owns:

- Workspace;
- retired Note DTO fields for compatibility only;
- Canvas;
- category behavior;
- authored-state validation;
- granular authoring use-cases;
- compatibility aggregate Workspace behavior.

#### `planning`

Owns:

- Milestones;
- Tasks;
- historical unassigned Tasks (read/assign only);
- persisted historical planning contracts (no routed Today/Capture UI);
- planning state transitions and validation.

#### `activity`

Owns:

- activity sessions;
- heartbeats;
- duration/statistics;
- linked Task/Workspace snapshots;
- activity validation.

#### `asset`

Owns durable binary asset validation and asset use-cases.

#### `icon`

Owns Eraser icon retrieval, SVG trust validation, bounded cache behavior, and concurrent fetch deduplication.

#### `library`

Owns destructive/recovery and portability use-cases:

- Trash;
- restore;
- permanent deletion from Trash;
- backup;
- full-library restore.

The package is intentionally thin because SQLite owns the atomic implementation of these operations.

### `httpapi`

Owns transport concerns only:

- route registration;
- request decoding;
- query/path/header parsing;
- body limits and content type;
- HTTP status/error mapping;
- compatibility headers;
- same-origin mutation middleware;
- request observability;
- cache/security headers.

The root `New(Dependencies)` facade registers routes and middleware. Capability handler packages receive application services; shared codecs and error mapping live in `httpapi/internal/transport`. Handler children cannot import the root facade or persistence.

It should not own product transactions or cross-domain business state.

### `sqlite`

`internal/sqlite` is one adapter and one transaction boundary for the single-owner application.

It implements persistence ports for Workspace, planning, activity, assets, and Library operations.

SQLite is configured with:

- WAL;
- `synchronous=FULL`;
- foreign keys enabled;
- 5-second busy timeout;
- one open/idle pooled connection.

The single connection keeps transaction and concurrency behavior explicit for this workload.

Private capability query packages borrow `DBTX` or a transaction. Store begins, commits and rolls back compound operations. Workspace snapshot/restore composes explicit workspace, planning and asset query entries using the same transaction. The paging snapshot cache remains attached to the Store lifetime. Architecture tests reject query-owned connections or transaction lifetime.

## Persistence model

Migration files remain append-only under `apps/server/migrations`.

The schema started with legacy `projects` and `study_sessions` names. Application terminology has since moved to Workspace and Activity, but old table names are not renamed merely for naming consistency because schema renames would add migration risk without changing product behavior.

Current persistence covers:

- Categories;
- Workspaces;
- legacy authored compatibility fields;
- granular Canvas;
- Workspace references;
- planning milestones/tasks;
- historical unassigned Tasks (no new creation);
- activity sessions;
- durable assets and asset lifecycle;
- Trash snapshots;
- legacy history compatibility;
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
snapshot authored Workspace + Plan + History + Assets
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

## HTTP compatibility

Canonical client terminology:

```text
/workspaces/:id
/api/workspaces/*
```

Legacy `/api/projects/*` endpoints remain as compatibility surfaces and emit deprecation metadata. New code should not introduce new Project-named consumers.

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
