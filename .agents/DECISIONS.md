# Notespace — Durable Decisions

Record only material decisions whose rationale should constrain future work. Active execution belongs in `CURRENT_ITERATION.md`; generic workflow rules do not belong here.

## D001 — Workspace is the authored-content aggregate

**Status:** Accepted; supersedes the original user-facing “Project” terminology  
**Date:** 2026-09-03

Notespace exposes Category → Workspace as the user-facing model. A workspace owns its notes, canvas, metadata, authored history, and cross-surface relationship state.

Existing `Project`, `/api/projects`, `internal/project`, and related storage names remain implementation compatibility detail.

**Why:** the product is a unified linear + spatial thinking workspace. “Project” obscured the library hierarchy after categories became first-class.

**Consequences:**

- do not create independently managed top-level Note/Canvas products without explicit approval;
- do not reintroduce “Project” into new UI copy because legacy internals use it;
- do not perform a broad internal rename unless the compatibility cost is explicitly worth it;
- cross-surface relationships belong to the workspace/product domain.

## D002 — Single self-hosted deployable by default

**Status:** Accepted  
**Date:** 2026-09-01

Use one Go-served application/container for the current product. Built web assets and same-origin API are composed into the same deployable.

**Consequences:** service splits, queues, hosted dependencies, or extra runtime processes require concrete evidence and approval when they alter architecture/deployment boundaries.

## D003 — Tiptap and Excalidraw are adapters, not the domain

**Status:** Accepted  
**Date:** 2026-09-01

Use Tiptap for structured notes and Excalidraw for the canvas behind Notespace-owned boundaries.

**Consequences:** editor-native payloads may be stored in versioned snapshots, but product identity/relationships must remain Notespace-owned. Replacing either primary editor is material.

## D004 — SQLite persistence with optimistic workspace versioning

**Status:** Accepted  
**Date:** 2026-09-01

Use Go `database/sql` with pure-Go `modernc.org/sqlite`, explicit SQL, embedded migrations, one connection, WAL, and FULL synchronous mode. Existing project-named update contracts use optimistic version conflict detection.

**Consequences:** stale writes conflict rather than auto-merge. Persistence technology, conflict semantics, or destructive migration changes are material and durability claims require restart/reopen evidence.

## D005 — Verification is boundary- and risk-proportional

**Status:** Accepted; refines the original unconditional production-composition gate  
**Date:** 2026-09-03

Use the narrowest evidence that can prove the changed behavior, while preserving expensive integration/restart gates for boundaries that actually need them.

**Evidence:** earlier production-composition failures proved browser + Go serving + Docker/restart checks are essential for cross-stack/runtime/durability changes, but running those gates for unrelated docs or isolated boundaries adds latency without additional signal.

**Consequences:**

- keep one stable GitHub `Verify` check;
- web/UI changes require web static/unit checks plus browser verification against the real Go server;
- Go changes require gofmt/vet/race/build;
- HTTP boundary changes consumed by the web also require browser verification;
- persistence/migration/Compose/runtime changes require production Compose + restart smoke;
- docs/agent metadata do not require unrelated application builds;
- changes to the workflow definition itself execute the full gate once;
- never weaken a relevant assertion merely to make CI green.

## D006 — Taskfile is the repository orchestration entrypoint

**Status:** Accepted  
**Date:** 2026-09-02

Use `Taskfile.yml` as the repo-level command surface for development, checks, build, E2E, and Compose operations. Do not add Turborepo or another orchestrator without measured dependency-graph/build need.

## D007 — Cross-surface relationships use product-owned stable identity

**Status:** Accepted  
**Date:** 2026-09-01

Note/block ↔ canvas relationships use Notespace-owned stable IDs/relationship state.

Rejected identity sources include visible text, DOM/document position, canvas coordinates, and incidental editor identity that Notespace does not control.

Missing targets remain explicit/recoverable rather than being silently relinked.

## D008 — Visual direction is restrained, content-first tooling

**Status:** Accepted and expanded by root `DESIGN.md`  
**Date:** 2026-09-03

Notespace uses a clean, compact, minimalist, content-forward tool aesthetic with light/dark support, restrained steel-blue accent, low elevation, and purposeful motion/effects.

**Consequences:**

- decision order is Product Intent → Information Hierarchy → Interaction Model → Visual Hierarchy → Components → Decoration;
- avoid generic AI/SaaS slop, gratuitous gradients/glow/shine, excessive glass/card nesting, decorative bento, and low-density dashboards;
- Home uses progressive disclosure; large category browsing belongs on category detail;
- Workspace does not retain library sidebar chrome;
- automated UI tests protect hierarchy/interaction/accessibility rather than exact pixels.

## D009 — Category groups many workspaces

**Status:** Accepted  
**Date:** 2026-09-03

Categories are the library-level grouping. A category may contain many workspaces; each workspace owns multiple notes and one canvas.

**Consequences:**

- Home shows category summaries and bounded previews rather than every workspace at once;
- large collections move to category detail search/filter/sort/pagination;
- existing persisted workspaces can remain compatible through legacy storage/API naming;
- the workspace editor remains the full-screen focus surface.
