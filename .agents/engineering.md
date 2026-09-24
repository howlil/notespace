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
├── routes/     URL boundary and route-level composition
├── pages/      screen-level composition, including pages/_shared for shared page composition
├── features/   product behavior and use-cases
├── domain/     pure product models, rules, and state transformations
├── adapters/   product-facing HTTP, browser event, asset, and external technology boundaries
└── shared/     genuinely generic UI, browser primitives, styles, and utilities
```

Do not create a folder only because a pattern exists elsewhere. Add a boundary only when it clarifies ownership or dependency direction.

## 3. Allowed dependency direction

Default rules:

```text
routes   → routes, pages, features, domain, adapters, shared
pages    → pages, features, domain, adapters, shared
features → same feature, domain, adapters, shared
adapters → adapters, domain, shared
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

Architecture enforcement rules:
- prefer an explicit dependency allowlist over a forbidden-import denylist;
- architecture checks must inspect both static local imports and dynamic `import(...)` edges;
- sibling feature implementations must not depend on each other;
- every `*.test.ts` and `*.test.tsx` under `apps/web/src` and `tests` must be discovered automatically by the Node test runner.

Page-composition rule:
- `pages/_shared` may contain product-specific composition used by multiple routed pages;
- `pages/_shared` may combine sibling features because it belongs to the page composition layer;
- do not move product-specific composition into `shared` merely to make it reusable.

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
- activity;
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

Adapter facades may orchestrate narrower infrastructure responsibilities, but keep transport, browser cache, and media normalization separate when they have independent failure modes. Preserve a stable facade when splitting those internals prevents consumer churn.

### CSS ownership

- Keep generic tokens, document defaults, and framework entry styles in `shared/styles`.
- Keep product-specific selectors with the feature that owns them; Workspace authoring CSS belongs under `features/workspace-authoring`.
- Root route may import feature-owned global CSS once to preserve deterministic cascade order.
- Do not recreate a generic top-level `src/styles` bucket.

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
application Sidebar       → pages/_shared/LibrarySidebar
application providers     → shared/ui when generic
generic browser storage   → shared/browser

domain/project HTTP       → adapters/http
domain/project model      → domain/workspace

integrations/document     → workspace-authoring/document
integrations/canvas       → workspace-authoring/canvas

shared diagram rules      → domain/diagram
features/plan             → features/planning
features/study            → features/activity
```

This is migration guidance, not permission for an unrelated full-repository rewrite.

Whenever current code and this target differ, prefer the smallest coherent migration that improves the dependency graph while keeping behavior stable.

## 17. Server architecture

These rules apply to `apps/server`.

Use package boundaries to express ownership. Do not reorganize the server into generic technical layers such as `controllers/`, `services/`, `repositories/`, and `models/`.

Preferred dependency graph:

```text
cmd/notespace
    ├── wires → httpapi
    ├── wires → sqlite
    └── wires → icon

httpapi
    ├── → workspace
    ├── → planning
    ├── → activity
    ├── → library
    ├── → asset
    └── → icon

sqlite
    ├── implements → workspace ports
    ├── implements → planning ports
    ├── implements → activity ports
    ├── implements → library ports
    └── implements → asset ports
```

Forbidden dependency direction:

```text
workspace / planning / activity / library / asset / icon ─X→ httpapi
workspace / planning / activity / library / asset / icon ─X→ sqlite
httpapi                                      ─X→ sqlite concrete implementation
```

`cmd/notespace` is the composition root. It is the normal place where concrete adapters are selected and wired to application/domain packages.

Prefer interfaces owned by the package that consumes the capability. A domain/application package defines the smallest port it needs; the SQLite adapter satisfies that port.

Keep the application dependency graph explicit:

```text
workspace → {}
planning  → {}
activity  → {}
asset     → {}
icon      → {}
library   → {workspace}
```

`httpapi` may depend on those application capabilities, and `sqlite` may implement their persistence ports. Do not add a new cross-domain import unless the owning use-case genuinely requires it and the architecture guard is updated deliberately.

Service construction dependencies must stay private after construction. Callers use exported use-cases; they must not reach through a service to its store, reference lookup, or clock.

## 18. Server responsibility ownership

Canonical responsibility boundaries:

```text
workspace
  owns Workspace, Note, Canvas, category, history,
  authored-state invariants, and workspace use-cases

planning
  owns Milestone, Task, Today/Inbox planning behavior,
  planning validation, and planning concurrency semantics

activity
  owns ActivitySession, heartbeats, duration/statistics,
  and activity-specific validation

asset
  owns durable binary asset semantics and asset use-cases

icon
  owns external icon retrieval, SVG trust validation,
  bounded caching, and concurrent fetch deduplication

library
  owns recovery and portability use-cases:
  Trash, restore, backup, and full-library restore

httpapi
  owns HTTP transport only:
  routes, request decoding, transport validation,
  status/error mapping, headers, and middleware

sqlite
  owns SQLite implementation details:
  SQL, scanning, transactions, projection maintenance,
  connection configuration, and persistence-specific codecs

cmd/notespace
  owns process bootstrap and concrete dependency wiring
```

A responsibility should have one obvious owner. Do not put product orchestration in `httpapi` merely because an HTTP request triggered it.

If one use-case needs information from multiple domains, place the orchestration with the use-case owner and depend on narrow ports.

Example:

```text
HTTP activity heartbeat
  ↓
activity application service
  ├── read linked Task through a narrow planning-facing port
  ├── read linked Workspace through a narrow workspace-facing port
  └── persist ActivitySession
```

Do not make the HTTP handler the application service.

Destructive Workspace lifecycle is Library-owned. Do not add raw Workspace or Category hard-delete APIs that bypass Trash/recovery invariants. SQLite may expose the semantic Library operations needed to implement the Library port, but it must not expose a second weaker deletion path.

## 19. Server package and file structure

The target shape is capability-oriented:

```text
apps/server/
├── cmd/
│   └── notespace/
├── internal/
│   ├── workspace/
│   ├── planning/
│   ├── activity/
│   ├── asset/
│   ├── icon/
│   ├── library/
│   ├── httpapi/
│   └── sqlite/
└── migrations/
```

This is a responsibility map, not a requirement for symmetrical folders.

Inside a capability package, keep model, invariants, service/use-case code, and consumer-owned ports together while they remain cohesive. Split files when they have different reasons to change, not because they cross an arbitrary line count.

Good examples:

```text
workspace/
├── model.go
├── service.go
├── store.go
├── queries.go
├── granular.go
├── note.go
├── canvas.go
└── validation.go

httpapi/
├── router.go
├── errors.go
├── middleware.go
├── workspace.go
├── planning.go
├── activity.go
├── library.go
└── assets.go

sqlite/
├── sqlite.go
├── workspace_scan.go
├── workspace_queries.go
├── workspace_mutations.go
├── workspace_granular.go
├── workspace_notes.go
├── workspace_canvas.go
├── history_store.go
├── planning_queries.go
├── planning_milestones.go
├── planning_tasks.go
├── planning_restore.go
├── activity_store.go
├── activity_sessions.go
├── activity_references.go
├── assets.go
├── library_state.go
├── library_workspace_snapshot.go
├── library_trash_atomic.go
├── library_backup_snapshot.go
├── library_restore.go
├── library_recovery.go
└── library_archive.go
```

Do not introduce nested packages unless an independent contract, lifecycle, state owner, or dependency boundary justifies them.

## 20. SQLite and transaction boundaries

SQLite is one adapter and one transactional ownership boundary for this single-owner application.

Do not split `sqlite` into one package per domain merely for folder symmetry. Cross-domain SQL inside the adapter is valid when one product invariant requires one atomic transaction.

Important atomic flows include:

```text
Trash Workspace
  ↓
snapshot Workspace + Plan + History + Assets
  ↓
write Trash record
  ↓
remove active Workspace
  ↓
COMMIT
```

and:

```text
Full-library restore
  ↓
validate complete input
  ↓
replace canonical state
  ↓
validate resulting database
  ↓
COMMIT or ROLLBACK
```

The application/domain layer owns the required atomic outcome. The SQLite adapter owns how that transaction is executed.

Derived state such as FTS/search projection must not become authoritative. Canonical authored state remains the source of truth.

## 21. HTTP boundary

HTTP handlers should normally follow:

```text
request
  ↓
parse/decode transport input
  ↓
call one application use-case
  ↓
map known error/result
  ↓
response
```

Handlers may own HTTP-specific concerns such as:
- path/query/header parsing;
- request-size limits;
- content type;
- status codes;
- deprecation headers;
- same-origin policy;
- cache/security headers.

Handlers should not own:
- cross-domain enrichment;
- persistence transactions;
- domain invariants;
- authoritative state transitions;
- SQLite-specific behavior.

Keep compatibility behavior at the transport edge when possible. New server code should use canonical `Workspace` terminology. Keep `Project` naming only where legacy API/schema compatibility still requires it.

## 22. Server naming and migration direction

The package migration is complete:

```text
internal/persistence → internal/sqlite
internal/study       → internal/activity
internal/project     → internal/workspace
```

Do not reintroduce the legacy `persistence`, `study`, or `project` packages. Continue refactors by moving one ownership boundary at a time while keeping behavior stable.

Do not rename database tables such as `projects` merely to match package terminology. Schema renames require their own concrete payoff and migration justification.

Do not expand legacy `Project` terminology into new APIs, domain types, or packages.

## 23. Server verification

Structural server changes should prove dependency direction and preserve runtime behavior.

At minimum, choose the relevant subset of:

- `gofmt`;
- `go vet`;
- focused package tests;
- `go test -race` where concurrency semantics are touched;
- migration/integrity tests when SQL or schema behavior changes;
- HTTP integration tests when transport contracts move;
- deterministic architecture-boundary checks when package imports or ownership rules change;
- server build when package topology changes.

Architecture tests should enforce meaningful dependency rules rather than exact incidental filenames.

For architecture migration:

```text
define one target boundary
→ add/strengthen the boundary proof
→ move that owner
→ update wiring/imports
→ run focused verification
→ continue
```

Avoid a big-bang server rewrite.

## 24. Stop rule

A refactor is complete when:
- ownership is clearer;
- dependency direction is valid;
- changed behavior is covered by the relevant automated checks;
- no unnecessary abstraction was introduced.

Do not continue reorganizing code merely to make the tree look symmetrical.


### Routed page ownership

- Routed pages are composition boundaries, not feature implementations.
- Pages may compose multiple features and domain types, but must not call HTTP adapters directly.
- CRUD state, mutation flows, and reusable screen behavior belong to the owning feature.
- When two sibling features meet on one screen, compose them in the page through props or render slots instead of importing one feature from the other.
