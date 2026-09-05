# Notespace — Product Contract

## Purpose

Notespace is a free, self-hosted knowledge workspace where structured notes and spatial thinking coexist without turning the library into a file explorer or analytics dashboard.

Primary product model:

```text
Notespace
└── Category
    └── Workspace
        ├── metadata
        ├── Notes[]
        ├── Canvas
        ├── authored history/checkpoints
        ├── durable image assets
        └── study activity
```

User-facing terminology is **Category → Workspace → Notes / Canvas**. Existing `project` package/API/storage names are compatibility implementation detail and must not leak back into new UI copy.

## Core user journeys

### Resume work
`Home → Recent workspaces → Workspace → Continue editing`

### Find knowledge
`Home → Global search → Category / Workspace / Note / Block → Exact context`

### Browse large knowledge collections
`Home → Category summary → Expand bounded preview → View all → Category detail → Search/filter/sort → Workspace`

### Focus work
`Workspace → Note / Canvas / Split → optional Focus mode → edit/save`

## Product invariants

- A Category is a library-level grouping and may contain many workspaces.
- A Workspace is the primary authored-content identity and lifecycle boundary.
- A Workspace may contain multiple durable notes plus one canvas surface.
- Notes and Canvas are workspace-owned surfaces, not independent top-level library products.
- Notespace does **not** provide cross-surface Send/Link semantics. Note and Canvas content remain independently authored surfaces inside the same workspace.
- Stable note block identity remains product-owned for exact-context search/deep links; it is not a relationship feature.
- Workspace authored state uses optimistic version conflict detection; stale writes fail rather than silently merging.
- A real version conflict stops autosave and requires explicit reload/recovery rather than blind retry.
- Image binaries are durable server-owned workspace assets. Browser IndexedDB may cache or migrate legacy assets but is not the source of truth.
- Study telemetry is separate from authored workspace snapshots.
- Notespace remains free and self-hosted by default. Do not add SaaS billing, hosted-service dependency, team admin, quota, or upgrade machinery without explicit product approval.

## Current implemented capability

- Category CRUD with non-empty deletion protection.
- Recent-first Home with collapsible library sidebar, global search, bounded category previews, and dedicated category detail browsing.
- Category detail server-side query, stable sorting, has-notes/has-canvas filters, and bounded pagination.
- Workspace create/open/rename/delete and same-category switching.
- Multiple durable notes per workspace with inline rename/delete and last-note protection.
- Tiptap structured writing with slash-command insertion.
- Excalidraw canvas with reduced chrome.
- Split workspace authoring with bounded pane tree: maximum four panes and one Canvas pane.
- Workspace/global search backed by a lazily synchronized SQLite FTS projection and exact note/block context.
- Server-owned image assets persisted in SQLite, read-through migration for legacy browser-only images, and asset-complete workspace ZIP export.
- Portable ZIP export and bounded workspace checkpoint history/restore.
- Automatic study sessions, daily activity, streak derivation, and history retained after workspace deletion.
- Explicit optimistic-conflict UX: network failures are retryable; true 409 conflicts stop autosave and require reload.
- Go + SQLite persistence and one-container self-hosted deployment.
- Stable Compose data volume via `NOTESPACE_DATA_VOLUME`; normal operations must not use `docker compose down -v`.

## Surface contracts

### Home
Home exists to resume, search, and progressively browse. It must not become a full file explorer, category manager, and analytics dashboard simultaneously.

Priority: resume/search → recent workspaces → category summaries → bounded expanded previews → secondary study activity.

### Category detail
Category detail is the scale surface for large workspace collections. Search/filter/sort/pagination belong here rather than expanding all data on Home.

### Workspace
Workspace is full-screen work context and does not retain the library sidebar. Note and Canvas panes may be split, resized, closed, or focused within the bounded pane model. Do not reintroduce Send/Link actions between surfaces.

### Notes
Notes are structured linear thinking surfaces owned by the workspace. Persisted Tiptap/editor-native state remains behind Notespace-owned note identity and snapshot contracts.

### Canvas
Canvas is the spatial thinking surface owned by the workspace. Excalidraw remains an adapter; renderer internals are not product identity.

## Current data/API compatibility

Backend code and routes still use `project` naming and retain the legacy `references` field in snapshots for compatibility. New product behavior keeps that field empty. Treat it as migration debt, not authorization to restore linking UI.

Material changes to workspace ownership, optimistic concurrency, persistence format compatibility, public API/data contracts, or durable asset ownership require explicit user approval.

## Self-hosting contract

- Prefer one deployable application/container.
- Keep durable data ownership and restart behavior explicit.
- Core editing must not require a hosted service.
- SQLite owns authored state, search projection metadata, study telemetry, history, and durable image assets.
- Secrets/configuration belong to deployment config, never authored content.
- Destructive/irreversible data changes require explicit approval and recovery planning.

## Design contract

Root `DESIGN.md` is authoritative. Keep the product clean, compact, content-forward, low-elevation, and free of generic SaaS/AI decoration.

## Non-goals unless explicitly promoted

- SaaS billing/hosting machinery;
- generic Notion-style database/wiki expansion;
- independent top-level Note or Canvas libraries;
- cross-surface Send/Link/semantic-card relationships;
- multiplayer/CRDT collaboration;
- teams/organizations/public sharing;
- AI assistant/generation as default product scope;
- microservices/event sourcing/distributed caches/external search services;
- plugin/template marketplace;
- productivity scores, XP, badges, leaderboards, or gamification-heavy study analytics.

## Scope rule

A future idea is not authorization. Promote new capability only through explicit user intent or an active milestone in `CURRENT_ITERATION.md`. Prefer core user pain and integrated workflow value over nice-to-have feature count.
