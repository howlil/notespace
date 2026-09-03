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
        ├── cross-surface relationships
        ├── authored history/checkpoints
        └── study activity
```

User-facing terminology is **Category → Workspace → Notes / Canvas**. Existing `project` package/API/storage names are compatibility implementation detail and must not leak back into new UI copy.

## Core user journeys

### Resume work

```text
Home → Recent workspaces → Workspace → Continue editing
```

### Find knowledge

```text
Home → Global search → Category / Workspace / Note / Block → Exact context
```

### Browse large knowledge collections

```text
Home → Category summary → Expand bounded preview → View all → Category detail → Search/filter/sort → Workspace
```

### Focus work

```text
Workspace → Note / Canvas / Split → optional Focus mode → edit/save
```

## Product invariants

- A Category is a library-level grouping and may contain many workspaces.
- A Workspace is the primary authored-content identity and lifecycle boundary.
- A Workspace may contain multiple durable notes plus one canvas surface.
- Notes and Canvas are workspace-owned surfaces, not independent top-level library products.
- Cross-surface relationships are Notespace-owned and use stable product identity rather than visible text, mutable positions, or canvas coordinates.
- Workspace authored state uses optimistic version conflict detection; stale writes fail rather than silently merging.
- Study telemetry is separate from authored workspace snapshots.
- Notespace remains free and self-hosted by default. Do not add SaaS billing, hosted-service dependency, team admin, quota, or upgrade machinery without explicit product approval.

## Current implemented capability

The repository currently supports:

- Category CRUD with non-empty deletion protection.
- Recent-first Home with collapsible library sidebar, global search, bounded category previews, and dedicated category detail browsing.
- Category detail server-side query, stable sorting, has-notes/has-canvas filters, and bounded pagination.
- Workspace create/open/rename/delete and same-category switching.
- Multiple durable notes per workspace with inline rename/delete and last-note protection.
- Tiptap structured writing with slash-command insertion.
- Excalidraw canvas with reduced chrome.
- Split / Note / Canvas workspace views and reversible Focus mode.
- Product-owned note-block ↔ canvas relationships and navigation.
- Workspace/global search that can open exact note/block context.
- Portable ZIP export and bounded workspace checkpoint history/restore.
- Automatic study sessions, daily activity, streak derivation, and history retained after workspace deletion.
- Go + SQLite persistence and one-container self-hosted deployment.
- Stable Compose data volume via `NOTESPACE_DATA_VOLUME`; normal operations must not use `docker compose down -v`.

## Surface contracts

### Home

Home exists to resume, search, and progressively browse. It must not become a full file explorer, category manager, and analytics dashboard simultaneously.

Priority:

1. resume/search;
2. recent workspaces;
3. category summaries;
4. bounded expanded previews;
5. secondary study activity.

The sidebar is library navigation only and may collapse. Avoid duplicate navigation/action surfaces.

### Category detail

Category detail is the scale surface for large workspace collections. Search/filter/sort/pagination belong here rather than expanding all data on Home.

### Workspace

Workspace is full-screen work context and does not retain the library sidebar. Note, Canvas, and Split are workspace views. Workspace chrome may hide in Focus mode but must remain immediately restorable.

### Notes

Notes are structured linear thinking surfaces owned by the workspace. Persisted Tiptap/editor-native state remains behind Notespace-owned note identity and snapshot contracts.

### Canvas

Canvas is the spatial thinking surface owned by the workspace. Excalidraw remains an adapter; renderer internals are not product identity.

## Current data/API compatibility

Backend code and routes still use `project` naming in places for compatibility. Treat this as internal debt, not authorization for user-facing Project terminology.

Material changes to workspace ownership, optimistic concurrency, persistence format compatibility, public API/data contracts, or cross-surface identity require explicit user approval.

## Self-hosting contract

- Prefer one deployable application/container.
- Keep durable data ownership and restart behavior explicit.
- Core editing must not require a hosted service.
- Secrets/configuration belong to deployment config, never authored content.
- Destructive/irreversible data changes require explicit approval and recovery planning.

## Design contract

Root `DESIGN.md` is authoritative for visual/interaction quality.

Summary direction:

- clean, compact, minimalist, restrained, content-forward;
- product-specific hierarchy before decoration;
- restrained steel-blue accent, neutral dominant surfaces, low elevation;
- no generic AI/SaaS slop, gratuitous glow/gradient/glass/bento/card nesting;
- reuse existing tokens and behavior primitives before inventing new systems;
- automated UI verification protects hierarchy/interaction/accessibility rather than exact pixels.

## Non-goals unless explicitly promoted

- SaaS billing/hosting machinery;
- generic Notion-style database/wiki expansion;
- independent top-level Note or Canvas libraries;
- multiplayer/CRDT collaboration;
- teams/organizations/public sharing;
- AI assistant/generation as default product scope;
- microservices/event sourcing/distributed caches;
- plugin/template marketplace;
- productivity scores, XP, badges, leaderboards, or gamification-heavy study analytics.

## Scope rule

A future idea is not authorization. Promote new capability only through explicit user intent or an active milestone in `CURRENT_ITERATION.md`. Prefer core user pain and integrated workflow value over nice-to-have feature count.
