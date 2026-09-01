# Current Iteration — Milestone 2: Note ↔ Canvas Interoperability

## Status

- **Milestone:** Milestone 2 — Note ↔ Canvas Interoperability
- **Milestone state:** IN PROGRESS
- **Active slice:** Slice 1 — Stable document block identity
- **Delivery surface:** PR #2, branch `feat/note-block-identities`
- **Blocker:** none confirmed. GitHub currently reports the PR as mergeable; final-head verification must pass before integration.

## Why this milestone exists

The completed baseline places the document and canvas side by side inside one Project, but they do not yet refer to the same idea semantically.

Milestone 2 makes that product relationship real without turning Tiptap or Excalidraw internals into Notespace domain identity.

## Milestone outcome

A user can create a durable relationship between a supported document block and a canvas object, navigate that relationship in both directions, edit ordinary content, and reopen the same relationship after reload/restart.

## Scope in

- stable product-owned identity for supported document blocks;
- create a canvas reference from a selected document block;
- Project-owned relationship persistence;
- canvas reference → document block navigation;
- document block → linked canvas object navigation;
- recoverable orphan/broken-reference behavior;
- durability through edit, reload, Project switching, and container restart;
- migration/validation and risk-proportional unit/integration/browser/Docker verification.

## Scope out

- AI-generated linking or diagrams;
- arbitrary semantic meaning for every canvas shape;
- multi-block relation graphs;
- collaboration/CRDT;
- public sharing;
- export/import expansion;
- templates;
- structured-diagram engines;
- unrelated UI redesign or infrastructure work.

## Ordered slices

### Slice 1 — Stable document block identity — ACTIVE

Goal: supported Tiptap blocks receive stable product-owned IDs that survive normal editing and persistence.

Expected supported starting set:

- paragraphs;
- headings;
- code blocks;
- list items.

Existing Project snapshots without IDs must remain readable; missing IDs may be assigned through the document integration and persisted through the existing autosave path.

Current evidence:

- PR #2 contains the stable-block-identity implementation;
- PR #2 adds browser coverage comparing block IDs before and after reload;
- the PR explicitly keeps cross-surface reference creation/navigation out of this slice;
- canonical agent state has been synchronized onto the PR branch without changing the feature implementation;
- GitHub currently reports PR #2 as mergeable.

Slice gate before completion:

- final PR head remains mergeable with current `master`;
- targeted block-ID behavior is verified through edit + reload;
- relevant migration/adapter behavior is covered;
- repository quality gates required by `QUALITY.md` pass for the final head;
- no Project/document contract regression is introduced.

### Slice 2 — Create reference — PENDING

Let a user create one canvas reference from a selected supported document block. Store relationship meaning in Project-owned state and expose only the required adapter capability to the editors.

### Slice 3 — Navigate both ways — PENDING

Support canvas reference → document target focus/reveal and document target → linked canvas object focus/select.

### Slice 4 — Durability gate — PENDING

Prove edit, deletion/orphan handling, reload, Project switching, process/container restart, and final integration/release gates.

## Decisions active for this milestone

- Project owns cross-surface relationships.
- Product-owned stable IDs are relationship identity.
- Visible labels, HTML/document positions, editor-generated incidental IDs, and canvas coordinates are not relational identity.
- Tiptap and Excalidraw adapters expose focused capabilities; neither editor becomes the source of truth for the relationship.
- A missing target is a recoverable broken reference; do not silently relink by text or proximity.
- Expand supported block types only when a concrete use case requires it.

Durable rationale belongs in `DECISIONS.md`; this section records only decisions needed to execute the active milestone.

## Completed baseline

Milestone 1 / Core Project Workspace is integrated on `master` via PR #1.

Verified baseline includes:

- Project CRUD and durable Go + SQLite storage;
- Tiptap document + Excalidraw canvas in one Project workspace;
- autosave queue/retry/conflict behavior;
- search/delete/theme/responsive workspace behavior;
- production Go serving built frontend assets;
- browser E2E and Docker restart-persistence coverage.

The latest `master` also uses `Taskfile.yml` as the human/agent development orchestration entrypoint.

## Risks

- retrofitting IDs must not invalidate existing Tiptap snapshots;
- editor normalization must not regenerate IDs during ordinary edits;
- relationship state must not become embedded only in renderer-native data;
- PR #2 originated before later `master` orchestration/documentation commits, so the final merge result must preserve current `master` behavior and canonical agent state.

## Next action

**Run/await the final-head Slice 1 verification gate; if it passes and PR #2 remains mergeable, integrate Slice 1. If a gate fails, fix only that blocker and rerun the relevant gate.**

Do not begin Slice 2 before Slice 1 is integrated or a concrete blocker requires replanning.
