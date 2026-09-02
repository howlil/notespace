# Current Iteration — Milestone 3: Category Library and Focused Workspace

## Status

- **Milestone:** Milestone 3 — Category Library and Focused Workspace
- **Milestone state:** IMPLEMENTED / LOCAL VERIFICATION
- **Active slice:** final browser and production-composition gate
- **Integrated through:** local working tree only
- **Blocker:** Docker and the Playwright Chromium binary are not available in the current execution environment.

## Why this milestone exists

The prior flat Project library could not express a category containing multiple document + canvas workspaces, and it repeated library navigation in the editor itself.

## Delivered in the current working tree

- Category → Workspace persistence, API, and a safe migration that assigns existing workspaces to `Uncategorized`.
- A compact category-first home: one category section lists its workspaces and has a single local action to create another.
- Collapsible/expandable home sidebar with category counts; the redundant `Workspace / Projects` breadcrumb and duplicated recent/all project views are removed.
- Full-width workspace editor with library navigation only through the back control; workspace title is now quiet display text rather than a visible title input.
- Creation uses a borderless, underline-only field to avoid the previous boxed/ringed visual treatment.

## Evidence so far

- `pnpm --filter @notespace/web typecheck` — PASS
- `pnpm --filter @notespace/web build` — PASS
- `pnpm lint` — PASS
- `go test ./...` (server) — PASS

## Next action

Run the targeted Playwright category/workspace journey and production Compose verification in an environment with Docker and the Playwright Chromium binary, then integrate if green.

## Why this milestone existed

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

## Next action

**STOP. Milestone 2 is complete and integrated. Do not invent Milestone 3. Begin a new milestone only from new user intent.**
