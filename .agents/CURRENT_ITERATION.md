# Current Iteration — Bootstrap the First End-to-End Project Slice

**Status:** READY AFTER DOCUMENT-EDITOR DECISION

**Canonical role:** source of truth for the active meaningful iteration. Replace this file when the iteration changes; do not accumulate a permanent sprint diary.

---

# Feature Compass

## Feature Shape

Prove the core Notespace loop on Web first:

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
Edit both
      ↓
Persist through Go + SQLite
      ↓
Reload / reopen
      ↓
Same Project state
```

## Current Position

Lifecycle:

`USER INTENT → UNDERSTAND → BOUND → SPECIFY → DESIGN → [DOCUMENT EDITOR DECISION] → IMPLEMENT`

Repository currently contains the canonical `.agents/` context but no application implementation yet.

Resolved implementation decisions are now documented in:

- `.agents/skill/fe-skill.md`
- `.agents/skill/go-sqlite-skill.md`

## Delta

Committed before implementation:

- Project-centric product/domain model;
- Web as the first implementation target;
- Windows later through Tauri + WebView2 using the same Web UI;
- TanStack Start + React + TypeScript + Vite;
- Tailwind CSS;
- Radix UI;
- Zustand only for justified shared client state;
- Excalidraw behind a Notespace-owned adapter;
- Go backend;
- Go standard library HTTP stack (`net/http`), no web framework;
- `database/sql` + SQLite;
- explicit SQL, no ORM/query-builder by default;
- Notespace-owned embedded SQL migrations, no migration framework;
- stdlib `log/slog` and `testing` baseline.

## Next Move

**Single next meaningful action:** select the document editor, then bootstrap the monorepo and implement the first vertical slice.

Do not reopen resolved frontend/backend decisions during normal implementation.

---

# Committed Platform Scope

```text
Notespace
├── Web browser client        ← BUILD FIRST
└── Windows desktop client
    └── Tauri + WebView2      ← LATER, same Web UI
```

Do not introduce macOS, Linux desktop, mobile, WinUI/WPF, Electron, Flutter, React Native, Qt, or another client runtime without explicit approval.

The Tauri application is a thin desktop shell, not a second frontend architecture.

---

# Committed Frontend Stack

Canonical rule: `.agents/skill/fe-skill.md`

```text
TanStack Start
    ↓
React + TypeScript
    ↓
Vite
    ↓
Tailwind CSS
    ↓
Radix UI
    ↓
Zustand where justified
```

State ownership order:

```text
local interaction          → React local state
navigation/history         → TanStack route/search state
server/application data    → data/application boundary
editor/canvas transient    → integration boundary
shared client-only state   → Zustand
```

Do not create a giant global Zustand store or mirror complete Excalidraw/editor state into it on every high-frequency change.

---

# Committed Backend + Persistence Stack

Canonical rule: `.agents/skill/go-sqlite-skill.md`

```text
Web client
    ↓
HTTP/JSON
    ↓
Go standard library
    ↓
net/http
    ↓
Project application/domain logic
    ↓
database/sql
    ↓
SQLite
```

Rules:

- no Gin/Echo/Fiber/Chi or other HTTP framework/router;
- use modern stdlib `http.ServeMux` routing capabilities;
- no ORM/query builder by default;
- explicit parameterized SQL;
- SQLite WAL unless evidence shows a concrete incompatibility;
- Notespace-owned SQL migrations embedded/run natively;
- no migration framework initially;
- `log/slog` for structured logging;
- Go `testing` + `httptest` for backend tests;
- external SQLite driver is allowed because stdlib does not provide one;
- exact SQLite driver remains open if CGO vs pure-Go trade-offs materially affect packaging/performance.

Backend should remain one simple self-hosted process and one primary SQLite database for current scope.

---

# Monorepo Strategy

Web-first thin monorepo:

```text
notespace/
├── .agents/
├── apps/
│   ├── web/
│   └── server/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

`apps/server/` is a Go module and does not need to be managed by pnpm.

Preferred backend conceptual layout:

```text
apps/server/
├── cmd/notespace/main.go
├── internal/
│   ├── project/
│   ├── httpapi/
│   └── persistence/
├── migrations/
├── go.mod
└── go.sum
```

Do not create empty packages or generic controller/service/repository boilerplate for symmetry.

Do not create `packages/*` until a real second consumer or hard dependency boundary exists.

Tauri may later become `apps/desktop/` after the Web loop works.

---

# Iteration Goal

Deliver the smallest runnable Notespace Web application proving:

> A user can create one Project from the dashboard, enter a resizable Document + Canvas workspace, make changes on both surfaces, persist them through the Go + SQLite backend, reload, and recover the same Project state.

This iteration is Web-first. Tauri is deferred until the Web product loop is working.

---

# User-visible Scope

## Dashboard

Only:

- Notespace shell/brand;
- zero-project empty state;
- project list;
- `New Project`;
- open Project.

Do not implement Templates, Favorites, full Trash workflow, project search, folders/tags, account/billing, or other deferred dashboard features.

## Create Project

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

## Workspace

```text
┌──────────────────────────────────────────────────────┐
│ ‹  Project Title                          controls  │
├───────────────────────┬──────────────────────────────┤
│                       │                              │
│      DOCUMENT         │            CANVAS            │
│                       │                              │
└───────────────────────┴──────────────────────────────┘
                        ↑
                  draggable splitter
```

Required:

- Document and Canvas are siblings under one Project;
- split is resizable;
- document accepts editable content through the selected editor adapter;
- canvas uses Excalidraw through the Notespace canvas adapter;
- dashboard navigation remains available.

## Persistence

```text
client edit
    ↓
coalesced/debounced save
    ↓
Go application boundary
    ↓
SQLite durable write
    ↓
success/error
```

Persist at least:

- Project ID;
- title;
- document content;
- canvas scene/snapshot;
- split ratio if inexpensive and intentional.

Do not write every keystroke/pointer event directly to SQLite.

Do not make editor or Excalidraw representation equal to the entire Project domain.

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

Never drift into independent top-level `Note`, `Canvas`, and `Project` resources.

Internal storage may normalize state, but lifecycle/ownership remains Project-centric.

---

# Integration Boundaries

## Document Editor

**Still open.** This is the remaining material bootstrap decision.

Select based on:

- technical/structured writing;
- code blocks;
- serialization stability;
- accessibility;
- extension model;
- large-document behavior;
- future stable block identity if cross-surface references are introduced.

Do not create a custom editor engine without evidence mature editors fail the requirement.

## Canvas

```text
Notespace Project
      ↓
Canvas adapter
      ↓
@excalidraw/excalidraw
```

No fork, no Eraser renderer, no direct Excalidraw coupling across unrelated code.

## Backend

```text
HTTP handler
    ↓
application use case
    ↓
Project persistence boundary
    ↓
SQLite implementation
```

Avoid raw SQL in handlers and avoid generic enterprise repository/service abstractions.

---

# Explicit Non-goals

No:

- AI;
- Eraser/structured diagram engine;
- knowledge graph;
- semantic Document ↔ Canvas references;
- collaboration/CRDT;
- authentication unless separately approved;
- teams;
- templates;
- advanced organization;
- focus timer;
- import/export;
- backup UI;
- instance administration UI;
- Tauri implementation before Web loop works;
- additional desktop/mobile platforms;
- Redis;
- PostgreSQL;
- message queues;
- microservices;
- Go HTTP framework;
- ORM/query builder;
- migration framework;
- giant frontend design-system package;
- giant Zustand store.

---

# Acceptance Criteria

Primary journey:

1. Web app starts with documented development instructions.
2. Go server starts and applies migrations to a clean SQLite database.
3. Zero-project dashboard renders correctly.
4. User creates a Project with a title.
5. Creation opens the unified workspace.
6. Document and Canvas are visible together.
7. User edits document content.
8. User creates/modifies an Excalidraw element.
9. User resizes the splitter.
10. State becomes durable through the Go + SQLite backend.
11. Browser reload restores title, document, canvas, and relevant layout state.
12. Dashboard lists the Project.
13. Reopening restores the same state.

Architecture/quality:

14. TanStack Start is the Web framework; no duplicate SPA architecture.
15. Go uses `net/http`; no HTTP framework/router dependency.
16. Persistence uses `database/sql` + SQLite; no ORM/query builder.
17. Migrations run through Notespace-owned SQL migration logic.
18. Project remains the single user-facing aggregate.
19. Excalidraw remains behind its adapter.
20. Normal Web execution has no Tauri dependency.
21. Typecheck/static checks pass.
22. Web production build passes.
23. `go test ./...` passes.
24. Go server builds.
25. SQLite persistence round-trip and restart/reopen behavior have automated coverage.
26. At least one browser/integration-level verification protects create → edit → persist → reload → reopen.
27. UI is visually checked against `.agents/DESIGN.md`.
28. No unrelated deferred scope is introduced.

---

# Implementation Order

After document-editor selection:

```text
1. Bootstrap pnpm workspace + TanStack Start Web app
        ↓
2. Bootstrap Go stdlib server
        ↓
3. SQLite connection + native migration runner
        ↓
4. Project domain/persistence behavior
        ↓
5. Minimal Project HTTP endpoints required by Web
        ↓
6. Dashboard + Create Project
        ↓
7. Workspace shell + splitter
        ↓
8. Document editor adapter
        ↓
9. Excalidraw adapter
        ↓
10. Save/restore integration
        ↓
11. Browser E2E + backend persistence tests
        ↓
12. Quality gates
        ↓
STOP
```

Do not build a comprehensive backend API before the user journey requires it.

---

# Material Decision State

## Resolved

- Project-centric domain;
- Web-first target;
- Windows later via Tauri/WebView2;
- TanStack Start + React + TypeScript + Vite;
- Tailwind CSS;
- Radix UI;
- Zustand with strict ownership;
- Excalidraw behind an adapter;
- Go backend;
- stdlib `net/http`, no framework;
- `database/sql` + SQLite;
- explicit SQL, no ORM/query builder;
- native embedded SQL migrations;
- stdlib logging/testing baseline.

## Still open

- document editor library;
- exact SQLite driver if CGO vs pure-Go materially affects deployment/performance;
- self-host packaging details;
- authentication model if future product scope requires it;
- final Tauri networking/persistence integration when desktop work begins.

Do not silently reopen resolved decisions.

---

# Stop Conditions

Stop for explicit approval before:

- changing Project ownership semantics;
- making Note/Canvas independent resources;
- replacing approved frontend stack;
- replacing Go stdlib HTTP architecture with a framework;
- replacing SQLite with another primary database;
- adding an ORM/query-builder/migration framework as architecture;
- replacing Excalidraw direction;
- adding new platform targets;
- replacing Tauri;
- introducing authentication/security boundaries;
- destructive/irreversible migrations;
- committing new public compatibility contracts;
- expanding into AI, collaboration, structured diagrams, or knowledge graph features.

---

# Completion / Handoff

When acceptance criteria pass:

1. record concise verification evidence here;
2. mark the slice complete;
3. run a retrospective only if meaningful evidence/friction exists;
4. replace this file with the next active iteration;
5. stop rather than automatically expanding scope.
