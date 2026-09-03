# Current Iteration — M9: Scalable Knowledge Navigation & Discovery

## Status

- **Milestone:** M9 — Scalable Knowledge Navigation & Discovery
- **Milestone state:** IMPLEMENTED / CODE + BACKEND VERIFIED; BROWSER ACCEPTANCE PENDING
- **Active slices:** Home progressive disclosure; category detail browser; global/scoped discovery and consistent actions
- **Integrated through:** local working tree; ready to merge to `master`
- **Blocker:** The Playwright Chromium binary and Docker are not available in the current execution environment; Go verification runs through repository-local tooling.

## Why this milestone exists

The category/workspace foundation still exposed too much wrapper UI: the workspace was visually clipped, the editor had redundant chrome, and the dashboard carried navigation/copy that did not help a small product.

## Delivered in the current working tree

- Study telemetry is a separate domain and SQLite `study_sessions` table; authored workspace snapshots remain isolated from timer writes.
- Workspace tracking starts automatically, uses cumulative idempotent heartbeats, pauses for hidden/idle/manual states, and closes on route cleanup.
- Workspace header exposes a compact current-day indicator with current session, today, total, and pause/resume controls.
- Dashboard exposes Today, This week, derived streak, a 365-day activity heatmap, and click-through workspace breakdowns.
- Activity history uses a workspace title snapshot so deleting a workspace does not erase learning history.
- Study days require 10 active minutes for streak calculations; gamification and manual time entry remain out of scope.

- Dashboard is a compact category list without a sidebar, redundant library copy, duplicate actions, or always-visible delete links.
- Workspace fills the viewport with no document/canvas headers or footer chrome and supports `Split`, `Note`, and `Canvas` views.
- Workspace navigation includes same-category workspace switching and inline rename with Enter, Escape, and blur behavior.
- Notes support multiple durable documents per workspace through `notes[]`; existing workspaces receive a default `Untitled` note through migration/backward-compatible fallback.
- Active notes can be renamed inline or deleted with confirmation; the last remaining note is protected and references to deleted note blocks are cleaned up.
- Fixed document formatting toolbar is replaced with keyboard-accessible slash commands for headings, lists, quote, code, divider, and checklist blocks.
- Canvas controls are visually reduced and the bottom menu/ring treatment is removed; empty states remain direct and actionable.
- Workspace title editing stays inline without a bordered/ring treatment.
- Workspace `Focus mode` hides the top header for `Split`, `Note`, and `Canvas`; a small restore control and `Escape` keep the transition reversible.
- Category and workspace creation use compact inline quick-create forms with Enter/Add submission instead of a modal step.
- Category and workspace rename/delete actions now use inline, underline-only controls; non-empty category deletion is rejected to prevent accidental cascade loss.
- Slash-command Insert block options include semantic icons so each block type is scannable.
- Compose uses an explicit stable physical data-volume name via `NOTESPACE_DATA_VOLUME`; redeploys must keep that value and must not use `docker compose down -v`.
- M5 adds selected-block promotion to a valid semantic canvas card, canvas-to-note promotion, note-aware durable references, and source-preserving card metadata. The canvas adapter synchronizes externally-created elements into the live scene.
- M6 adds workspace-wide search with parent block context and opens the selected note/block through URL context; search failures are visible instead of appearing as empty results.
- M7 adds portable ZIP export (`manifest.json`, individual notes, canvas, canvas files, and relationships) and validated HTTP(S) source capture on canvas; image/file insertion continues through Excalidraw's native canvas flow.
- M8 adds an initial and bounded SQLite workspace checkpoint history, atomic authored-update checkpoints, content metadata preview, and restore error handling.
- M8 history storage now separates high-frequency autosave from durable checkpoints: layout-only and rapid no-op checkpoints are skipped, authored snapshots are deduplicated with SHA-256 metadata, and new payloads are stored as zlib-compressed BLOBs with a legacy 0006 decoder fallback.
- Workspace deletion removes checkpoint metadata and payload rows in the same transaction; checkpoint insertion, retention pruning, and authored workspace update commit or roll back together.

- M9 Home is recent-first and summary-first: categories are collapsed by default, expanded categories show at most five recent workspaces, and large collections move to a dedicated category browser.
- M9 category browsing has a server-side category workspace endpoint with scoped query, stable sorting, has-notes/has-canvas filters, bounded pages, and content metadata for dense rows.
- M9 global search now returns category, workspace, note, and exact block result types; Home exposes a keyboard-accessible `Cmd/Ctrl+K` focus shortcut, and category/workspace actions use consistent overflow menus.

## Evidence so far

- `pnpm --filter @notespace/web typecheck` — PASS
- `pnpm --filter @notespace/web build` — PASS
- `pnpm lint` — PASS
- `pnpm test` — PASS (3 tests)
- `git diff --check` — PASS
- Targeted Playwright journeys — UPDATED but NOT RUN: Chromium is unavailable
- Focus-mode interaction coverage — UPDATED but NOT RUN: Chromium is unavailable
- `go test ./...` — PASS via repository tooling
- `go vet ./...` — PASS via repository tooling
- `go build ./...` — PASS via repository tooling
- M8 storage policy tests — PASS: initial checkpoint, rapid/layout dedupe, compressed payload, legacy-compatible restore, and delete cleanup.
- M9 category browser API coverage — PASS: scoped search, stable sort, pagination metadata, and large-collection response shape.
- Playwright E2E — NOT RUN: Chromium is unavailable

## Additional fix evidence

- Frontend typecheck, production build, lint, frontend unit tests, and `git diff --check` — PASS.
- Backend API coverage added for category/workspace rename, inline-management deletion behavior, and non-cascading category deletion.
- Docker checks — NOT RUN: Docker is unavailable in the current environment.

## Next action

Run the M9 golden path with a large synthetic dataset when Chromium is available. E2E remains the only deferred release check; code and backend integration gates are green.

## Previous Milestone Record

The Milestone 1 workspace already placed a document and canvas inside one Project, but the two surfaces had no durable semantic relationship.

Milestone 2 adds that relationship while keeping Notespace Project state—not Tiptap or Excalidraw internals—as the product source of truth.

## Delivered outcome

A user can:

- edit supported Tiptap blocks with stable product-owned block IDs;
- select a supported document block and a canvas object and create a Project-owned reference;
- navigate from a selected document block to its linked canvas object;
- navigate from a selected canvas object to its linked document block;
- continue editing without changing the relationship identity;
- reload or switch Projects and recover the persisted relationship;
- keep a relationship as an explicit recoverable broken reference when its target is deleted;
- remove a broken relationship explicitly instead of Notespace silently relinking it;
- restart the self-hosted container without losing the Project relationship state.

## Completed slices

### Slice 1 — Stable document block identity — COMPLETE

Delivered through PR #2 (`feat: add stable document block identities`).

Evidence:

- supported paragraphs, headings, code blocks, and list items receive stable Notespace-owned `blockId` values;
- existing snapshots without IDs remain readable and are normalized through the document integration;
- browser coverage verifies IDs survive edit + reload;
- final PR head `6bbc1fee872f0a123575eed761af5f8c403dca23` passed Verify run #28;
- integrated on `master` as commit `822743cb309c90b8d1d1f0162b7473bda5e77bb9`.

### Slice 2 — Create reference — COMPLETE

Delivered through PR #3 (`feat: create project-owned canvas references`).

Evidence:

- Project owns `references[]` with product-owned relationship ID, document `blockId`, and canvas `elementId`;
- SQLite migration adds durable reference state without destructive schema work;
- frontend creation uses current document-block and canvas-object selections while editor adapters expose only focused selection capabilities;
- persistence/restart backend coverage includes references;
- the initial Go formatting blocker was corrected without expanding scope;
- final PR head `0b78b26c1ae34d5b15c41a2444cfb5875d06c8fe` passed Verify run #37;
- integrated on `master` as commit `d0d73c6180c48459486b2c8371536354d9091929`.

### Slice 3 — Navigate both ways — COMPLETE

Delivered through PR #4 (`feat: navigate and recover note canvas references`).

Evidence:

- document block → canvas reference selects/reveals the linked Excalidraw object;
- canvas object → document reference focuses/reveals the linked Tiptap block;
- transient Excalidraw selection is reported independently from persisted scene-state changes;
- document integration reports active block identity during both content and selection transactions;
- Playwright lifecycle coverage verifies both navigation directions.

### Slice 4 — Durability gate — COMPLETE

Delivered through PR #4.

Evidence:

- Playwright covers relationship creation, ordinary document editing, two-way navigation, reload, Project switching, canvas-target deletion, recoverable orphan state, and explicit broken-link removal;
- `scripts/smoke-persistence.py --compose-restart` persists document block identity, canvas element identity, and their Project reference across a real Compose container restart;
- final implementation head `1183fb6fa5da8cbb23368ba5a61714569ab20534` passed Verify run #41;
- run #41 passed frozen dependency install, production build, TypeScript typecheck, lint, frontend unit tests, Go formatting, `go vet`, Go race tests, Go build, Playwright E2E, Docker Compose build/health, and restart-persistence smoke;
- PR #4 integrated on `master` as commit `d27cc5dd1e3082350b506986f27c4267b3d4d901`.

## Milestone acceptance result

**PASS.** The Milestone 2 outcome is implemented and integrated. The required relationship behavior is owned by the Project domain, works in both navigation directions, handles deleted targets explicitly, and survives the required durability boundaries.

No new product scope or architecture boundary was introduced to close the milestone.

## Decisions retained

- Project owns cross-surface relationships.
- Product-owned stable IDs are relationship identity.
- Visible labels, mutable document positions, canvas coordinates, and incidental editor identity are not relational identity.
- Tiptap and Excalidraw remain adapters; neither owns the relationship.
- Missing targets remain recoverable broken references until the user removes them explicitly.
- Do not silently relink by text, position, or proximity.
- Expand relationship cardinality or supported semantic models only when a concrete product requirement requests it.

Durable rationale belongs in `DECISIONS.md`; this file records only the completed milestone state and execution evidence.

## Completed baseline

Milestone 1 / Core Project Workspace remains integrated on `master` via PR #1 and continues to provide:

- Project CRUD and durable Go + SQLite storage;
- Tiptap document + Excalidraw canvas in one Project workspace;
- autosave queue/retry/conflict behavior;
- search/delete/theme/responsive workspace behavior;
- production Go serving built frontend assets;
- browser E2E and Docker restart-persistence coverage.

`Taskfile.yml` remains the human/agent development orchestration entrypoint.

## Known scope boundary

Milestone 2 intentionally does not add AI linking, semantic inference, multi-block relation graphs, collaboration/CRDT, public sharing, import/export expansion, templates, or structured-diagram engines.

The previous relationship milestone remains complete and integrated. Its scope and evidence are retained below as historical context.
