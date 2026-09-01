# Current Iteration — Bootstrap the First End-to-End Project Slice

**Status:** READY FOR IMPLEMENTATION AFTER REMAINING STACK APPROVAL

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
- first real end-to-end vertical slice bounded below;
- client platform scope explicitly narrowed to Web + Windows desktop;
- Windows desktop shell explicitly selected as Tauri.

## Next Move

**Single next meaningful action:** resolve the remaining bootstrap stack decisions, then implement this vertical slice without expanding scope.

The client platform boundary is no longer open:

```text
Notespace clients
├── Web browser client
└── Windows desktop client
    └── Tauri shell using Windows WebView2
```

Tauri is intentionally treated as a native desktop shell around the web UI, not as a native WinUI rendering stack. The Windows product should reuse the approved web application UI where practical rather than create a second independent Windows UI implementation.

Remaining material bootstrap decisions include the exact web framework/build tooling, persistence/runtime shape, document editor, and self-hosted packaging.

---

# Platform Scope — COMMITTED

## Supported clients

Current product scope supports exactly:

1. a browser-based Web client;
2. a Windows desktop client packaged with Tauri.

Do not introduce macOS, Linux desktop, mobile, WinUI/WPF, Electron, Flutter, React Native, Qt, or another client runtime unless the user explicitly expands platform scope.

## Windows Tauri model

The Windows application should be understood as:

```text
Windows executable
      ↓
Tauri native shell / Rust host
      ↓
Windows WebView2
      ↓
Notespace web application UI
```

Implications:

- Windows UI is web-rendered, not WinUI-native;
- do not duplicate the entire frontend for Windows;
- desktop-only capabilities must stay behind a narrow platform bridge;
- ordinary Project/domain/UI behavior should remain shared with the Web client;
- avoid leaking Tauri APIs throughout domain and presentation code;
- browser execution must not require Tauri globals;
- Windows-specific filesystem/window/update/integration features may use Tauri commands/plugins only when required by a concrete feature.

Preferred dependency direction:

```text
Notespace Web/Application UI
          │
          ├──────── browser adapter
          │
          └──────── desktop platform port
                         ↓
                      Tauri
                         ↓
                 Windows native APIs
```

Avoid:

```text
components everywhere
      ↓
direct invoke("...") / Tauri plugin calls
      ↓
Windows-only coupling
```

The Web client must remain a first-class runnable target.

---

# Iteration Goal

Deliver the smallest runnable Notespace application that proves:

> A user can create one Project from the dashboard, enter a resizable Document + Canvas workspace, make changes on both surfaces, reload the application, and recover the Project state.

The primary implementation target for this iteration should be the Web application. The Tauri Windows shell should be introduced only to the extent required to prove the same application can run as the approved Windows desktop target without creating a second UI architecture.

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

## Desktop platform

Tauri must remain an integration boundary rather than becoming application architecture.

Conceptually:

```text
Feature/application code
       ↓
platform capability port
       ↓
Web implementation OR Tauri implementation
```

Examples of capabilities that may eventually justify a platform port:

- native file dialogs;
- filesystem access;
- app window controls;
- desktop notifications;
- auto-update;
- OS integration.

Do not introduce these capabilities in this iteration unless they are required to satisfy an acceptance criterion.

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
- macOS client;
- Linux desktop client;
- mobile clients;
- WinUI/WPF native Windows UI;
- Electron;
- desktop-only feature expansion unrelated to the core Project loop;
- offline conflict resolution;
- analytics;
- speculative abstraction for future renderers.

Do not add these because they appear in long-term product documents or general desktop best practices.

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

## Platform

13. The approved Web target runs independently in a normal supported browser without requiring Tauri runtime APIs.
14. The same application UI can be launched in the Windows Tauri shell without maintaining a second Windows UI implementation.
15. Tauri-specific calls, if any are needed, are isolated behind a platform integration boundary.

## Domain/architecture

16. There is one user-facing Project entity, not independent Note and Canvas resources.
17. Excalidraw is behind a Notespace-owned integration boundary rather than spread through unrelated application code.
18. Persistence failure is not reported as a successful save if the implementation has an explicit save state.
19. No unrelated future feature is introduced.

## Quality

20. Typecheck/static checks pass where the selected stack provides them.
21. Lint/format checks pass where configured.
22. Build passes for the Web target.
23. Windows Tauri build/qualification passes once the desktop shell is introduced in this iteration.
24. Tests cover the critical domain/persistence behavior appropriate to the selected architecture.
25. At least one integration/e2e-level check protects the create → edit → reload → reopen journey, or the absence of that level is explicitly justified with equivalent evidence.
26. The implementation is visually checked against `.agents/DESIGN.md` rather than accepted from component tests alone.

---

# Implementation order

Once the remaining stack choices are approved, prefer this sequence:

```text
1. Runnable Web application shell
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
9. Web end-to-end verification
        ↓
10. Thin Windows Tauri shell using the same UI
        ↓
11. Windows qualification
        ↓
12. Quality gates
        ↓
STOP
```

This ordering keeps product learning centered on one implementation while proving the approved Windows delivery target after the Web loop works.

Do not build a second Windows frontend, a large Rust domain layer, a large backend layer, design system, or abstraction framework before the user journey exists.

---

# Material Decision Gate — Remaining Initial Stack

## Resolved

The following are now approved:

- client platforms: **Web + Windows only**;
- Windows packaging/runtime: **Tauri**;
- Windows UI strategy: reuse the Web application through WebView2 rather than WinUI/WPF native rendering;
- Excalidraw remains the preferred primary canvas dependency behind a Notespace adapter.

## Still open

Because the repository contains no application code, the following still require approval or explicit implementation evidence:

- exact web framework/build system;
- server/runtime shape, if any;
- persistence/database choice;
- document editor library;
- self-hosted packaging baseline;
- how Tauri desktop persistence/networking relates to the self-hosted server model if both are present.

The remaining decisions should optimize for:

1. simple self-hosting;
2. shared Web/Windows UI without platform coupling;
3. minimal operational dependencies;
4. easy Excalidraw embedding;
5. reliable persistence and migration path;
6. testability;
7. low framework ceremony;
8. browser-first correctness;
9. a thin Tauri shell rather than a second application architecture;
10. ability to evolve without prematurely becoming distributed infrastructure.

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

Explicit user platform decision on 2026-09-01:

- Web client required;
- Windows client required;
- Windows client should use Tauri;
- no macOS/Linux client in current scope.

---

# Stop Conditions

Stop and request user approval before proceeding if implementation requires:

- changing the Project-centric domain model;
- making Note and Canvas independent first-class resources;
- replacing Excalidraw direction with another primary canvas engine;
- introducing macOS/Linux/mobile clients;
- replacing Tauri with another Windows shell/runtime;
- creating a separate WinUI/WPF Windows frontend;
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