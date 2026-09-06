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

### Capture knowledge
`Home / Category → Quick Capture → Workspace → durable Note`

### Resume work
`Home → Recent workspaces → Workspace → Continue editing`

### Find knowledge
`Ctrl/Cmd + K / Home search → Category / Workspace / Note / Block → Exact context`

### Browse large knowledge collections
`Home → Category summary → Expand bounded preview → View all → Category detail → Search/filter/sort → Workspace`

### Focus work
`Workspace → Note / Canvas / Split → optional Focus mode → edit/save`

### Recover and own data
`Delete Workspace → Trash → Restore / Permanent delete`

`Library tools → Backup / Restore / Import Markdown vault`

### Deliberate recall
`Workspace → Ctrl/Cmd + K → choose Note recall → write from memory → reveal source`

## Product invariants

- A Category is a library-level grouping and may contain many workspaces.
- A Workspace is the primary authored-content identity and lifecycle boundary.
- A Workspace may contain multiple durable notes plus one canvas surface.
- Notes and Canvas are workspace-owned surfaces, not independent top-level library products.
- Quick Capture creates a workspace-owned Note; it does not introduce an Inbox or independent Note aggregate.
- Markdown is an interoperability format, not canonical persistence. Authored state remains the existing Tiptap/Workspace snapshot contract.
- Notespace does **not** provide cross-surface Send/Link semantics. Note and Canvas content remain independently authored surfaces inside the same workspace.
- Stable note block identity remains product-owned for exact-context search/deep links and heading navigation; it is not a relationship feature.
- Workspace authored state uses optimistic version conflict detection; stale writes fail rather than silently merging.
- A real version conflict stops autosave and requires explicit reload/recovery rather than blind retry.
- Image binaries are durable server-owned workspace assets. Browser IndexedDB may cache or migrate legacy assets but is not the source of truth.
- Deleting an active Workspace moves a complete recoverable snapshot into Trash; permanent deletion is a separate explicit action.
- Trash preserves Workspace identity, authored state, checkpoint history, and durable image assets. Study telemetry remains independently durable.
- A full-library Notespace backup is a versioned interoperability/recovery artifact. Categories, active Workspaces, Trash, history, assets, and study sessions are canonical backup data; FTS/search projection rows are derived and excluded.
- Backup restore is transactional and replaces the library only after format validation and successful persistence.
- Study telemetry is separate from authored workspace snapshots.
- Study tracking is user-controlled: Start, Pause/Resume, and End are explicit actions. Workspace open/close, tab visibility, and idle detection must not create, pause, or end a logical study session.
- A workspace may have multiple completed study sessions on the same day. Daily, weekly, streak, and lifetime totals derive from durable session activity rather than one mutable per-day counter.
- A logical manual session may cross midnight; persistence may split it into local-date segments for daily accounting without exposing an automatic End to the user.
- Deliberate Recall is ephemeral self-testing over an existing Note. It does not mutate authored content and does not create scores, grades, flashcards, schedules, XP, badges, or streak changes.
- Notespace remains free and self-hosted by default. Do not add SaaS billing, hosted-service dependency, team admin, quota, or upgrade machinery without explicit product approval.

## Current implemented capability

- Category CRUD with non-empty deletion protection, including protection while recoverable Trash still references the Category.
- Recent-first Home with collapsible library sidebar, bounded category previews, and dedicated category detail browsing.
- Library Quick Capture via `Ctrl/Cmd + Shift + N`, with remembered Workspace destination and Markdown file ingestion into a new workspace-owned Note.
- Category detail server-side query, stable sorting, has-notes/has-canvas filters, and bounded pagination.
- Workspace create/open/rename, recoverable delete to Trash, restore, and explicit permanent deletion.
- Multiple durable notes per workspace with inline rename/delete and last-note protection.
- Tiptap structured writing with slash-command insertion, heading-derived Outline navigation, and per-note human-readable Markdown export.
- Excalidraw canvas with reduced chrome.
- Split workspace authoring with bounded pane tree: maximum four panes and one Canvas pane.
- Universal `Ctrl/Cmd + K` Quick Open from Home, Category, and Workspace, reusing the existing FTS retrieval path and exact note/block deep links.
- Workspace/global search backed by a lazily synchronized SQLite FTS projection and exact note/block context.
- Server-owned image assets persisted in SQLite, read-through migration for legacy browser-only images, and asset-complete workspace ZIP export.
- Versioned full-library JSON backup and transactional restore covering Categories, active Workspaces, Trash, checkpoint history, image assets, and study sessions.
- Bulk Markdown folder/vault import into a chosen Category, including selected relative image assets referenced by standalone Markdown image syntax.
- Portable workspace ZIP export and bounded workspace checkpoint history/restore.
- Optional single-owner remote protection through `NOTESPACE_PASSWORD` with fixed username `notespace`; health probing remains unauthenticated. Remote Basic authentication requires HTTPS termination at the deployment edge.
- Manual workspace study sessions with explicit Start, Pause/Resume, and End; multiple sessions per day, local-date activity, streak derivation, and history retained after workspace deletion.
- Ephemeral deliberate-recall flow: write from memory with source hidden, then reveal the selected Note for self-comparison.
- Explicit optimistic-conflict UX: network failures are retryable; true 409 conflicts stop autosave and require reload.
- Go + SQLite persistence and one-container self-hosted deployment.
- Stable Compose data volume via `NOTESPACE_DATA_VOLUME`; normal operations must not use `docker compose down -v`.

## Surface contracts

### Home
Home exists to capture, resume, search, and progressively browse. It must not become a full file explorer, category manager, and analytics dashboard simultaneously.

Priority: quick capture/resume/search → recent workspaces → category summaries → bounded expanded previews → secondary study activity. Destructive recovery, whole-library backup/restore, and migration belong in the compact Library tools surface rather than becoming dashboard sections.

### Category detail
Category detail is the scale surface for large workspace collections. Search/filter/sort/pagination belong here rather than expanding all data on Home. Quick Capture may target any existing Workspace without changing category navigation.

### Workspace
Workspace is full-screen work context and does not retain the library sidebar. Note and Canvas panes may be split, resized, closed, or focused within the bounded pane model. Universal Quick Open remains available without reintroducing the library sidebar. Do not reintroduce Send/Link actions between surfaces.

### Notes
Notes are structured linear thinking surfaces owned by the workspace. Persisted Tiptap/editor-native state remains behind Notespace-owned note identity and snapshot contracts. Long-note navigation is derived from current heading nodes and stable block IDs; Markdown import/export is an adapter around this state rather than an alternate source of truth.

### Canvas
Canvas is the spatial thinking surface owned by the workspace. Excalidraw remains an adapter; renderer internals are not product identity.

### Library tools
Library tools owns whole-library recovery/portability operations: Trash, full backup/restore, and bulk Markdown migration. It must remain compact and operational rather than becoming a settings/dashboard product.

## Current data/API compatibility

Backend code and routes still use `project` naming and retain the legacy `references` field in snapshots for compatibility. New product behavior keeps that field empty. Treat it as migration debt, not authorization to restore linking UI.

Material changes to workspace ownership, optimistic concurrency, persistence format compatibility, public API/data contracts, or durable asset ownership require explicit user approval.

## Self-hosting contract

- Prefer one deployable application/container.
- Keep durable data ownership and restart behavior explicit.
- Core editing must not require a hosted service.
- SQLite owns authored state, search projection metadata, study telemetry, history, durable image assets, and recoverable Trash snapshots.
- `NOTESPACE_PASSWORD` is an optional single-owner deployment gate, not an account/identity system.
- Secrets/configuration belong to deployment config, never authored content or backup payloads.
- Destructive/irreversible data changes require explicit approval and recovery planning.

## Design contract

Root `DESIGN.md` is authoritative. Keep the product clean, compact, content-forward, low-elevation, and free of generic SaaS/AI decoration.

## Non-goals unless explicitly promoted

- SaaS billing/hosting machinery;
- generic Notion-style database/wiki expansion;
- independent top-level Note or Canvas libraries;
- cross-surface Send/Link/semantic-card relationships;
- multiplayer/CRDT collaboration;
- teams/organizations/public sharing, registration, RBAC, OAuth, or SSO;
- AI assistant/generation as default product scope;
- microservices/event sourcing/distributed caches/external search services;
- plugin/template marketplace or vendor-specific importer framework;
- flashcard database or spaced-repetition scheduler;
- productivity scores, XP, badges, leaderboards, or gamification-heavy study analytics.

## Scope rule

A future idea is not authorization. Promote new capability only through explicit user intent or an active milestone in `CURRENT_ITERATION.md`. Prefer core user pain and integrated workflow value over nice-to-have feature count.
