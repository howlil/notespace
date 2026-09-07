# Current Iteration

## Status

**Milestone: Native Structured Diagrams — integration gate.**

The implementation is intentionally bounded to the first useful Eraser-style diagramming slice inside the existing Notespace Canvas. Excalidraw remains the native visual editor; Notespace owns structured diagram identity and persistence.

## Product outcome

A user can create and maintain technical diagrams without leaving a workspace or depending on an external diagram SaaS:

- open a dedicated **Diagram** tool from Canvas;
- create an **Architecture** or **Flowchart** starter;
- search and insert curated **General / Tech / AWS / GCP / Azure** components;
- connect exactly two selected diagram nodes;
- group multiple selected nodes into a visible boundary;
- auto-layout a managed diagram;
- move and resize generated nodes with native Excalidraw interactions while Notespace synchronizes geometry back into its model;
- reopen the workspace with stable Notespace diagram/node/edge/group IDs preserved in the canvas snapshot;
- **Detach** a managed diagram to ordinary Excalidraw shapes without deleting the rendered content.

## Slices

### S1 — Structured diagram domain and persistence

**Capability:** Notespace can distinguish a managed diagram from ordinary freeform canvas content.

- add a small Notespace-owned `StructuredDiagram` model for diagram, node, edge, and group identity;
- store version-compatible structured metadata inside the existing Excalidraw canvas snapshot instead of adding a backend schema or service;
- validate restored metadata and ignore malformed payloads;
- synchronize native shape move/resize/delete events back to the structured model;
- keep Excalidraw element IDs as rendering references, not product identity.

**Acceptance:** IDs and geometry survive snapshot round-trip; deleting a native node removes invalid structured edges/groups instead of silently relinking them.

### S2 — Native Architecture and Flowchart rendering

**Capability:** a managed diagram renders as ordinary editable Excalidraw elements.

- add Architecture and Flowchart starter templates;
- convert the structured model to native Excalidraw rectangles/diamonds/ellipses/arrows;
- use bound labels so node text travels with its shape;
- wait for canvas fonts before programmatic conversion to avoid incorrect text metrics;
- use deterministic layered layout: horizontal for Architecture, vertical for Flowchart.

**Acceptance:** generated content is selectable, movable, resizable, and saved through the existing canvas autosave path.

### S3 — Searchable component palette

**Capability:** users can insert technical components without drawing every node manually.

- expose a compact Canvas **Diagram** entry point;
- provide Architecture / Flowchart mode switching;
- add search over labels, provider names, and practical keywords;
- provide General, Tech, AWS, GCP, and Azure categories;
- use the existing Lucide dependency for the picker UI and compact provider/technology glyphs in generated nodes; no external icon CDN/runtime dependency.

**Acceptance:** filtering is deterministic and inserting a component either adds to the active managed diagram or starts a new one-node diagram.

### S4 — Structured editing actions

**Capability:** users can evolve a diagram instead of only inserting static templates.

- map native Excalidraw selection back to Notespace node IDs;
- connect exactly two selected nodes;
- group two or more selected nodes;
- recalculate a diagram with Auto layout;
- preserve unrelated freeform Excalidraw objects while a managed diagram is regenerated.

**Acceptance:** structured actions affect only the active diagram and do not rewrite unrelated canvas content.

### S5 — Detach to Freeform

**Capability:** structured management is optional and reversible.

- remove only the selected diagram's Notespace structured metadata;
- leave all rendered Excalidraw shapes/arrows in place;
- stop future auto-layout/synchronization for the detached diagram.

**Acceptance:** detach is non-destructive and persists immediately through the existing canvas snapshot contract.

### S6 — Verification and integration

**Capability:** the milestone can merge without weakening existing Notespace behavior.

- add focused model tests for search, layout, stable identity, connection/group behavior, snapshot round-trip, move/resize/delete synchronization, and bound-label selection;
- include the new focused test in the repository-owned `pnpm test` gate;
- require frontend typecheck, lint, unit tests, production build, and exact-head GitHub `Verify` before merge;
- no backend API, SQLite schema, deployment topology, external SaaS, or new runtime dependency changes.

## Architecture boundaries

- `StructuredDiagram` is Notespace domain state stored inside the versioned canvas snapshot.
- Excalidraw is the renderer/editor adapter and remains replaceable behind the existing canvas boundary.
- Generated shapes are native Excalidraw elements, not embedded images or iframes.
- Curated icons/components are local metadata/UI; no Eraser API key, iframe, hosted dependency, or remote icon CDN is introduced.
- Existing freeform Canvas, image asset vault, cross-surface references, autosave, and workspace ownership remain unchanged.

## Verification required

Before merge:

1. exact-head PR `Verify` completes successfully;
2. frontend typecheck, lint, unit tests, and production build pass;
3. PR remains mergeable at the verified head;
4. merge uses that exact head SHA.
