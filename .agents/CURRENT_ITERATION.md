# Current Iteration — Bootstrap the First End-to-End Project Slice

**Status:** READY AFTER REMAINING DATA/EDITOR DECISIONS

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
Persist
      ↓
Reload / reopen
      ↓
Same Project state
```

This slice establishes the product invariant that a Project owns both linear and spatial work. It does not attempt to build the full product.

## Current Position

Lifecycle position:

`USER INTENT → UNDERSTAND → BOUND → SPECIFY → DESIGN → [REMAINING IMPLEMENTATION DECISIONS] → IMPLEMENT`

Repository evidence checked on 2026-09-01:

- repository: `howlil/notespace`;
- default branch: `master`;
- only branch currently visible: `master`;
- repository currently contains the `.agents/` operating context but no application implementation yet.

The frontend technology decision is now resolved and documented in `.agents/skill/fe-skill.md`.

## Delta

Completed before implementation:

- product/domain model established;
- UI/product shape established;
- architecture boundaries established;
- self-hosted/free product constraint established;
- first real end-to-end vertical slice bounded;
- client platform scope narrowed to Web + Windows desktop;
- Windows desktop shell selected as Tauri/WebView2;
- Web confirmed as the primary implementation target;
- frontend stack approved: TanStack Start + Vite + Tailwind CSS + Radix UI + Zustand;
- frontend implementation rules externalized in `.agents/skill/fe-skill.md`;
- Excalidraw remains the approved freeform canvas direction behind a Notespace-owned adapter.

## Next Move

**Single next meaningful action:** resolve the remaining persistence/runtime and document-editor decisions, then implement the first vertical slice using the approved frontend stack.

Do not reopen the frontend framework decision during normal implementation.

---

# Committed Client Platform Scope

Current supported clients:

```text
Notespace
├── Web browser client        ← BUILD FIRST
└── Windows desktop client
    └── Tauri + WebView2      ← LATER, same Web UI
```

Do not introduce macOS, Linux desktop, mobile, WinUI/WPF, Electron, Flutter, React Native, Qt, or another client runtime without explicit user approval.

The Windows application is intentionally a thin Tauri desktop shell around the shared Web application. It is not a second frontend.

Preferred platform dependency direction:

```text
feature/application code
          ↓
     platform capability
      ↙             ↘
 browser            Tauri later
```

Ordinary Project/UI behavior must not require Tauri globals.

---

# Committed Frontend Stack

Canonical frontend implementation rules live in:

`.agents/skill/fe-skill.md`

Approved stack:

```text
TanStack Start
    ↓
React + TypeScript
    ↓
TanStack Router/runtime
    ↓
Vite toolchain
    ↓
Tailwind CSS
    ↓
Radix UI primitives
    ↓
Zustand where shared client state is justified
```

## Stack rules

- **TanStack Start** is the Web application framework.
- **Vite** is the build/dev toolchain used with TanStack Start; do not create a separate standalone Vite SPA.
- **Tailwind CSS** implements styling according to `.agents/DESIGN.md`.
- **Radix UI** supplies accessible low-level interactive primitives; it is not a full visual design system.
- **Zustand** is available for justified cross-component client state, not as the default owner of all state.
- **React + TypeScript** are the frontend implementation model implied by TanStack Start.
- **Excalidraw** remains the preferred canvas integration behind a Notespace-owned adapter.

Do not replace the approved frontend stack during this iteration unless the user explicitly changes it.

The frontend skill's explicit technology decision supersedes the original architecture baseline that left `frontend framework/runtime` open.

---

# State Ownership for the Frontend

Before introducing Zustand or another state location, classify ownership:

```text
local component interaction
        ↓
React local state

navigation/shareable URL/history state
        ↓
TanStack route/search state

route/server-loaded data
        ↓
TanStack data/application boundary

editor/canvas transient interaction state
        ↓
editor/canvas integration boundary

cross-component client state with no better owner
        ↓
Zustand
```

Do not create one giant global Zustand store.

Do not mirror the complete Excalidraw scene or rich editor state into Zustand on every high-frequency update merely for consistency.

---

# Iteration Goal

Deliver the smallest runnable Notespace Web application that proves:

> A user can create one Project from the dashboard, enter a resizable Document + Canvas workspace, make changes on both surfaces, reload the application, and recover the Project state.

The Web application is the product-learning target for this iteration.

Tauri is not required before the Web loop is working. Desktop work comes after the shared Web application has a stable core journey.

---

# User-visible Scope

## Dashboard

Implement only what the core journey requires:

- Notespace shell/brand;
- useful zero-project empty state;
- project list;
- `New Project` action;
- opening an existing Project.

Do not implement yet:

- Templates;
- Favorites;
- full Trash workflow;
- project search;
- folders/spaces/tags;
- activity feeds;
- account/billing/plan UI.

## Create Project

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

Creation produces one Project domain entity.

Do not create independent user-facing Note and Canvas resources.

## Project Workspace

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

- Document and Canvas remain siblings under one Project;
- user can resize the split;
- document side accepts basic editable content through the approved document-editor boundary;
- canvas side uses the approved Excalidraw integration;
- project title remains visible at workspace level;
- user can return to Dashboard.

## Persistence

Minimum durability contract:

```text
create/edit
    ↓
persist
    ↓
reload/reopen
    ↓
restore
```

Persist at least:

- Project identity;
- Project title;
- document content required for the chosen editor representation;
- canvas scene required by the Excalidraw adapter;
- split ratio if inexpensive and intentional.

Do not make editor/renderer payloads equal to the whole Notespace Project domain.

---

# Domain Invariant

Preserve:

```text
Project
├── identity
├── title
├── document state
├── canvas state
└── presentation/layout state where appropriate
```

Do not drift into:

```text
Note
Canvas
Project
```

as three independent top-level content types.

Internal storage may normalize state, but ownership remains Project-centric.

---

# Frontend Source Strategy

Use a thin Web-first monorepo structure.

Conceptual starting point:

```text
notespace/
├── .agents/
├── apps/
│   └── web/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

Do not create many packages before real ownership/reuse pressure exists.

Inside the Web app, organize by responsibility:

```text
apps/web/src/
├── routes/
├── app/
├── domain/
├── features/
├── integrations/
├── platform/
└── shared/
```

Create only directories that gain actual owned code.

Future Tauri shell may become `apps/desktop/` after the Web journey works. It should consume/reuse the Web application rather than duplicate it.

---

# Integration Boundaries

## Canvas

Approved direction:

```text
Notespace Project
      ↓
Canvas integration boundary
      ↓
@excalidraw/excalidraw
```

Rules:

- no Excalidraw fork during this iteration;
- no Eraser/structured renderer;
- do not spread Excalidraw internals through domain/dashboard code;
- avoid pushing every high-frequency scene update through global Zustand state.

## Document editor

Still unresolved.

Select it based on concrete Notespace behavior such as:

- structured technical writing;
- code blocks;
- serialization stability;
- accessibility;
- extension model;
- future stable block identity if cross-surface references are introduced.

Do not implement a custom editor engine without evidence that mature editors fail the requirement.

## Persistence/runtime

Still unresolved.

The decision must preserve:

- simple self-hosting;
- reliable persistence;
- clear migration path;
- browser-first correctness;
- future Tauri compatibility;
- low operational complexity.

Do not let ad-hoc TanStack Start server functions silently become a permanent backend architecture before this boundary is intentionally resolved.

---

# Explicit Non-goals

This iteration does **not** include:

- AI;
- Eraser diagrams;
- structured diagram engine;
- semantic/knowledge graph;
- Note ↔ Canvas semantic references;
- multiplayer collaboration;
- CRDT;
- team/workspace membership;
- templates;
- advanced project organization;
- focus timer;
- import/export;
- backup UI;
- instance administration UI;
- macOS/Linux/mobile clients;
- native WinUI/WPF frontend;
- Electron;
- offline conflict resolution;
- analytics;
- a giant design-system package;
- a giant shared Zustand store;
- speculative abstraction for future renderers.

---

# Acceptance Criteria

The iteration is complete only when all applicable criteria have evidence.

## Primary journey

1. Web application starts successfully using documented development instructions.
2. Zero-project dashboard renders a useful empty state.
3. User can create a Project with a title.
4. Creation opens the unified Project workspace.
5. Document and Canvas surfaces are visible together.
6. User can edit document content.
7. User can create or modify at least one Excalidraw element.
8. User can drag the center splitter and both surfaces remain usable.
9. Project state becomes durable.
10. Browser reload restores Project title, document state, and canvas state.
11. Dashboard shows the created Project.
12. Reopening restores the same state.

## Frontend architecture

13. TanStack Start is the application framework; there is no duplicate standalone Vite SPA.
14. Tailwind styling follows `.agents/DESIGN.md`.
15. Radix interactive primitives preserve keyboard/focus/accessibility behavior where used.
16. Zustand is used only for state with justified shared client ownership.
17. Excalidraw remains behind a Notespace-owned integration boundary.
18. The normal Web target runs without Tauri APIs.
19. There is one user-facing Project entity, not independent Note and Canvas resources.
20. No unrelated deferred feature is introduced.

## Quality

21. TypeScript/typecheck passes.
22. Configured lint/static checks pass.
23. Web production build passes.
24. Critical persistence/domain behavior has appropriate automated coverage.
25. At least one browser-level/integration-level verification protects the create → edit → reload → reopen journey, or equivalent evidence is explicitly justified.
26. UI is visually checked against `.agents/DESIGN.md`.
27. Changed interactive primitives receive relevant keyboard/accessibility verification.

---

# Implementation Order

After the remaining persistence/runtime and document-editor decisions are approved:

```text
1. TanStack Start Web application shell
        ↓
2. Project domain + persistence boundary
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
9. Browser end-to-end verification
        ↓
10. Quality gates
        ↓
STOP
```

Do not introduce Tauri before the Web loop works unless a Web implementation decision specifically requires desktop proof.

---

# Material Decision State

## Resolved

- product domain: Project-centric;
- primary target: Web first;
- secondary target: Windows desktop later;
- Windows shell: Tauri + WebView2;
- Web framework: TanStack Start;
- frontend build/dev toolchain: Vite through TanStack Start;
- frontend styling: Tailwind CSS;
- accessible primitive layer: Radix UI;
- shared client state option: Zustand with strict ownership rules;
- canvas engine direction: Excalidraw behind an adapter.

## Still open

- document editor library;
- persistence/database choice;
- server/runtime shape if needed beyond the framework runtime;
- schema/migration tooling;
- self-hosted packaging baseline;
- authentication model, only if/when product requirements require it;
- final desktop persistence/networking relationship when Tauri work begins.

Do not reopen resolved decisions casually. Do not silently resolve remaining material decisions.

---

# Stop Conditions

Stop and request user approval before proceeding if implementation requires:

- changing the Project-centric domain model;
- making Note and Canvas independent first-class resources;
- replacing TanStack Start/Vite/Tailwind/Radix/Zustand as the approved frontend foundation;
- replacing Excalidraw as primary canvas direction;
- introducing macOS/Linux/mobile clients;
- replacing Tauri with another Windows runtime;
- introducing a material backend/service architecture not yet approved;
- choosing a persistence technology with material deployment/migration consequences without approval;
- adding authentication/security boundaries not approved;
- destructive persistence migrations;
- new public contracts;
- expanding this iteration into AI, collaboration, structured diagrams, or knowledge graph features.

---

# Completion / Handoff

When acceptance criteria pass:

1. record concise verification evidence here;
2. mark the vertical slice complete;
3. run a retrospective only if meaningful delivery evidence or friction exists;
4. replace this file with the next active meaningful iteration;
5. do not accumulate a permanent sprint diary.

The next slice must be selected from actual product state and user intent, not a speculative roadmap.
