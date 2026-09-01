# Notespace — Project Product Contract

## Purpose

Notespace is a free, self-hosted thinking workspace where linear writing and spatial drawing coexist inside one **Project**.

The product model is intentionally not “a notes app plus a whiteboard app.” A user works on one Project; the document and canvas are two first-class interaction surfaces owned by that same Project.

## Core product model

```text
Notespace
└── Project
    ├── metadata
    ├── document surface
    ├── canvas surface
    └── workspace state
```

### Invariants

- `Project` is the primary user-facing content identity and lifecycle boundary.
- Document and canvas are sibling surfaces of one Project, not independently managed top-level resources.
- Internally normalized/editor-native state must not leak into the product model as separate `Note` and `Canvas` products.
- Notespace is free and self-hosted. Do not introduce SaaS plans, billing, quotas, upgrade prompts, team administration, or cloud-first assumptions without an explicit product decision.
- The interface should remain a quiet, content-forward tool rather than an analytics/admin dashboard or generic AI productivity product.

## Current implemented baseline

The current repository implements the first usable self-hosted Project workflow:

```text
Dashboard
  → create/search/open Project
  → Project workspace
  → edit document + canvas
  → autosave
  → reload/reopen with durable state
```

Implemented product behavior includes:

- Project creation, listing, title search, open, update, and permanent delete with confirmation;
- a Tiptap-based structured document surface;
- an Excalidraw-based freeform canvas surface;
- one resizable Project workspace with both surfaces visible together;
- durable project snapshots with optimistic version conflict detection;
- visible save failure/retry behavior and unload protection for unsaved changes;
- light/dark theme foundation;
- self-hosted Docker packaging with Go + SQLite persistence.

Favorites, trash/restore, templates, AI, collaboration, authentication/teams, export/import, structured diagrams, and semantic cross-surface relationships are not part of that completed baseline unless a current milestone explicitly brings one into scope.

## Product behavior

### Dashboard / library

The dashboard exists to resume or begin work quickly. Its primary jobs are:

1. find recent/all Projects;
2. search Projects;
3. create a Project;
4. open a Project;
5. perform only currently implemented Project lifecycle actions.

Do not create separate global navigation for Notes and Canvases.

### Project workspace

The workspace is one Project shell containing the document and canvas surfaces. Desktop uses a resizable split; narrow layouts may stack the same surfaces rather than creating a separate product mode.

Project-level navigation, layout state, save state, and future utilities belong to the Project shell, not to either editor integration.

### Document surface

The document surface is the linear thinking representation of a Project. The current implementation uses Tiptap snapshots and supports structured technical writing such as paragraphs, headings, lists, code, and formatting exposed by the UI.

### Canvas surface

The canvas surface is the spatial thinking representation of a Project. Excalidraw is the current primary freeform editor. It is an implementation dependency behind a Notespace-owned integration boundary, not the Notespace domain model.

### Cross-surface interoperability

The approved direction for Milestone 2 is to let document blocks and canvas objects refer to the same ideas through **Project-owned stable identity and relationships**.

Required semantic constraint:

- product-owned IDs/relationships are authoritative;
- editor labels, document positions, canvas coordinates, and renderer-native incidental identity are not relational identity.

The exact active slice and its current completion state live only in `CURRENT_ITERATION.md`.

## Current server contract

The current Project aggregate exposed by the backend contains:

- `id`, `title`, timestamps, and optimistic `version`;
- versioned `document` snapshot with format `tiptap`;
- versioned `canvas` snapshot with format `excalidraw`;
- `splitRatio` constrained by the current server to `0.25..0.70`.

A Project update is a complete authored snapshot guarded by the Project version. Concurrent stale updates fail as conflicts rather than being merged automatically.

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
