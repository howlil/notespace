# Milestone 2 — Note ↔ Canvas Interoperability

## Goal

Make a Project's linear note and spatial canvas refer to the same ideas, rather than merely appearing side by side.

## Scope

- Stable, product-owned identity for supported document blocks.
- Create a canvas reference to a selected document block.
- Bidirectional navigation: canvas reference → note block, note block → linked canvas object.
- Durable reference persistence through edit, reload, Project switching and container restart.

## Non-goals

Automatic diagram generation, AI linking, arbitrary canvas-shape semantics, multi-block relations, collaboration/CRDT, public sharing, export, templates and structured-diagram libraries.

## Ordered slices

1. **Block identity** — define and persist stable IDs for supported note blocks; prove existing Project snapshots migrate/read safely.
2. **Create reference** — let a user create one canvas reference from a selected note block; store the relationship in Project-owned state and canvas adapter metadata.
3. **Navigate both ways** — focus/scroll the selected block from canvas and select/focus its canvas object from the note.
4. **Durability gate** — cover edits, deletion/orphan behavior, reload, Project switching, restart and Docker CI.

## Decisions and constraints

- Project owns relationships; editor labels, HTML positions and canvas coordinates are never relational identity.
- Document and canvas adapters expose focused capabilities but do not become the source of truth.
- A missing target is shown as a recoverable broken reference; no automatic re-linking.
- Start with text-oriented blocks supported by the current Tiptap document snapshot. Expand supported blocks only with evidence.

## Exit criteria

A user can link a note block such as “Raft” to a canvas object, navigate in both directions, edit ordinary content, and reopen the same relationship after restart. Migration/validation, unit/integration, browser E2E and Docker restart-persistence gates pass.
