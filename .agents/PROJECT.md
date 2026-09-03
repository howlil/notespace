# Notespace — Project Product Contract

## Purpose

Notespace is a free, self-hosted thinking library where linear writing and spatial drawing coexist inside a **workspace**.

The product model is intentionally not “a notes app plus a whiteboard app.” A category groups related workspaces; each workspace owns one document and one canvas as first-class interaction surfaces.

## Core product model

```text
Notespace
└── Category
    └── Workspace
        ├── metadata
        ├── document surface
        ├── canvas surface
        ├── study activity sessions
        └── workspace state
```

### Invariants

- `Category` is the library-level grouping and may contain many workspaces.
- `Workspace` is the primary editable-content identity and lifecycle boundary.
- Document and canvas are sibling surfaces of one workspace, not independently managed top-level resources.
- Internally normalized/editor-native state must not leak into the product model as separate `Note` and `Canvas` products.
- Notespace is free and self-hosted. Do not introduce SaaS plans, billing, quotas, upgrade prompts, team administration, or cloud-first assumptions without an explicit product decision.
- Study activity may summarize time, streak, and history, but the interface should remain a quiet, content-forward tool rather than an analytics/admin dashboard or generic AI productivity product.

## Current implemented baseline

The current repository implements the first usable self-hosted category/workspace workflow:

```text
Dashboard
  → create/open Category
  → create/open Workspace in that category
  → edit document + canvas
  → autosave
  → reload/reopen with durable state
```

Implemented product behavior includes:

- category creation/listing and workspace creation, listing, open, update, and permanent delete with confirmation;
- a Tiptap-based structured document surface;
- an Excalidraw-based freeform canvas surface;
- one full-width, resizable workspace with both surfaces visible together;
- durable project snapshots with optimistic version conflict detection;
- visible save failure/retry behavior and unload protection for unsaved changes;
- light/dark theme foundation;
- self-hosted Docker packaging with Go + SQLite persistence.
- automatic study sessions with idle/visibility handling, cumulative heartbeat persistence, daily activity, streak derivation, and history that survives workspace deletion.

Favorites, trash/restore, templates, AI, collaboration, authentication/teams, export/import, structured diagrams, and semantic cross-surface relationships are not part of that completed baseline unless a current milestone explicitly brings one into scope.

Study activity explicitly excludes Pomodoro controls, manual time entry, goals, notifications, XP/badges, leaderboards, productivity scores, streak freezes, calendar integration, social comparison, and AI study analysis.

## Product behavior

### Dashboard / library

The dashboard exists to resume or begin work quickly. Its primary jobs are:

1. see categories and the workspaces inside them;
2. create a category or a workspace within it;
3. open a workspace;
4. perform only currently implemented workspace lifecycle actions.

Do not create separate global navigation for Notes and Canvases.

### Workspace

The workspace is one full-width shell containing the document and canvas surfaces. It deliberately has no library sidebar; desktop uses a resizable split and narrow layouts may stack the same surfaces rather than creating a separate product mode.

Workspace-level navigation, layout state, save state, and future utilities belong to the workspace shell, not to either editor integration.

### Document surface

The document surface is the linear thinking representation of a workspace. The current implementation uses Tiptap snapshots and supports structured technical writing such as paragraphs, headings, lists, code, and formatting exposed by the UI.

### Canvas surface

The canvas surface is the spatial thinking representation of a workspace. Excalidraw is the current primary freeform editor. It is an implementation dependency behind a Notespace-owned integration boundary, not the Notespace domain model.

### Cross-surface interoperability

The approved direction for Milestone 2 is to let document blocks and canvas objects refer to the same ideas through **Project-owned stable identity and relationships**.

Required semantic constraint:

- product-owned IDs/relationships are authoritative;
- editor labels, document positions, canvas coordinates, and renderer-native incidental identity are not relational identity.

The exact active slice and its current completion state live only in `CURRENT_ITERATION.md`.

## Current server contract

The current workspace aggregate exposed by the backend contains:

- `id`, `categoryId`, `title`, timestamps, and optimistic `version`;
- versioned `document` snapshot with format `tiptap`;
- versioned `canvas` snapshot with format `excalidraw`;
- `splitRatio` constrained by the current server to `0.25..0.70`.

A workspace update is a complete authored snapshot guarded by its version. Concurrent stale updates fail as conflicts rather than being merged automatically.

Any material change to this public/data contract, concurrency semantics, or Project ownership model requires explicit user approval.

## Self-hosting contract

The default product remains simple to operate locally/self-hosted:

- one deployable application/container is preferred;
- persistent user data must have explicit ownership and backup implications;
- no hosted service is required for core Project editing;
- secrets/configuration belong to deployment configuration, never Project content;
- destructive or irreversible data changes require explicit review.

## Design direction

Reference exploration: `https://www.figma.com/design/qS29iOvAMP0MDeS8YJpTIY`

Durable visual constraints:

- calm, precise, editor/tool-like, content-forward;
- light and dark mode capable;
- Geist typography in the current implementation;
- restrained accents and low elevation;
- visual effects only when they communicate hierarchy, focus, selection, or layering;
- avoid giant gradients, neon glow, gratuitous shine, excessive glass cards, decorative sparkles, oversized empty cards, and other generic “AI slop” patterns;
- do not add dashboard widgets, marketing surfaces, or decorative complexity without a product need.

Repository behavior and explicit user decisions outrank exploratory Figma details.

## Non-goals unless explicitly promoted into scope

- Notion-style database/wiki expansion;
- an Excalidraw wrapper as the entire product identity;
- Eraser/structured-diagram engine as the primary canvas;
- AI generation/assistant features;
- multiplayer collaboration or CRDT architecture;
- teams/organizations/public sharing;
- SaaS billing/hosting machinery;
- microservices, event sourcing, distributed caches, or speculative infrastructure;
- plugin/template marketplaces;
- analytics/productivity scoring.

## Open/deferred decisions

These are not implementation authorization by themselves:

- authentication/authorization model;
- import/export and backup UX beyond existing persistence guarantees;
- structured semantic diagram support;
- favorites, trash/restore, and templates;
- future cross-surface relationship expansion beyond the bounded active milestone;
- any hosted/cloud distribution model.

Promote an item only through explicit user intent or a bounded milestone recorded in `CURRENT_ITERATION.md`.
