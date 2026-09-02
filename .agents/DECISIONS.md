# Notespace — Durable Decisions

Record only material decisions whose rationale should constrain future work. Active execution detail belongs in `CURRENT_ITERATION.md`; generic workflow rules do not belong here.

## D001 — Project is the product aggregate

**Status:** Accepted
**Date:** 2026-09-01

Notespace exposes one Project identity that owns document, canvas, metadata, and relevant workspace state.

**Why:** the product is a unified linear + spatial thinking workspace, not two independent applications/resources.

**Consequences:**

- do not create independently managed top-level Note/Canvas resources without explicit product approval;
- cross-surface relationships belong to the Project domain;
- editor/storage normalization may differ internally without changing product ownership.

## D002 — Single self-hosted deployable by default

**Status:** Accepted  
**Date:** 2026-09-01

Use one Go-served application/container for the current product. The built web assets and same-origin API are composed into the same deployable.

**Why:** self-hosting benefits from low operational complexity and current requirements do not justify service separation.

**Consequences:** service splits, queues, hosted dependencies, or extra runtime processes require concrete evidence and user approval when they alter architecture/deployment boundaries.

## D003 — Tiptap and Excalidraw are adapters, not the domain

**Status:** Accepted  
**Date:** 2026-09-01

Use Tiptap for the structured document surface and Excalidraw for the freeform canvas surface behind Notespace-owned boundaries.

**Why:** mature editors solve interaction mechanics while Notespace differentiation is Project identity, persistence, navigation, and linear/spatial interoperability.

**Consequences:**

- editor-native payloads may be stored in versioned snapshots;
- product code should not depend broadly on editor internals;
- replacing either primary editor is a material architecture/product decision.

## D004 — SQLite persistence with optimistic Project versioning

**Status:** Accepted  
**Date:** 2026-09-01

Use Go `database/sql` with pure-Go `modernc.org/sqlite`, explicit SQL, embedded migrations, one connection, WAL, and FULL synchronous mode. Project updates use optimistic version conflict detection.

**Why:** this keeps the self-hosted runtime simple and CGO-free while providing durable local persistence and explicit concurrency failure semantics.

**Consequences:**

- stale concurrent updates conflict rather than auto-merge;
- changing persistence technology, conflict semantics, or destructive migration behavior is material;
- durability claims must be verified through restart/reopen behavior.

## D005 — Production-composition verification is a release gate

**Status:** Accepted  
**Date:** 2026-09-01

Meaningful cross-stack/runtime changes are not considered fully verified solely by isolated package tests.

**Evidence:** Sprint 1 exposed defects only in final composition: HTTP/API + SPA route assembly, direct-route hydration, and Docker localhost/address-family behavior.

**Consequences:** keep browser tests against the built app served by Go and Docker startup/restart persistence smoke in the release-quality path when those boundaries are affected.

## D006 — Taskfile is the repository orchestration entrypoint

**Status:** Accepted  
**Date:** 2026-09-02

Use `Taskfile.yml` as the repo-level command surface for development, checking, building, E2E verification, and Compose operations. Keep pnpm and Go commands underneath rather than adding Turborepo for the current two-app polyglot repository.

**Why:** the repository needs cross-language orchestration, not a JS-only build graph/caching layer. Taskfile keeps the command surface small and explicit.

**Consequences:** add another orchestrator only when measured build/dependency-graph needs justify the extra system.

## D007 — Cross-surface relationships use product-owned stable identity

**Status:** Accepted for Milestone 2  
**Date:** 2026-09-01

Document ↔ canvas relationships are identified by Notespace-owned stable IDs/relationship state.

**Rejected identity sources:**

- visible text/labels;
- DOM/document positions;
- canvas coordinates;
- renderer/editor incidental identity that Notespace does not control.

**Why:** references must survive ordinary editing, normalization, reload, Project switching, and restart.

**Consequences:**

- start with supported text-oriented Tiptap blocks;
- missing targets remain recoverable broken references rather than being silently relinked;
- Tiptap/Excalidraw adapters expose focused lookup/focus/metadata capabilities without owning relationship truth.

## D008 — Visual direction is restrained, content-first tooling

**Status:** Accepted  
**Date:** 2026-09-01

Notespace uses a calm editor/tool aesthetic with light/dark support, restrained accents, low elevation, and current Geist typography.

**Why:** the product should foreground thinking content and avoid resembling a SaaS analytics dashboard or generic AI productivity template.

**Consequences:** avoid gratuitous gradients/glow/shine, excessive glass cards, decorative widgets, and marketing-style UI unless a concrete hierarchy/interaction need justifies them.

## D009 — Category groups many workspaces

**Status:** Accepted
**Date:** 2026-09-03

Categories are the library-level user-facing grouping. Each workspace owns exactly one document and one canvas; a category may own many workspaces.

**Why:** a body of learning or work commonly has multiple distinct thinking spaces. Treating each one as a top-level project made the home screen duplicate navigation and obscured that relationship.

**Consequences:**

- the library presents categories and their nested workspaces rather than a flat project feed;
- the workspace editor is full-width and does not retain the library sidebar;
- existing persisted workspaces migrate safely into the `Uncategorized` category;
- the existing `projects` API/storage naming remains an implementation compatibility detail while the user-facing model is Category → Workspace.
