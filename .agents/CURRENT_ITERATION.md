# Current Iteration — Bootstrap the First End-to-End Project Slice

**Status:** READY FOR IMPLEMENTATION AFTER STACK APPROVAL

**Canonical role:** This file is the source of truth for the currently active meaningful iteration. Update it as work progresses. Do not create parallel sprint-state files.

---

# Feature Compass

## Feature Shape

The first implementation slice must prove the core Notespace product loop:

```text
Open Notespace
      ↓
Dashboard
      ↓
Create Project
      ↓
Unified Project Workspace
      ↓
Document | Canvas
      ↓
Edit both surfaces
      ↓
Reload
      ↓
Project still exists and reopens correctly
```

This slice establishes the product invariant that a Project owns both linear and spatial work. It does not attempt to build the full product.

## Current Position

Lifecycle position:

`USER INTENT → UNDERSTAND → BOUND → SPECIFY → DESIGN → [IMPLEMENTATION DECISION GATE] → IMPLEMENT`

Repository evidence checked on 2026-09-01:

- repository: `howlil/notespace`;
- default branch: `master`;
- only branch currently visible: `master`;
- repository root currently contains only `.agents/`;
- no application source, package manifest, runtime config, tests, or deployment files are checked in.

Therefore there is no existing implementation to preserve or audit yet. The next code-changing action is a bootstrap, not a refactor.

## Delta

Completed before implementation:

- product/domain model established;
- UI/product shape established;
- architecture boundaries established;
- Excalidraw direction established as the preferred freeform canvas engine behind a Notespace adapter;
- self-hosted/free product constraint established;
- quality and retrospective rules established;
- first real end-to-end vertical slice bounded below.

## Next Move

**Single next meaningful action:** approve the initial web application stack, then implement this vertical slice without expanding scope.

Stack selection is treated as a material technical decision because the repository is empty and the choice establishes the long-lived application/runtime boundary. Do not silently choose a framework, backend runtime, database, ORM, or document editor.

---

# Iteration Goal

Deliver the smallest runnable Notespace application that proves:

> A user can create one Project from the dashboard, enter a resizable Document + Canvas workspace, make changes on both surfaces, reload the application, and recover the Project state.

This is the first coherent product slice because it crosses UI, domain state, persistence, and editor/canvas integration while remaining tightly bounded.

---

# User-visible scope

## 1. Dashboard

Implement only what is needed for the primary path:

- Notespace shell/brand;
- project list;
- empty state when no projects exist;
- `New Project` action;
- click an existing Project to open it.

Do not implement yet:

- Templates;
- Favorites;
- Trash behavior beyond what is already required by implementation scaffolding;
- project search;
- folders/spaces/tags;
- activity feed;
- billing/account UI.

## 2. Create Project

Minimal flow:

```text
New Project
   ↓
Project title
   ↓
Create
   ↓
Project Workspace
```

A Project is created as one domain entity. Do not create separate user-facing Note and Canvas resources.

## 3. Project Workspace

Required shape:

```text
┌──────────────────────────────────────────────────────┐
│ ‹  Project Title                          controls  │
├───────────────────────┬──────────────────────────────┤
│                       │                              │
│      DOCUMENT         │            CANVAS            │
│                       │                              │
│                       │                              │
└───────────────────────┴──────────────────────────────┘
                        ↑
                  draggable splitter
```

Required behavior:

- both surfaces belong to the same Project;
- user can resize the split;
- document side accepts basic editable text;
- canvas side embeds the approved Excalidraw integration;
- project title remains visible at workspace level;
- navigating back to dashboard is possible.

## 4. Persistence

The minimum durability contract:

```text
create/edit
    ↓
persist
    ↓
reload process/page
    ↓
restore
    ↓
same Project state
```

Persist at least:

- Project identity;
- Project title;
- document content required by the chosen editor representation;
- canvas scene required by the Excalidraw adapter;
- split ratio if inexpensive within the chosen architecture.

Do not make the third-party editor or Excalidraw representation the entire Notespace domain model.

---

# Domain invariant

The implementation must preserve:

```text
Project
├── identity
├── title
├── document state
├── canvas state
└── presentation/layout state as appropriate
```

User-facing domain language must not drift into:

```text
Note
Canvas
Project
```

as three independent content types.

Separate internal persistence tables/documents/modules are acceptable if useful, but ownership remains under Project and must not leak into conflicting product semantics.

---

# Integration boundaries

## Document editor

The editor library remains an implementation decision until approved/selected.

Notespace owns the boundary around it. At minimum the domain/application layer should not require UI code everywhere to know editor-library internals.

## Canvas

Preferred direction already established:

```text
Notespace Project
      ↓
Canvas integration boundary
      ↓
@excalidraw/excalidraw
```

Do not fork Excalidraw for this iteration.

Do not add Eraser/structured diagram rendering in this iteration.

Do not model all Project state as Excalidraw JSON.

---

# Explicit non-goals

This iteration does **not** include:

- AI;
- Eraser diagrams;
- semantic/knowledge graph;
- Note ↔ Canvas semantic references;
- multiplayer collaboration;
- CRDT;
- authentication unless technically mandatory for the approved deployment model;
- team/workspace membership;
- templates;
- advanced project organization;
- focus timer;
- import/export;
- backup UI;
- instance administration UI;
- mobile-specific redesign;
- offline conflict resolution;
- analytics;
- speculative abstraction for future renderers.

Do not add these because they appear in long-term product documents or Figma exploration.

---

# Acceptance Criteria

The iteration is complete only when all applicable criteria have evidence.

## Primary journey

1. Application starts successfully using documented local/self-hosted development instructions.
2. With zero projects, the dashboard renders a useful empty state.
3. User can create a Project with a title.
4. Creation opens that Project's unified workspace.
5. Workspace visibly contains Document and Canvas surfaces at the same time.
6. User can change document content.
7. User can create or modify at least one Excalidraw element on the canvas.
8. User can drag the center splitter and both surfaces remain usable.
9. Project state is persisted.
10. Reloading the application restores the Project title, document state, and canvas state.
11. Returning to dashboard shows the created Project.
12. Reopening the Project restores the same persisted state.

## Domain/architecture

13. There is one user-facing Project entity, not independent Note and Canvas resources.
14. Excalidraw is behind a Notespace-owned integration boundary rather than spread through unrelated application code.
15. Persistence failure is not reported as a successful save if the implementation has an explicit save state.
16. No unrelated future feature is introduced.

## Quality

17. Typecheck/static checks pass where the selected stack provides them.
18. Lint/format checks pass where configured.
19. Build passes.
20. Tests cover the critical domain/persistence behavior appropriate to the selected architecture.
21. At least one integration/e2e-level check protects the create → edit → reload → reopen journey, or the absence of that level is explicitly justified with equivalent evidence.
22. The implementation is visually checked against `.agents/DESIGN.md` rather than accepted from component tests alone.

---

# Implementation order

Once the stack is approved, prefer this sequence:

```text
1. Runnable application shell
        ↓
2. Project domain + persistence contract
        ↓
3. Dashboard empty/list state
        ↓
4. Create Project
        ↓
5. Workspace shell + splitter
        ↓
6. Document editor integration
        ↓
7. Excalidraw adapter/integration
        ↓
8. Persist + restore both surfaces
        ↓
9. End-to-end verification
        ↓
10. Quality gates
        ↓
STOP
```

This ordering keeps the slice vertical. Do not build a large backend layer, design system, or abstraction framework before the user journey exists.

---

# Material Decision Gate — Initial Stack

Because the repository contains no application code, the following must be approved before implementation:

- web framework/build system;
- server/runtime shape, if any;
- persistence/database choice;
- document editor library;
- self-hosted packaging baseline.

The decision should optimize for:

1. simple self-hosting;
2. strong TypeScript support unless there is a reason otherwise;
3. minimal operational dependencies;
4. easy Excalidraw embedding;
5. reliable local persistence and migration path;
6. testability;
7. low framework ceremony;
8. ability to evolve without prematurely becoming distributed infrastructure.

Do not optimize for hypothetical scale before product usage provides evidence.

---

# Evidence currently available

Repository evidence:

- root contains only `.agents/`;
- only `master` branch is currently visible;
- no implementation source exists in GitHub at the time of this update.

Product/architecture evidence:

- `.agents/PROJECT.md`;
- `.agents/ARCHITECTURE.md`;
- `.agents/DESIGN.md`;
- `.agents/QUALITY.md`.

---

# Stop Conditions

Stop and request user approval before proceeding if implementation requires:

- changing the Project-centric domain model;
- making Note and Canvas independent first-class resources;
- replacing Excalidraw direction with another primary canvas engine;
- introducing a major backend/service boundary not required by the slice;
- choosing a materially different deployment model;
- adding authentication/security boundaries not already approved;
- destructive persistence migrations;
- public API/contract commitments;
- expanding this iteration into AI, collaboration, structured diagrams, or knowledge graph features.

---

# Completion / Handoff

When acceptance criteria pass:

1. record verification evidence here briefly;
2. mark the vertical slice complete;
3. run a retrospective only if the iteration produced meaningful delivery evidence or friction;
4. replace this file with the next active meaningful iteration;
5. do not accumulate a permanent sprint diary in this file.

The likely next product question after this slice is not predetermined. Use observed product state and user intent to select the next vertical slice.