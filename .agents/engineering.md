# Notespace Engineering Rules

This file is the repository-local engineering contract for implementation and refactoring. Read it before changing application structure, ownership, module boundaries, or code organization.

The goal is not to maximize abstraction. The goal is to keep ownership obvious, dependencies directional, changes local, and verification proportional to risk.

## 1. Core engineering model

Use this dependency model for `apps/web`:

```text
route
  ↓
page composition
  ↓
feature / use-case
  ↓
domain
  ↘
   adapter / I/O

shared = generic foundation
```

Dependency direction matters more than folder names.

A file should live with the capability that owns its behavior, not with the technology it happens to use.

## 2. Web ownership model

Preferred top-level responsibilities:

```text
apps/web/src/
├── app/        application bootstrap and global providers
├── routes/     URL boundary and route data wiring
├── pages/      screen-level composition
├── features/   product behavior and use-cases
├── domain/     pure product models, rules, and state transformations
├── adapters/   HTTP, browser, storage, and external technology boundaries
└── shared/     genuinely generic UI and utilities
```

Do not create a folder only because a pattern exists elsewhere. Add a boundary only when it clarifies ownership or dependency direction.

## 3. Allowed dependency direction

Default rules:

```text
routes   → pages, domain, adapters, shared
pages    → features, domain, adapters, shared
features → domain, adapters, shared
adapters → domain, shared
domain   → domain only
shared   → shared only
```

Important constraints:

- `domain` must not depend on React, routes, features, adapters, browser APIs, or HTTP.
- `shared` must not contain Notespace-specific product behavior.
- A feature should not import another feature's implementation by default.
- If two features share stable product rules or data shapes, move that shared concept down to `domain`.
- If two features only need to appear together, compose them in a page or application boundary.
- Technology-specific code must not become the owner of product concepts merely because it renders or persists them.

These rules should be enforced through automated architecture tests when practical.

## 4. Routes

`routes/` is the URL boundary.

A route may:
- declare the route;
- parse route params/search state;
- load route-level data;
- redirect;
- select pending/error/not-found UI;
- hand data to a page.

A route should not own:
- product workflows;
- editor state;
- mutation orchestration;
- reusable feature behavior;
- large presentation trees.

Keep TanStack file-based routing in `src/routes`.

## 5. Pages

A page is a screen-level composition boundary.

Examples:
- Home
- Category
- Workspace
- Today
- Inbox

Pages may combine multiple features and application-level layout.

Pages should stay thin enough that product behavior remains owned by features or domain modules.

If a component primarily represents an entire routed screen, prefer `pages/` over `features/`.

## 6. Features

A feature owns a coherent user-facing capability or use-case.

Examples:
- workspace authoring;
- planning;
- capture;
- search;
- activity/study;
- library management.

A feature may contain local UI, hooks, orchestration, state, and feature-specific helpers.

Prefer cohesion over technical grouping:

```text
features/workspace-authoring/
├── model/
├── ui/
├── document/
└── canvas/
```

Do not split code into global `hooks/`, `utils/`, or `components/` folders when the code has one clear feature owner.

## 7. Domain

`domain/` contains stable Notespace concepts and pure rules.

Examples:
- workspace and note models;
- planning models and transformations;
- diagram model and routing rules;
- autosave state machines;
- conflict-resolution rules;
- code-language rules.

Domain code should be:
- deterministic where possible;
- framework-independent;
- transport-independent;
- easy to unit test without browser or network setup.

HTTP endpoints, fetch calls, React hooks, localStorage, IndexedDB, and third-party editor APIs do not belong in domain.

Use canonical product terminology. New web code should prefer `Workspace` terminology. Keep `Project` naming only where compatibility requires it, and do not expand legacy naming.

## 8. Adapters

`adapters/` owns external and side-effect boundaries.

Examples:

```text
adapters/
├── http/
├── browser/
└── assets/
```

Typical responsibilities:
- fetch/HTTP transport;
- mapping API payloads to domain shapes;
- browser storage;
- BroadcastChannel;
- asset persistence;
- external SDK wrappers.

Adapters implement infrastructure concerns; they do not own product behavior.

## 9. Shared code

`shared/` is for code that is genuinely reusable without knowing Notespace product semantics.

Good examples:
- Button;
- Dialog primitive;
- generic popup behavior;
- generic class-name helper;
- generic formatting helper.

Bad examples:
- WorkspaceSidebar;
- WorkspaceMutationPolicy;
- QuickCapture;
- LibraryTools;
- CanvasNoteArtifact.

If the name contains a product concept, it usually has a product owner and should not be in `shared`.

## 10. Third-party editor boundaries

Tiptap and Excalidraw are implementation technologies behind Notespace-owned behavior.

Do not let library-specific types leak farther than necessary.

Preferred direction:

```text
Notespace feature/domain
        ↓
editor adapter/component
        ↓
Tiptap / Excalidraw
```

Canvas/document code that directly implements Workspace authoring behavior should remain owned by the Workspace authoring feature even when it wraps third-party libraries.

Shared product concepts used by both Canvas and other features must live below them in `domain`, not inside one adapter.

## 11. Component and file responsibilities

Do not split files based only on line count.

Split when one file owns multiple reasons to change.

Prefer separating:

```text
composition
→ state/model
→ commands/use-cases
→ presentation
```

A component should not simultaneously become the primary owner of:
- routing;
- remote mutation;
- domain transformation;
- editor lifecycle;
- large presentation trees.

Large third-party integration components can remain large when the behavior is cohesive, but orchestration and pure logic should be extracted when doing so creates a clearer boundary.

## 12. Naming and placement test

Before adding a file, answer:

1. What behavior does this file own?
2. Which capability changes when this file changes?
3. What may this file depend on?
4. Who may depend on this file?

If those answers are unclear, do not add a new abstraction yet.

Prefer:

```text
reuse existing owner
→ extend existing owner
→ small local abstraction
→ new module
→ new architectural boundary
```

## 13. Imports

Prefer imports that reveal ownership.

Do not use path aliases to hide architectural violations.

Aliases may be added for readability only after boundaries are stable.

Avoid barrel files that create unclear dependency edges, accidental cycles, or broad imports. Use them only when they form an intentional public boundary.

## 14. Refactoring discipline

Structural refactors must preserve behavior unless behavior change is explicitly requested.

For architecture refactors:

```text
define target dependency graph
→ add or strengthen architecture checks
→ move one ownership boundary at a time
→ update imports
→ run narrow verification
→ continue
```

Avoid big-bang folder migrations.

Do not mix broad cleanup, redesign, new features, and architecture migration in one change unless they are inseparable.

## 15. Verification

For structural changes, verify at least:

- TypeScript typecheck;
- lint;
- relevant unit tests;
- architecture-boundary tests;
- build when import/module topology changes.

Add deterministic architecture tests for durable rules instead of relying on documentation alone.

Tests should validate meaningful boundaries, not exact incidental file layouts unless the layout itself is the contract.

## 16. Current Notespace migration direction

When touching existing web code, move toward these boundaries incrementally:

```text
features/dashboard        → pages/home
features/category         → pages/category
features/workspace screen → pages/workspace
features/today screen     → pages/today
features/inbox screen     → pages/inbox

components/ui             → shared/ui
application Sidebar       → app/page composition owner

domain/project HTTP       → adapters/http
domain/project model      → domain/workspace

integrations/document     → workspace-authoring/document
integrations/canvas       → workspace-authoring/canvas

shared diagram rules      → domain/diagram
```

This is migration guidance, not permission for an unrelated full-repository rewrite.

Whenever current code and this target differ, prefer the smallest coherent migration that improves the dependency graph while keeping behavior stable.

## 17. Stop rule

A refactor is complete when:
- ownership is clearer;
- dependency direction is valid;
- changed behavior is covered by the relevant automated checks;
- no unnecessary abstraction was introduced.

Do not continue reorganizing code merely to make the tree look symmetrical.
