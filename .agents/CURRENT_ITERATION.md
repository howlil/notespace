# Current Iteration — Repository Foundation and Implementation Sync

**Status:** ACTIVE

**Canonical role:** This file is the source of truth for the currently active meaningful iteration. Update it as work progresses. Do not create parallel competing iteration-state files.

---

# Feature Compass

## Feature Shape

Notespace is being established as a free, self-hosted Project workspace where one Project contains both:

- a linear/document surface;
- a spatial/Excalidraw canvas surface.

The intended primary product path is:

```text
Dashboard
   ↓
Project
   ↓
Resizable Document | Canvas workspace
```

The `.agents` foundation exists so future implementation work preserves that product/domain shape.

## Current Position

Lifecycle position:

`USER INTENT → UNDERSTAND → BOUND → SPECIFY → DESIGN → [IMPLEMENTATION SYNC]`

Product shape, architecture boundaries, and design direction have been specified from the current design/research conversation.

The GitHub repository `howlil/notespace` contained no checked-in application implementation when this iteration state was created. Only the `.agents` operating baseline is currently present on GitHub.

The user stated that Notespace has already been created, so an implementation may exist locally or elsewhere; that implementation has not yet been observable from this repository.

## Delta

Completed in this iteration:

- established canonical agent workflow;
- externalized Notespace product/domain intent;
- documented architecture boundaries;
- documented UI/UX design direction;
- documented quality gates;
- documented evidence-driven retrospective process;
- made active iteration state resumable without chat history.

No application code, framework, database, editor integration, deployment configuration, tests, or CI decisions have been inferred from the empty repository.

## Next Move

**Single next meaningful action:** synchronize/inspect the actual Notespace implementation in this repository.

Once implementation code is available:

1. inspect repository structure, package manifests, runtime, editor dependencies, persistence, tests, and deployment configuration;
2. compare observed implementation against `.agents/PROJECT.md` and `.agents/ARCHITECTURE.md`;
3. distinguish intentional decisions from accidental scaffolding defaults;
4. update the open implementation decisions in `ARCHITECTURE.md` with repository facts;
5. define the first implementation iteration as the smallest user-visible vertical slice that moves the existing app toward the committed product shape.

Do **not** choose or rewrite the stack solely from these planning documents before inspecting the actual implementation.

---

# Why this iteration exists

The project already has substantial product reasoning from design research, but an empty repository would otherwise force each engineering agent to reconstruct intent from conversation history.

This iteration creates durable context so any agent can answer:

- What is Notespace?
- What is the primary domain entity?
- What is the intended UI shape?
- Which features are committed vs deferred?
- What architecture boundaries must be preserved?
- What remains unknown because code is not yet visible?
- What should happen next?

---

# In scope

- `.agents` operating model;
- Notespace product specification;
- domain boundaries;
- canvas/editor integration principles;
- self-hosted constraints;
- design intent;
- verification and retrospective rules;
- implementation discovery handoff.

# Out of scope

Until actual code is inspected, this iteration does not authorize:

- choosing/replacing frontend framework;
- choosing/replacing backend runtime;
- choosing database/ORM;
- choosing document-editor library;
- implementing Excalidraw integration from scratch;
- adding Eraser diagrams;
- adding AI;
- adding CRDT/collaboration;
- introducing authentication architecture;
- designing deployment infrastructure;
- building features based only on speculative future scope.

---

# Decisions established

## Product

- Notespace is free and self-hosted.
- `Project` is the primary user-facing content entity.
- Document and Canvas are two first-class interaction surfaces of the same Project.
- Dashboard/Home precedes entry into a Project workspace.
- Project workspace uses a resizable split and supports focus states.
- A lightweight project-level focus timer is part of the product direction.
- SaaS billing/upgrade/product-quota UI is not part of the product.

## Canvas

- Excalidraw is the preferred primary interactive freeform canvas direction.
- Excalidraw must remain behind a Notespace-owned integration boundary.
- Eraser-style structured diagram rendering is deferred and must not become the primary canvas.

## Architecture

- Prefer the simplest self-hosted deployable/modular-monolith shape until requirements prove otherwise.
- Project/domain state must not become equivalent to third-party editor JSON.
- Persistence technology remains open until actual implementation is inspected.
- Collaboration/CRDT architecture is not current scope.

## Design

- calm, content-forward, tool-like visual language;
- Geist typography direction;
- restrained violet accent;
- subtle depth/elevation;
- dark-mode capable;
- avoid generic AI/SaaS visual patterns.

---

# Open questions to resolve from repository evidence

When code becomes visible, determine:

- What framework/runtime is already used?
- Is the application client-only, client/server, or something else?
- Which document editor is already present?
- Is Excalidraw already integrated?
- What persistence implementation exists?
- Is project data currently modeled as one aggregate or separate Note/Canvas resources?
- How is autosave handled?
- What import/export exists?
- Is self-hosted packaging already defined?
- What tests and CI exist?
- What is the current runnable/working user flow?

Do not ask the user questions that repository inspection can answer.

---

# Evidence

Observed repository state at iteration creation:

- repository: `howlil/notespace`;
- default branch: `master`;
- repository was empty before `.agents` files were created;
- no application source files were available for stack or implementation analysis.

Product/design evidence is captured in:

- `.agents/PROJECT.md`;
- `.agents/DESIGN.md`;
- Figma exploration referenced by `DESIGN.md`.

---

# Completion criteria

This foundation iteration is complete when:

- the actual application implementation is available in the repository;
- an agent has inspected it;
- observed stack/architecture facts are reflected in `.agents/ARCHITECTURE.md`;
- the first code-changing vertical slice has explicit scope and acceptance criteria in this file.

At that point, replace this iteration content with the next active iteration rather than accumulating a permanent status diary here.

Historical evidence belongs in git history/PRs and, when useful, a concise retrospective—not in an ever-growing `CURRENT_ITERATION.md`.
