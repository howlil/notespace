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
Today
└── Tasks[]
    ├── tasks planned for today
    └── incomplete planned tasks carried forward from earlier dates

Inbox
└── standalone unscheduled Tasks[]

Category
└── Workspace
    ├── Notes[]
    ├── Canvas
    ├── Plan
    │   ├── Milestones[]
    │   └── Tasks[]
    ├── durable image assets
    └── activity history
```

A Workspace is the main authored unit. Notes and Canvas have granular persistence and independent optimistic versions. Planning, assets, activity, Trash, backup/restore, and search are separate capabilities around that authored state.

## Repository map

```text
apps/
├── web/
│   └── src/
│       ├── routes/      URL boundary
│       ├── pages/       routed screen composition
│       ├── features/    user-facing use-cases and orchestration
│       ├── domain/      pure product rules and models
│       ├── adapters/    HTTP, browser, and asset boundaries
│       └── shared/      generic UI/browser/utilities
│
└── server/
    ├── cmd/notespace/   process bootstrap and wiring
    ├── internal/
    │   ├── workspace/
    │   ├── planning/
    │   ├── activity/
    │   ├── asset/
    │   ├── icon/
    │   ├── library/
    │   ├── httpapi/
    │   └── sqlite/
    └── migrations/
```

The web and server are both capability-oriented. Notespace deliberately avoids generic application-wide `controllers/services/repositories` folders.

## Web architecture

### Routes

`apps/web/src/routes` owns URL parsing, route loading, redirects, and page selection.

Current routed surfaces include:

- Home / Library
- Category view
- Workspace
- Today
- Inbox
- legacy `/projects/:id` redirect compatibility

Routes should not own editor workflows or mutation orchestration.

### Pages

`apps/web/src/pages` composes routed screens.

Examples:

- `pages/home/HomePage.tsx`
- `pages/workspace/WorkspacePage.tsx`
- `pages/today`
- `pages/inbox`
- `pages/_shared/LibrarySidebar`

A page may combine sibling features through props or render slots. Product logic should remain in the owning feature or domain module.

### Features

Current feature owners are:

```text
features/
├── activity/
├── capture/
├── library/
├── planning/
├── search/
└── workspace-authoring/
```

`workspace-authoring` is the largest feature because it owns the editor session, Note authoring, Canvas authoring, pane behavior, editor-specific commands, and granular save orchestration.

Important orchestration boundaries include:

- `features/library/save-workspace-core.ts` — conflict/rebase behavior for the aggregate Workspace compatibility save path;
- `features/planning/projection-state.ts` — pure Today/Inbox projection update rules;
- `features/workspace-authoring/document/document-image-actions.ts` — durable document-image insertion boundary;
- `features/workspace-authoring/canvas/canvas-assets.ts` — durable Canvas-image persistence boundary.

These modules exist so behavior with meaningful failure modes can be tested without mounting the full React tree.

### Domain

`apps/web/src/domain` contains framework-independent Notespace rules:

```text
domain/
├── activity/
├── code/
├── diagram/
├── document/
├── planning/
└── workspace/
```

Examples of domain-owned behavior:

- Workspace and Note shapes;
- autosave state transitions;
- Canvas merge/conflict rules;
- planning projection membership;
- diagram routing/layout rules;
- Markdown transformations;
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

HTTP adapters map frontend calls to the Go API.

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

The server is the durable owner of image assets. IndexedDB is a compatibility/read-through cache. An asset rejected because Workspace ownership disappeared is not treated as persisted, and authored document/Canvas references are only committed after durable storage succeeds.

## Authoring and consistency

### Granular Note and Canvas persistence

Primary authoring uses resource-specific writes:

```text
Note edit
  ↓
Note autosave queue
  ↓
PATCH Note with Note version
  ↓
SQLite transaction

Canvas edit
  ↓
Canvas autosave queue
  ↓
PATCH Canvas with Canvas version
  ↓
SQLite transaction
```

A stale Note conflicts with that Note instead of blocking an unrelated Note or Canvas.

Canvas has its own optimistic version and Excalidraw-specific element reconciliation.

### Aggregate compatibility save

The legacy/aggregate Workspace save path still exists for compatibility.

Its orchestration lives in `features/library/save-workspace-core.ts`:

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
- Note;
- Canvas;
- category behavior;
- authored-state validation;
- granular authoring use-cases;
- compatibility aggregate Workspace behavior.

#### `planning`

Owns:

- Milestones;
- Tasks;
- standalone Tasks;
- Today and Inbox semantics;
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

## Persistence model

Migration files remain append-only under `apps/server/migrations`.

The schema started with legacy `projects` and `study_sessions` names. Application terminology has since moved to Workspace and Activity, but old table names are not renamed merely for naming consistency because schema renames would add migration risk without changing product behavior.

Current persistence covers:

- Categories;
- Workspaces;
- granular Notes;
- granular Canvas;
- Workspace references;
- planning milestones/tasks;
- standalone tasks;
- activity sessions;
- durable assets and asset lifecycle;
- Trash snapshots;
- legacy history compatibility;
- FTS/search projection;
- migration metadata and integrity fingerprints.

### Derived search state

Authored state is authoritative; FTS rows are derived.

High-frequency granular Note saves may commit authored state before FTS refresh. Search detects stale projection metadata and repairs the index lazily.

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

Legacy browser `/projects/:id` redirects to the Workspace route.

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
