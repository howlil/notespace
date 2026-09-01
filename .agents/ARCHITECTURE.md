# Notespace — Architecture Boundaries and Engineering Model

This document defines architectural constraints and preferred system boundaries for Notespace.

It deliberately separates **product invariants** from **implementation choices**. The GitHub repository was empty when this baseline was created, so framework/database/runtime choices that are not explicitly committed below must be verified against the code once implementation is pushed.

---

# 1. Architecture objective

Build the simplest self-hosted architecture that preserves the product model:

```text
                         Notespace
                            │
                         Project
                            │
                ┌───────────┴───────────┐
                │                       │
         Document surface         Canvas surface
                │                       │
         editor adapter          canvas adapter
                │                       │
                └───────────┬───────────┘
                            │
                     Project services
                            │
                    persistence boundary
                            │
                 local/self-hosted storage
```

The architecture should make it easy to replace implementation primitives without changing the user-facing Project model.

---

# 2. Core invariants

## 2.1 Project is the aggregate/product ownership boundary

A Project owns the user-visible context for both document and canvas state.

Implementation may normalize or split storage, but the application must preserve one Project identity and lifecycle.

Do not create independently navigable `Note` and `Canvas` aggregate roots without an explicit product requirement.

## 2.2 Editor/renderer dependencies do not own the domain

Excalidraw is expected to be the primary interactive canvas dependency, but Notespace must own the integration boundary.

Preferred dependency direction:

```text
Notespace product/domain
        ↓
canvas port / adapter
        ↓
Excalidraw
```

Avoid:

```text
UI + persistence + domain logic
        ↓
Excalidraw internals everywhere
```

Apply the same rule to the document editor.

## 2.3 Persistence is replaceable behind a narrow boundary

Self-hosting is product-critical; a particular database is not.

Product/domain code should not depend on database-specific query objects, ORM entities, or storage paths where avoidable.

Do not build a generic repository abstraction for every object preemptively. Create boundaries only where persistence concerns actually cross domain ownership.

## 2.4 One deployable by default

Until scale or isolation requirements prove otherwise, prefer a modular monolith/single self-hosted deployment over microservices.

Reasoning:

- local/self-hosted operation benefits from low operational complexity;
- current product scope does not require independent service scaling;
- backup/restore is simpler with a small number of owned state stores;
- deployment and upgrades should remain understandable to individual users.

A service split is a material architecture decision and requires evidence.

---

# 3. Recommended logical modules

These are responsibility boundaries, not mandatory directory names.

```text
Application Shell
│
├── Project Domain
│   ├── project identity/metadata
│   ├── lifecycle
│   └── project-level preferences
│
├── Project Library
│   ├── recent/all/search
│   ├── favorites
│   └── trash
│
├── Workspace
│   ├── split/focus state
│   ├── project navigation
│   └── focus timer integration
│
├── Document Integration
│   └── document-editor adapter
│
├── Canvas Integration
│   └── Excalidraw adapter
│
├── Persistence
│   ├── project persistence
│   ├── document/canvas persistence
│   └── transactional consistency as required
│
├── Portability
│   ├── import
│   ├── export
│   └── backup/restore
│
└── Instance
    ├── settings
    ├── health/version
    └── storage/runtime information
```

Do not create all modules as independent packages if the codebase does not need that isolation. Keep boundaries conceptual first; extract physical packages only when cohesion or dependency control benefits.

---

# 4. Project state model

A useful conceptual model:

```text
Project
├── ProjectMetadata
├── DocumentState
├── CanvasState
├── WorkspaceState
└── FocusSessionState?     # only if persisted
```

The exact schema is implementation-specific.

## ProjectMetadata

Expected stable concerns:

- Project ID;
- title;
- timestamps;
- favorite/trash state if those features exist.

## DocumentState

Owns document-editor content for the Project.

The stored representation may be editor-native initially if that is the smallest correct choice, but application code should avoid assuming that representation is the universal product API.

## CanvasState

Owns spatial state for the Project.

Excalidraw data may be stored as a scene payload, but Notespace should wrap access through an integration boundary.

## WorkspaceState

Examples:

- split ratio;
- document/canvas focus/collapse state;
- optional last viewport state where useful.

Do not persist transient state merely because it exists in React/editor memory. Persist only what improves resume behavior or satisfies a feature requirement.

---

# 5. State taxonomy

Classify state before deciding where it lives.

## Domain state

User-visible, durable product meaning.

Examples:

- project identity/title;
- authored document content;
- authored canvas scene;
- favorite/trash status;
- explicit cross-surface references when/if introduced.

## Presentation state

Visual/editor state that may be durable or transient depending on UX.

Examples:

- split ratio;
- selected element;
- active toolbar;
- current zoom;
- viewport position;
- hovered item.

## Runtime/instance state

Operational facts about the self-hosted installation.

Examples:

- version;
- health;
- storage backend;
- backup status;
- data directory where relevant.

Do not mix these categories in one unbounded state store.

---

# 6. Data flow

## 6.1 Open Project

```text
User selects Project
        ↓
Project application service
        ↓
load Project metadata + owned content state
        ↓
Workspace initializes
        ├── document adapter receives DocumentState
        └── canvas adapter receives CanvasState
        ↓
workspace preferences restored
        ↓
user can edit both surfaces
```

## 6.2 Document edit

```text
User input
   ↓
Document editor
   ↓
Document adapter
   ↓
Notespace-owned change boundary
   ↓
persistence scheduling/commit
```

Do not send document changes through canvas code merely because both are visible in the same screen.

## 6.3 Canvas edit

```text
Pointer/keyboard input
   ↓
Excalidraw
   ↓
Canvas adapter
   ↓
Notespace-owned change boundary
   ↓
persistence scheduling/commit
```

## 6.4 Cross-surface reference — future

If implemented:

```text
Document block identity
        ↓
Project-owned reference
        ↓
Canvas object custom metadata/reference
```

Use product-owned stable IDs for semantic references. Do not use pixel coordinates or mutable editor-generated labels as relational identity.

---

# 7. Canvas integration boundary

The canvas integration should make Excalidraw replaceable without pretending all canvas engines share identical capabilities.

Avoid a giant generic interface that mirrors every Excalidraw API.

Instead expose operations Notespace actually needs, for example conceptually:

```ts
interface ProjectCanvas {
  load(scene: CanvasSnapshot): void;
  snapshot(): CanvasSnapshot;
  focus(): void;
  export(options: ExportOptions): Promise<ExportResult>;
}
```

Add domain-relevant operations only when a real Notespace feature needs them.

If future functionality needs stable references to particular canvas elements, use Excalidraw `customData` or equivalent through the adapter, not directly from unrelated features.

---

# 8. Document integration boundary

The document editor must be selected based on required behavior, not popularity.

Evaluate against:

- structured text model;
- Markdown interoperability if required;
- code blocks and technical writing;
- extension/plugin model;
- serialization stability;
- large-document performance;
- copy/paste behavior;
- future stable block identity if cross-surface references are introduced;
- accessibility;
- licensing and maintenance.

Do not introduce a custom editor engine unless existing mature editors fail a concrete requirement.

---

# 9. Persistence and consistency

## 9.1 Durability expectation

The user should not lose meaningful authored content during normal navigation, refresh, or restart.

Persistence strategy must define:

- when edits become durable;
- what happens on save failure;
- whether optimistic/local state can get ahead of durable state;
- how the user is informed of unsaved/error state;
- what crash/restart behavior is expected.

## 9.2 Atomicity

Because document and canvas are part of one Project but may be edited independently, do not force every keystroke and canvas move into one cross-surface transaction.

Atomicity is required where a single product operation updates multiple pieces of state that must remain consistent.

Examples of future operations that may require multi-record atomicity:

- deleting a Project and its owned metadata/index records;
- creating/removing a cross-surface reference;
- restore/import of a complete Project.

## 9.3 Autosave

Autosave is a likely fit for the product, but implementation must avoid excessive writes.

A typical strategy may use:

- local in-memory updates immediately;
- debounced or batched durable writes;
- explicit flush on navigation/unload where reliable;
- visible error/retry state.

Do not choose debounce intervals without testing actual editor behavior and data size.

---

# 10. Import, export, backup

These are distinct concepts.

## Import

Transforms external content into Notespace-owned state.

Requirements:

- validate format;
- reject malformed input safely;
- avoid path traversal or unsafe file handling;
- define partial failure behavior;
- never silently overwrite an existing Project unless explicitly intended.

## Export

Produces user-portable data.

Prefer formats that preserve user ownership and future migration options.

If the primary export is a Notespace archive, document its version/schema sufficiently to support future migrations.

## Backup

Captures installation state for recovery.

A backup must be evaluated by restore ability, not by archive creation alone.

A “backup succeeded” claim should ultimately be backed by restore verification at least in tests or controlled qualification.

---

# 11. Self-hosted deployment principles

## Minimize operational dependencies

Every required process, database, queue, object store, browser runtime, or external service increases self-hosting cost.

Do not add infrastructure without a concrete requirement.

## Explicit persistent data ownership

The deployment must make durable data locations clear.

Users/operators should be able to answer:

- what must be persisted across container replacement;
- what must be backed up;
- what can be regenerated;
- what version migrations change.

## Upgrade safety

Application upgrades must consider:

- schema migrations;
- backward compatibility where necessary;
- backup before destructive migration;
- rollback feasibility;
- startup failure behavior.

A destructive or irreversible migration is a stop condition requiring explicit review.

---

# 12. Security model

The exact authentication model is currently open; do not invent one without product requirements.

Regardless of authentication, preserve these baseline controls.

## Untrusted content

Treat imported files, Markdown/HTML-like content, images, and editor payloads as untrusted input.

Protect against:

- XSS;
- unsafe URL/embed behavior;
- malicious SVG/HTML content;
- archive bombs or oversized payloads;
- path traversal;
- arbitrary file reads/writes;
- unsafe deserialization.

## Browser rendering

If rich content or embeds are rendered, use safe sanitization and restrictive defaults.

Do not enable arbitrary script execution from Project content.

## Server boundaries

If the web frontend calls a backend API:

- validate authorization/ownership at the server boundary when auth exists;
- validate input schemas;
- avoid trusting client-provided paths or storage IDs;
- use CSRF protection where the chosen auth/session architecture requires it.

## Secrets

Secrets must come from deployment configuration, never Project data or committed source.

Do not expose instance secrets through diagnostic/settings endpoints.

---

# 13. Performance model

Performance work should follow measurement.

Potential hot paths:

- loading a large Project;
- serializing/deserializing Excalidraw scenes;
- editor rendering for large documents;
- autosave frequency;
- dashboard thumbnail generation;
- project search/indexing;
- large image handling.

Useful performance budgets should be established after a representative workload exists.

Avoid speculative virtualization, worker farms, distributed caches, or custom rendering engines before profiling shows need.

---

# 14. Reliability and failure modes

Design explicit behavior for:

## Persistence failure

Expected system behavior:

- keep the editing session alive where possible;
- surface unsaved/error state;
- retry safely;
- do not report success before durable write succeeds.

## Corrupt Project state

The loader should fail locally to the affected Project where possible rather than crashing the entire instance.

Provide diagnosable errors and preserve raw data for recovery when feasible.

## Storage unavailable/full

Treat disk/storage exhaustion as an operational failure that must be visible.

## Failed import

Do not leave half-created user-visible Projects without explicit recovery semantics.

## Failed migration

Startup/migration failure must not silently continue with partially transformed data.

---

# 15. Observability

Self-hosted observability should be useful without requiring a hosted telemetry vendor.

Baseline goals:

- structured application logs;
- clear startup/configuration errors;
- health/readiness indication where a server process exists;
- migration logs;
- backup/import/export operation results;
- storage errors with actionable context.

Metrics/tracing should be added when there is an operational question they answer.

Do not add an observability stack purely for architecture completeness.

Telemetry that sends user information outside the self-hosted instance requires explicit product/privacy review.

---

# 16. Testing architecture

Prefer tests at boundaries that protect observable behavior.

## Unit tests

Useful for:

- pure domain transitions;
- parsing/validation;
- import/export transforms;
- persistence mapping where logic exists;
- timer state logic;
- migration helpers.

## Integration tests

Useful for:

- project persistence round trips;
- Project create/open/delete/restore;
- editor adapter serialization;
- canvas adapter serialization;
- import/export;
- migration and backup/restore behavior.

## UI/end-to-end tests

Protect core journeys:

```text
Dashboard → Create Project → Workspace → edit document/canvas → reload → state restored
```

and high-risk workflows such as destructive operations and import.

Do not test implementation trivia that makes refactoring unnecessarily expensive.

---

# 17. Dependency strategy

## Excalidraw

Expected primary canvas dependency.

Integration rules:

- prefer package integration over maintaining a fork;
- pin/use a supported patched version;
- wrap Notespace-specific behavior at the adapter boundary;
- preserve ability to upgrade upstream;
- do not copy internal Excalidraw implementation into the domain.

Fork only if a proven product requirement cannot be supported through extension/integration APIs and the long-term maintenance cost is accepted.

## Eraser diagrams

Deferred optional dependency for structured diagrams.

Do not add in V1 without a concrete feature requiring deterministic structured layout.

## New dependencies

For every dependency, record the problem, scope, operational impact, security/licensing implications, and replacement difficulty when material.

---

# 18. Architecture decision thresholds

## Agent may decide locally

Examples:

- helper placement;
- internal function boundaries;
- local state shape;
- test structure;
- small adapter methods;
- refactor necessary to make the requested change safe.

## User approval required

Examples:

- introducing a separate backend/service;
- replacing the primary editor/canvas engine;
- changing Project ownership semantics;
- introducing collaboration/CRDT architecture;
- changing persistence technology in a way that affects deployment/migration;
- adding external hosted infrastructure to a self-hosted default;
- new public API/contracts;
- authentication/authorization model;
- destructive data migrations;
- major plugin/extensibility architecture.

---

# 19. Open implementation decisions

Sprint 1 implements the previously approved frontend/backend skills and the user's execution scope:

- TanStack Start SPA mode, React 18, TypeScript, Vite, Tailwind and Radix dialogs. Route loaders call the same-origin Go API. No additional Node runtime process is deployed.
- Tiptap StarterKit behind the document adapter; Excalidraw behind the canvas adapter. Each Project stores versioned snapshots of both and a split ratio.
- Go `net/http` + `database/sql` + pure-Go `modernc.org/sqlite`. Explicit SQL, embedded transactional migrations, WAL + FULL synchronous, one database connection.
- Go serves the Start-generated shell and assets. One Docker container, one SQLite volume; default published host interface is loopback.
- Saves are debounced 650 ms, serialized per project and guarded by the last acknowledged version. Navigation flushes; failed saves preserve local state and block app navigation. Browser unload warns on unsaved changes. No durability claim applies before acknowledgement.
- Go testing/httptest, Node's test runner for autosave ordering, Playwright for browser journeys, GitHub Actions for gates and Docker restart smoke coverage.

Still deferred/open: authentication, collaboration, portable import/export, real content thumbnail generation, and desktop networking. No public API compatibility guarantee is introduced by the initial internal CRUD API.
