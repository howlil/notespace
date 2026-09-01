# Notespace — Product and Domain Specification

This document describes the current product intent for Notespace. It is the product/domain source of truth for engineering agents unless the user explicitly changes it.

Where this document distinguishes **Committed**, **Deferred**, and **Open**, treat those labels literally. Do not promote a deferred idea into scope or resolve an open decision without evidence and, when material, user approval.

---

# 1. Product summary

**Notespace is a free, self-hosted thinking workspace where linear writing and spatial drawing coexist inside one Project.**

The central product idea is not “a notes app plus a whiteboard app.” It is a single project context that exposes two complementary interaction surfaces:

- a **linear/document surface** for writing, explanation, code, structured text, and ordered reasoning;
- a **spatial/canvas surface** for sketching, diagrams, arrows, images, visual relationships, and spatial reasoning.

The user should think:

> “I am working on my TCP project.”

not:

> “I have a TCP note and a separate TCP canvas.”

The two surfaces are siblings within the same Project domain, not independent top-level content products.

```text
                         Notespace
                            │
                         Project
                            │
                  Unified project context
                            │
                ┌───────────┴───────────┐
                │                       │
         Linear interaction      Spatial interaction
                │                       │
        Document surface          Canvas surface
                │                       │
                └───────────┬───────────┘
                            │
                     Same project identity
```

---

# 2. Product principles

## 2.1 One Project is the primary content concept

**Committed.**

The user-facing domain should stay simple:

```text
Notespace
└── Projects
```

Do not introduce separate top-level content concepts named `Note`, `Canvas`, or `Space` unless a future requirement proves they are independently addressable domain entities.

A Project owns the content and state required for both linear and spatial work.

Internally, the implementation may use separate sub-models or persistence records for document and canvas state. That is an implementation detail. It must not leak into the product model as two unrelated resources.

## 2.2 Linear and spatial thinking are equal first-class surfaces

**Committed.**

Neither surface is an attachment of the other.

Avoid models such as:

```text
Note
└── attached canvas
```

or:

```text
Canvas
└── embedded note
```

Preferred conceptual relationship:

```text
Project
├── document surface
└── canvas surface
```

Both share project identity, navigation, metadata, project-level utilities, and lifecycle.

## 2.3 Local-first/self-hosted product identity

**Committed.**

Notespace is free and self-hosted.

The product must not be designed around SaaS monetization concepts such as:

- free vs pro plan;
- project quota;
- upgrade banners;
- cloud storage quota;
- billing dashboard;
- subscription state as a primary UI concern.

Self-hosting is a positive product property, not a missing SaaS layer.

Product wording should prefer concepts such as:

- local instance;
- storage;
- backup;
- import/export;
- portability;
- instance health;

rather than apologetic wording such as “no billing/account layer.”

## 2.4 Quiet workspace over dashboard complexity

**Committed direction.**

The UI should feel like a focused thinking tool, not an enterprise admin panel.

Prefer:

- strong content hierarchy;
- low visual noise;
- project previews;
- quick entry into recent work;
- restrained controls;
- calm surfaces.

Avoid adding activity feeds, analytics widgets, team dashboards, marketing cards, usage charts, or organizational hierarchy without an explicit requirement.

## 2.5 Product behavior before framework behavior

**Committed engineering principle.**

The product model must not become identical to a third-party editor or renderer model.

In particular:

- Excalidraw scene JSON is not the canonical Notespace domain model.
- A rich-text editor document representation is not the canonical Project identity.
- Renderer-specific coordinates/styles are presentation state, not the whole product meaning.

Dependencies should sit behind product-owned boundaries.

---

# 3. Primary user journey

The default flow is:

```text
Open Notespace
      ↓
Dashboard / Home
      ↓
Find or create Project
      ↓
Open Project Workspace
      ↓
Write + draw in the same project context
      ↓
Leave
      ↓
Return to the same project state
```

## 3.1 Dashboard / Home

**Committed.**

The dashboard is the entry point before the project editor.

Its job is navigation, not management ceremony.

Core dashboard capabilities:

- recent Projects;
- all Projects;
- search Projects;
- create a new Project;
- open a Project;
- favorite/unfavorite a Project;
- move Projects to trash and restore/manage trash;
- access Settings.

Potentially included when useful:

- templates.

Do not expose separate dashboard sections named `Notes` and `Canvases`.

Do not expose SaaS plan or billing UI.

### Project preview

A Project card may visually preview both linear and spatial content to reinforce that the Project contains both modes of thinking.

Example:

```text
┌──────────────────────────────┐
│ TCP Handshake     Client     │
│ 1. SYN                ↓      │
│ 2. SYN-ACK         Server    │
│ 3. ACK                       │
├──────────────────────────────┤
│ TCP Deep Dive                │
│ Edited 12 min ago        ⋯   │
└──────────────────────────────┘
```

The preview is representational. It must not imply that the Project contains two independent files.

## 3.2 Create Project

**Committed.**

The core action is `New Project`, not `New Note` or `New Canvas`.

Minimal flow:

```text
+ New Project
      ↓
Project name / optional template
      ↓
Create
      ↓
Project Workspace
```

Creation should be fast. Do not require configuration that can safely default.

## 3.3 Project Workspace

**Committed.**

The default workspace is a resizable split view:

```text
┌────────────────────────────────────────────────────────────┐
│ ‹   Project Title   ›                         Timer     ⋯  │
├─────────────────────────┬──────────────────────────────────┤
│                         │                                  │
│    DOCUMENT SURFACE     │         CANVAS SURFACE           │
│                         │                                  │
│                         │                                  │
│                         │                                  │
│                         │                                  │
│                         │                                  │
└─────────────────────────┴──────────────────────────────────┘
                          ↑
                    resizable splitter
```

The split ratio is user-adjustable.

Expected derived modes:

### Balanced split

```text
Document | Canvas
```

### Document focus

```text
Document | narrow/collapsed Canvas
```

### Canvas focus

```text
narrow/collapsed Document | Canvas
```

These should emerge from the same workspace layout model, not be three unrelated implementations.

A double-click-to-reset split is a reasonable interaction if it fits the implementation, but it is not a mandatory requirement unless explicitly accepted.

## 3.4 Project navigation

**Committed direction.**

The workspace header includes project-level navigation.

The visual concept supports:

```text
‹  Project Title  ›
```

where previous/next enables quick sequential navigation.

A project switcher/search is also expected so the design does not depend on stepping through many projects one-by-one.

Project navigation belongs to the Project shell, not to either document or canvas surface.

## 3.5 Focus timer

**Committed lightweight utility.**

The timer is a Project-level utility positioned in the workspace header.

Minimal behavior:

- start;
- pause;
- resume;
- finish.

Avoid building a large Pomodoro analytics/productivity subsystem unless separately requested.

If sessions are persisted, they belong to the Project context or a clearly owned focus-session domain, not to the canvas implementation.

---

# 4. Document surface

The document surface represents linear thinking inside a Project.

Expected content categories include:

- paragraphs;
- headings;
- lists;
- links;
- code or inline code;
- explanatory callouts;
- structured technical notes.

Example:

```text
TCP Three-Way Handshake

A TCP connection begins with a synchronization exchange...

Why it exists
...

Mechanism
1. Client sends SYN
2. Server replies SYN-ACK
3. Client confirms with ACK

Key idea
...

Failure modes
...
```

## Editing tools

The initial design includes lightweight formatting controls such as:

- bold;
- italic;
- heading;
- code;
- link.

`Ask AI` has appeared in design exploration but AI functionality is **not automatically committed to V1**. Do not implement AI merely because a placeholder exists in a visual concept.

Contextual formatting may eventually be preferable to a permanent bottom toolbar, but that remains an interaction-level decision until required.

---

# 5. Canvas surface

## 5.1 Primary canvas direction

**Committed technical/product direction from design research: use Excalidraw as the primary interactive freeform canvas, unless repository evidence or a later user decision changes this.**

Why Excalidraw fits the primary canvas role:

- freeform interaction is the product need;
- selection, drag, resize, zoom, pan, arrows, drawing, text, images, grouping and other editor mechanics are already solved;
- Notespace differentiation should be in project/context integration rather than reimplementing pointer geometry and whiteboard primitives;
- the editor is embeddable and mature.

The dependency should be integrated through a Notespace-owned boundary rather than spreading Excalidraw-specific behavior throughout the domain.

## 5.2 Canvas responsibilities

The canvas surface may support:

- freehand sketching;
- text;
- shapes;
- arrows/connections;
- image placement/annotation;
- visual explanations;
- mind-map-like structures;
- architecture/system sketches;
- arbitrary spatial arrangement.

The canvas is not required to infer semantic meaning for every shape in V1.

## 5.3 Structured diagrams

**Deferred.**

Research compared Excalidraw with Eraser's open-source diagram renderer.

The resulting boundary is:

- Excalidraw solves **interactive freeform canvas/editing**;
- Eraser-style diagram engines solve **structured semantic layout/rendering**.

If Notespace later adds AI-generated system diagrams, ERDs, flowcharts, or semantic architecture diagrams, a specialized structured-diagram block/renderer may be added inside the canvas experience.

Do **not** use `eraser-diagrams` as the main canvas engine in the initial implementation.

Do **not** add it before a concrete structured-diagram requirement exists.

A future shape could be:

```text
Project Canvas
│
├── freeform drawing → Excalidraw
└── structured diagram block → semantic model + renderer
```

The structured renderer must remain replaceable; Eraser, ELK, Graphviz, D2, or a custom engine are implementation options rather than Notespace domain concepts.

---

# 6. Relationship between document and canvas

## 6.1 Product invariant

The two surfaces share a Project domain identity.

This does **not** require one giant storage object.

A sound implementation may look conceptually like:

```text
Project aggregate
│
├── project metadata
├── document state
├── canvas state
└── layout/preferences
```

The key invariant is ownership:

```text
Project owns document + canvas context
```

not:

```text
Independent Note resource
Independent Canvas resource
```

## 6.2 Cross-surface references

**High-value future capability, not assumed V1 unless requested.**

The product becomes more differentiated when linear and spatial representations can reference each other.

Potential interactions:

```text
select document block
      ↓
Send / reference on canvas
```

and:

```text
select canvas object
      ↓
Open / reveal linked document content
```

A future reference model may associate product-owned IDs with editor objects rather than using editor coordinates as identity.

Example concept:

```text
Document block: block_tcp_handshake
                ↑
                │ reference
                ↓
Canvas object: canvas_tcp_handshake_visual
```

Do not implement this relationship prematurely. Preserve architecture space for it by keeping stable product IDs and renderer-specific state separated.

---

# 7. Settings and self-hosting

**Committed product area.**

Settings should focus on the local/self-hosted workspace.

Primary categories:

## General

Examples:

- theme: system/light/dark;
- default document/canvas split;
- restore last Project on launch.

## Storage & Backup

Expected concerns:

- storage backend/status;
- data directory where relevant;
- backup configuration;
- manual backup.

Do not expose storage implementation details that are not actually configurable.

## Import / Export

Portability is important for a self-hosted product.

Potential import inputs:

- Markdown;
- Excalidraw-compatible data;
- JSON/archive formats owned by Notespace;
- images.

Actual supported formats must be derived from implemented behavior, not aspirational UI copy.

Export should aim for a portable representation of user Projects and metadata.

## Instance

Useful runtime information may include:

- health;
- version;
- persistence/database backend;
- storage state;
- last backup;
- data size;
- update status.

Only display facts the system can reliably know.

## Destructive operations

Actions such as clear trash or reset instance require explicit confirmation and clear blast-radius communication.

---

# 8. Visual/product direction

The current Figma exploration is maintained at:

`https://www.figma.com/design/qS29iOvAMP0MDeS8YJpTIY`

The product direction is:

- calm;
- local-first;
- editor/tool-like;
- minimal but not empty;
- content-dominant;
- restrained accents;
- low decorative noise.

The product should not look like a generic AI productivity SaaS.

Detailed UI rules live in `DESIGN.md`.

---

# 9. Initial product capability map

This section separates current product shape from future exploration.

## Core / expected early product

- self-hosted web application;
- Project dashboard;
- create/open/search Projects;
- favorites/trash where implemented;
- Project workspace shell;
- document surface;
- Excalidraw-based freeform canvas surface;
- resizable document/canvas split;
- document-focus and canvas-focus layout states;
- project navigation/switching;
- lightweight project focus timer;
- general settings;
- storage/backup awareness;
- import/export foundation.

## Deferred until explicitly requested

- AI assistant/generation;
- structured diagram engine;
- Eraser integration;
- semantic knowledge graph;
- embeddings/vector search;
- flashcards/spaced repetition;
- multiplayer collaboration;
- CRDT architecture;
- teams/organizations;
- sharing/permissions model;
- SaaS hosting/billing;
- plugin marketplace;
- complex template marketplace;
- analytics/productivity scoring;
- mobile-native applications.

Deferred does not mean rejected. It means **not current scope**.

---

# 10. Non-goals and anti-patterns

Unless the user explicitly changes product direction, do not turn Notespace into:

## A Notion clone

The differentiator is not a general-purpose block database or enterprise wiki hierarchy.

## An Excalidraw wrapper

Excalidraw is an implementation primitive for spatial interaction. Notespace owns project identity, navigation, persistence semantics, document/canvas relationship, settings, and product behavior.

## An Eraser clone

Structured diagram generation is not the primary product foundation.

## A SaaS dashboard

Avoid billing, subscription, team-admin, usage quota, growth prompts, upgrade cards, or cloud-first assumptions.

## An architecture experiment

Do not introduce event sourcing, microservices, CRDTs, distributed storage, or abstraction layers merely because they may be useful “later.”

The self-hosted product should begin with the simplest architecture that satisfies the actual reliability and portability requirements.

---

# 11. Conceptual domain model

This model communicates ownership, not a required database schema.

```text
Project
├── id
├── title
├── metadata
│   ├── createdAt
│   └── updatedAt
├── document content/state
├── canvas content/state
├── workspace preferences
│   ├── split ratio
│   ├── collapsed/focus state
│   └── viewport preferences as needed
└── optional project-level utilities
    └── focus sessions
```

Potential product-owned identity boundary:

```text
ProjectId
DocumentBlockId      (when required)
CanvasObjectId       (when required)
FocusSessionId       (when persisted)
```

Do not assign stable domain identity to every editor primitive unless a real feature requires it.

---

# 12. Data ownership principles

## Project owns user-visible project state

Project metadata, document state, canvas state, and project layout belong to the Notespace product domain.

## Renderer/editor models are adapters

Third-party models may be persisted for practicality, but application code should avoid making them universal APIs.

For example:

```text
Notespace feature
      ↓
Canvas boundary/adapter
      ↓
Excalidraw API / scene representation
```

rather than:

```text
All application code
      ↓
Direct Excalidraw internals
```

## Presentation state is not semantic state

Coordinates, zoom, selection, shape style, and viewport are presentation state.

Project names, user-authored content, relationships deliberately created by product features, and stable references are product/domain state.

The exact separation should remain proportional to actual feature needs.

---

# 13. UX success criteria

Notespace is succeeding when a user can:

1. open the application and immediately find recent work;
2. create a Project with minimal friction;
3. write and draw without feeling they switched applications;
4. resize/focus either thinking surface naturally;
5. navigate between Projects without returning to a complicated dashboard;
6. leave and return without losing workspace state;
7. understand where their self-hosted data lives and how to back it up/export it;
8. use the product without encountering monetization or cloud-account assumptions.

The system should feel like one coherent thinking environment rather than two editors glued together.

---

# 14. Open product decisions

Do not silently resolve these when they materially affect behavior.

## Dashboard `Home` vs `Projects`

The current exploration contains both. Their roles overlap.

Before investing heavily in separate navigation destinations, determine whether:

- `Home` is a useful recent-work landing page and `Projects` is a full library; or
- the product should have a single Projects landing page.

## Templates

Templates are useful but not yet proven as V1-critical.

Do not build a template system solely because a dashboard placeholder exists.

## Document editor implementation

The desired document behavior is defined; the editor framework is not locked here.

Choose based on repository constraints and requirements such as:

- structured text model;
- extensibility;
- Markdown interoperability;
- code blocks;
- performance;
- persistence;
- future block references if needed.

A framework choice is an implementation decision until it constrains public behavior or data portability.

## Persistence technology

Self-hosting is committed. Exact database/storage technology must follow implemented scale, deployment, backup, concurrency, and portability needs.

Do not choose distributed infrastructure by default.

## Collaboration

No current requirement establishes real-time multi-user collaboration.

Do not introduce WebSocket/CRDT architecture until collaboration becomes an actual product requirement.

---

# 15. Product decision heuristic

When evaluating a proposed feature, ask:

1. Does it strengthen the unified Project model?
2. Does it improve linear ↔ spatial thinking?
3. Is it useful for a local/self-hosted workflow?
4. Does it reduce friction entering or resuming work?
5. Can it be implemented as a small coherent slice?
6. Does it add a new domain concept the user now has to understand?
7. Is that new concept actually necessary?

Prefer features that deepen the core loop:

```text
open Project → think/write/draw → preserve context → resume
```

before broadening Notespace into adjacent productivity categories.
