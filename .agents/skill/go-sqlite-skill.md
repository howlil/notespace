# Notespace Go + SQLite Backend Skill

**Status:** CANONICAL BACKEND IMPLEMENTATION RULE

**Scope:** Backend/runtime and persistence implementation for Notespace.

This skill complements:

- `.agents/README.md`
- `.agents/PROJECT.md`
- `.agents/ARCHITECTURE.md`
- `.agents/MILESTONE.md` and `.agents/STATE.md`
- `.agents/QUALITY.md`
- `.agents/skill/fe-skill.md`

If this file conflicts with explicit user direction, stop and surface the conflict. Do not silently replace the approved backend stack.

---

# 1. Approved backend stack

Notespace backend is committed as:

```text
Go standard library
    ↓
net/http
    ↓
application/domain code
    ↓
database/sql
    ↓
SQLite
```

Approved implementation direction:

- **Go** as the backend language/runtime.
- **`net/http`** for the HTTP server and routing.
- **Go standard library first** for JSON, logging, context, errors, embedding, tests, HTTP middleware, file handling, and concurrency.
- **`database/sql`** as the database boundary.
- **SQLite** as the primary persistence engine.
- **WAL mode** unless repository evidence shows a concrete reason not to use it.
- **SQL written explicitly** in repository-owned code/files.
- **embedded SQL migrations** owned by Notespace.

No HTTP framework is approved.

Do not introduce Gin, Echo, Fiber, Chi, Gorilla router, Buffalo, Beego, Hertz, or another HTTP framework/router unless explicitly approved.

Do not introduce an ORM or query-builder layer such as GORM, Ent, Bun, sqlx as an abstraction layer, Squirrel, Jet, or similar unless a concrete requirement proves necessary and the user approves the material dependency.

## SQLite driver exception

Go's standard library does not include a SQLite driver, so one external driver is necessary.

The SQLite driver is infrastructure glue, not an application framework.

Driver selection must optimize for:

1. correctness and maintenance;
2. predictable SQLite behavior;
3. deployment simplicity;
4. performance;
5. build/cross-compilation impact.

Do not allow driver-specific APIs to leak throughout domain/application code. Ordinary persistence code should depend on `database/sql` semantics where practical.

If choosing between a CGO-backed and pure-Go driver is material to packaging or performance, record that decision explicitly rather than silently changing it.

---

# 2. Backend objective

Build the smallest self-hosted backend that supports the Notespace product model:

```text
Web / Tauri client
       ↓
    HTTP API
       ↓
Project application logic
       ↓
 persistence boundary
       ↓
     SQLite
```

The backend exists to provide durable Project state and self-hosted runtime behavior.

Do not turn Notespace into a distributed system without evidence.

The backend should remain understandable as one executable and one primary database file for the current product scope.

---

# 3. Monorepo placement

When backend implementation is introduced, preferred repository shape:

```text
notespace/
├── .agents/
│
├── apps/
│   ├── web/
│   └── server/
│       ├── cmd/
│       │   └── notespace/
│       │       └── main.go
│       ├── internal/
│       │   ├── project/
│       │   ├── httpapi/
│       │   ├── persistence/
│       │   └── platform/
│       ├── migrations/
│       ├── go.mod
│       └── go.sum
│
└── ...
```

This is a responsibility model, not mandatory scaffolding.

Do not create empty packages for architectural symmetry.

Create a package only when it has real ownership.

Avoid a root-level generic structure like:

```text
controllers/
services/
repositories/
models/
utils/
```

when those names obscure domain ownership.

Prefer ownership such as:

```text
internal/project
internal/httpapi
internal/persistence/sqlite
```

or another equally cohesive structure discovered during implementation.

---

# 4. Standard-library-first rule

Default to the Go standard library before adding dependencies.

Use standard packages where they solve the requirement adequately, including:

- `net/http`
- `encoding/json`
- `database/sql`
- `context`
- `errors`
- `fmt`
- `log/slog`
- `embed`
- `io`
- `os`
- `path/filepath`
- `time`
- `sync`
- `testing`
- `net/http/httptest`

The rule is not "zero dependencies at any cost".

Add a dependency only when it solves a concrete problem significantly better than the standard library and the maintenance/runtime cost is justified.

Do not reproduce large, security-sensitive infrastructure poorly merely to avoid one justified dependency.

---

# 5. HTTP server rules

Use `net/http` directly.

Modern Go `ServeMux` supports method/path routing and path parameters. Prefer it before introducing a router dependency.

Conceptual shape:

```text
http.Server
    ↓
http.ServeMux
    ↓
small middleware chain
    ↓
handler
    ↓
application use case
```

## Handler responsibility

HTTP handlers own transport concerns:

- parse path/query/header/body;
- validate transport input;
- call application/domain behavior;
- map domain/application errors to HTTP responses;
- encode response JSON;
- attach request context/log fields.

Handlers must not become the primary location for:

- SQL queries;
- Project domain rules;
- migration logic;
- filesystem business logic;
- large transaction orchestration unrelated to HTTP.

Keep handlers thin enough that application behavior can be tested without an HTTP server.

## JSON

Use `encoding/json` unless profiling or a concrete compatibility requirement proves otherwise.

Do not add a faster JSON library based only on benchmark reputation.

Measure representative payloads first.

## HTTP server configuration

Configure an explicit `http.Server` rather than relying on bare `http.ListenAndServe` in production code.

Consider appropriate:

- read header timeout;
- read timeout when applicable;
- write timeout where compatible with endpoint behavior;
- idle timeout;
- maximum request body sizes for relevant endpoints;
- graceful shutdown.

Timeout values must be chosen from actual endpoint behavior, not copied blindly.

---

# 6. Middleware rule

Do not build or import a middleware framework.

Use small standard-library middleware functions:

```go
func Middleware(next http.Handler) http.Handler
```

Only introduce middleware for cross-cutting concerns that are actually cross-cutting, such as:

- request IDs;
- structured access logging;
- panic recovery at the process boundary;
- authentication when approved;
- CORS when deployment requires it;
- security headers where applicable;
- request-size limits where broadly applicable.

Avoid deep middleware stacks that hide request behavior.

---

# 7. Project domain boundary

Preserve the canonical product invariant:

```text
Project
├── identity
├── title
├── document state
├── canvas state
└── layout/presentation state as appropriate
```

Do not model three independent aggregate roots:

```text
Note
Canvas
Project
```

Persistence may normalize storage internally, but Project remains the user-facing ownership/lifecycle boundary.

Backend package structure and SQL schema must not accidentally redefine the product model.

---

# 8. Application/domain vs persistence

Preferred dependency direction:

```text
HTTP transport
      ↓
application/project behavior
      ↓
persistence port owned by the behavior
      ↓
SQLite implementation
```

Avoid:

```text
HTTP handler
   ↓
raw SQL everywhere
```

and avoid the opposite over-abstraction:

```text
GenericRepository[T]
GenericService[T]
GenericDAO[T]
```

for every object.

Create narrow interfaces only where they improve ownership, testing, or replaceability.

A useful interface should be driven by use cases, for example conceptually:

```go
type ProjectStore interface {
    Create(ctx context.Context, p Project) error
    Get(ctx context.Context, id ProjectID) (Project, error)
    List(ctx context.Context) ([]ProjectSummary, error)
    SaveContent(ctx context.Context, update ProjectContentUpdate) error
}
```

Do not copy this exact interface if the implementation needs fewer/different operations.

---

# 9. SQLite rules

SQLite is the committed primary database for the current architecture.

## Default operating mode

Prefer WAL mode for the self-hosted server unless testing reveals a concrete incompatibility.

Set SQLite connection/session configuration explicitly rather than depending on undocumented driver defaults.

Relevant concerns include:

- `journal_mode=WAL`;
- foreign key enforcement;
- busy timeout;
- synchronous mode chosen intentionally;
- transaction mode for write contention where relevant.

Do not cargo-cult PRAGMA values. Verify them against the chosen driver and deployment behavior.

## Connection pool

SQLite is not PostgreSQL.

Tune `database/sql` connection settings for SQLite's concurrency model rather than using generic high-connection defaults.

Start conservatively.

Measure actual autosave/read/write contention before increasing connection counts.

## Foreign keys

Enable and test foreign key behavior explicitly if schema relationships depend on it.

Do not assume enforcement is active from the database file alone.

## Write behavior

Notespace can generate frequent editor/canvas changes.

Do not write synchronously on every keystroke or pointer movement through the full HTTP → SQLite path.

Use an application-level save strategy that can debounce/coalesce writes while preserving durability expectations.

The persistence layer should accept meaningful snapshots/updates; it should not mirror high-frequency Excalidraw pointer state as individual SQL writes.

---

# 10. SQL rule

SQL is first-class source code.

Prefer explicit queries over ORM-generated behavior.

Rules:

- use parameterized queries;
- never build SQL from untrusted string concatenation;
- select only required columns where practical;
- make ordering explicit when result order matters;
- use transactions around product operations that require atomicity;
- check `rows.Err()`;
- close rows/statements/resources correctly;
- preserve context cancellation;
- map `sql.ErrNoRows` deliberately;
- distinguish constraint conflicts from generic internal failures where useful.

Do not create a giant persistence helper that hides query semantics.

Keep SQL close to the persistence operation it implements, or in cohesive `.sql` files when that improves readability.

---

# 11. Schema design

Schema should reflect current product requirements rather than speculative normalization.

A plausible initial ownership shape may include:

```text
projects
├── id
├── title
├── document_state
├── canvas_state
├── split_ratio
├── created_at
└── updated_at
```

or internally separated owned content tables if there is a concrete benefit.

Do not treat this example as a mandatory schema.

Choose the smallest schema that protects:

- Project identity;
- durable document content;
- durable canvas content;
- Project listing/reopen;
- timestamps needed by product behavior.

Do not normalize editor/canvas JSON into dozens of relational tables without an actual query/consistency requirement.

Do not make Excalidraw element rows the canonical Project model merely because they can be normalized.

---

# 12. Migration rule — native, no framework

Do not introduce a migration framework initially.

Own migrations directly in the repository:

```text
apps/server/migrations/
├── 0001_initial.sql
├── 0002_...
└── ...
```

Embed them using `//go:embed` where appropriate.

Maintain a minimal migration ledger in SQLite, for example a table recording applied migration versions.

Migration runner responsibilities:

1. inspect current applied version;
2. apply pending migrations in deterministic order;
3. execute each migration with appropriate transactional semantics;
4. record successful application;
5. stop startup on migration failure;
6. never mark a failed migration as applied.

Do not build a generalized migration platform.

A destructive/irreversible migration remains a stop condition requiring explicit approval.

---

# 13. Transaction rule

Transactions correspond to product consistency boundaries, not function boundaries.

Use a transaction when one product operation must succeed/fail atomically.

Examples:

- create Project plus required owned rows;
- delete/restore Project with related ownership metadata;
- complete Project import/restore;
- future cross-surface reference updates affecting multiple records.

Do not wrap independent document and canvas autosaves in one long transaction merely because they belong to the same Project.

Keep transactions short.

Never hold a SQLite write transaction while waiting on network/user/editor work.

---

# 14. Persistence and autosave semantics

Define durability explicitly.

Expected conceptual flow:

```text
client edit
    ↓
local immediate state
    ↓
coalesced/debounced save request
    ↓
Go application boundary
    ↓
SQLite transaction/write
    ↓
success/error response
```

Rules:

- never report durable save before SQLite write succeeds;
- preserve enough client state to retry after transient failure;
- make save failure visible when user data is at risk;
- avoid unnecessary full-project rewrites if measured data size makes them problematic;
- optimize delta writes only when actual payload/write cost justifies added complexity.

Correctness first; then measure.

---

# 15. API design

Keep the API small and product-oriented.

For the initial vertical slice, likely capability categories are:

```text
GET    projects
POST   project
GET    project by id
PUT/PATCH project content/state
```

Exact URLs and payloads are public-ish client/server contracts and should be chosen deliberately during implementation.

Do not design a large REST surface before the actual Web journey requires it.

Avoid exposing persistence table shapes directly as API contracts.

Transport DTOs may resemble domain data when appropriate, but do not couple API compatibility to SQLite schema accidents.

## Status/error behavior

Use HTTP semantics consistently.

Return structured errors with stable machine-readable codes only when clients need them.

Do not expose raw SQL/database errors to clients.

Log diagnostic detail server-side while returning safe client-facing errors.

---

# 16. Validation rule

Validate at the system boundary.

Examples:

- Project IDs;
- title length/format where product rules exist;
- request body size;
- JSON shape;
- content version/schema where needed;
- file/import path or payload if those features are introduced.

Do not duplicate identical validation randomly across handlers, application code, and SQL constraints.

Use each layer for what it can guarantee:

```text
transport validation
+ domain invariants
+ database constraints
```

---

# 17. Error model

Use normal Go error composition.

Prefer:

- sentinel errors for stable categories where useful;
- typed errors only when they carry meaningful structured data;
- `%w` wrapping;
- `errors.Is` / `errors.As` at translation boundaries.

Avoid string matching on errors.

Do not create an elaborate enterprise error hierarchy.

Translate errors at boundaries:

```text
SQLite/driver error
      ↓
persistence/application category
      ↓
HTTP status + safe response
```

---

# 18. Logging and observability

Use `log/slog` unless a concrete requirement proves insufficient.

Prefer structured logs.

Include useful fields such as:

- request ID when present;
- method/path/status/duration for access logs;
- Project ID where operationally useful and privacy-appropriate;
- migration version;
- database/storage errors;
- startup configuration;
- shutdown reason.

Do not log user-authored document/canvas content by default.

Do not add an external telemetry stack without a requirement.

Health/readiness endpoints may be added when deployment needs them; do not overbuild observability.

---

# 19. Concurrency rule

Go makes concurrency easy to start and easy to misuse.

Do not create goroutines simply because a task can run asynchronously.

Use concurrency when it improves a measured/request-driven need and lifecycle ownership is clear.

Every goroutine must have:

- clear owner;
- cancellation/shutdown behavior where long-lived;
- bounded resource behavior;
- error handling.

Do not create unbounded goroutine-per-event pipelines for editor autosave.

HTTP already handles requests concurrently.

SQLite remains the write-concurrency constraint; more goroutines do not create more write throughput automatically.

---

# 20. Performance rule

The target is high performance through simple architecture, not benchmark theater.

Start with:

```text
Go net/http
+ explicit JSON
+ database/sql
+ SQLite WAL
+ prepared/parameterized SQL where useful
+ bounded payloads
```

Measure representative Notespace workloads:

- Project list latency;
- Project open latency;
- document save latency;
- canvas snapshot save latency;
- concurrent autosave contention;
- database size/growth;
- memory use for large Projects.

Optimize the measured bottleneck.

Do not add:

- Redis;
- caches;
- message queues;
- worker pools;
- alternative JSON libraries;
- custom binary protocols;
- PostgreSQL;
- sharding;

without evidence that the simpler system fails a real requirement.

For Notespace, frontend/editor/canvas rendering may become a user-visible bottleneck before `net/http` itself does. Do not optimize server framework throughput when the product bottleneck is elsewhere.

---

# 21. Security baseline

Even without an approved authentication model, backend input is untrusted.

Preserve:

- request body limits where appropriate;
- JSON validation;
- SQL parameterization;
- safe path handling;
- no client-controlled raw filesystem paths;
- safe import/archive handling when introduced;
- no raw database errors in client responses;
- security headers/CORS appropriate to deployment;
- secret/config separation from Project data;
- no arbitrary executable content processing.

Authentication/authorization architecture remains a material product/security decision unless explicitly approved elsewhere.

Do not invent multi-user auth during the first slice.

---

# 22. Configuration rule

Keep configuration small and explicit.

Use environment variables and/or simple command-line flags when needed.

Do not introduce a config framework initially.

Potential baseline settings may include:

- listen address;
- persistent data directory/database path;
- log level;
- environment/development mode.

Defaults must be safe for self-hosting.

Avoid dozens of tuning knobs before operational evidence exists.

---

# 23. Shutdown and lifecycle

The server should support graceful process shutdown.

Conceptually:

```text
start dependencies
      ↓
run HTTP server
      ↓
receive SIGINT/SIGTERM
      ↓
stop accepting new work
      ↓
allow bounded in-flight completion
      ↓
close resources
      ↓
exit
```

Use standard library signal/context support.

Do not build a lifecycle framework.

Migration must complete successfully before serving requests that depend on the schema.

---

# 24. Testing rule

Use Go's standard `testing` package by default.

Do not introduce a test framework merely for assertion syntax.

Use:

- table-driven tests where they improve coverage/readability;
- `httptest` for HTTP transport tests;
- temporary SQLite databases for persistence integration tests;
- real migration execution in integration tests;
- transaction/constraint/error-path tests for critical consistency behavior.

Prioritize observable contracts.

Critical backend journey:

```text
create Project
    ↓
persist
    ↓
load Project
    ↓
update document/canvas state
    ↓
restart/reopen database
    ↓
state preserved
```

Test SQLite behavior, not a fake repository, where persistence behavior is the risk.

Use interfaces/fakes for application unit tests only when they materially improve test precision.

---

# 25. Benchmarking rule

Use Go benchmarks only for a real performance question.

Possible benchmark targets after representative payloads exist:

- Project JSON encoding;
- persistence round-trip;
- large canvas snapshot writes;
- project listing queries;
- migration performance on realistic database sizes.

Do not optimize based on microbenchmarks disconnected from user journeys.

Use profiling (`pprof`) only when needed to answer a performance question; do not expose diagnostics publicly by default.

---

# 26. Dependency policy

Backend dependency budget should remain intentionally small.

Expected minimum external runtime dependency:

- SQLite driver.

Any additional backend dependency requires a concrete reason.

Before adding one, answer:

- What exact problem does it solve?
- Why is stdlib insufficient?
- What runtime/build/deployment cost does it add?
- What security/maintenance surface does it introduce?
- Is the dependency easier to remove than the code it replaces?

No framework may be introduced as a convenience default.

---

# 27. Anti-patterns

Avoid:

- web framework introduced for routing convenience;
- ORM/entity model becoming the domain model;
- generic controller/service/repository boilerplate;
- global mutable database handles accessed arbitrarily from every package;
- SQL from handlers;
- business rules embedded in migration SQL;
- one SQLite write per editor event;
- high `MaxOpenConns` copied from PostgreSQL guidance;
- hidden transactions;
- swallowing context cancellation;
- goroutines without lifecycle ownership;
- premature caches/queues;
- exposing raw database errors;
- database schema dictating the public API;
- abstract interfaces with only one method implementation and no boundary value;
- unnecessary code generation/tooling during the first vertical slice.

---

# 28. Initial implementation sequence

When backend implementation begins, prefer:

```text
1. Go module + runnable stdlib HTTP server
        ↓
2. process lifecycle + structured logging
        ↓
3. SQLite connection/configuration
        ↓
4. native migration runner + initial schema
        ↓
5. Project persistence behavior
        ↓
6. minimal Project HTTP endpoints required by Web slice
        ↓
7. Web integration
        ↓
8. persist/edit/reload/reopen verification
        ↓
9. failure-path tests
        ↓
10. performance sanity measurement
        ↓
STOP
```

Do not build a comprehensive backend API before the first Web user journey exists.

---

# 29. Material decisions still requiring approval

This skill resolves:

- backend language: Go;
- HTTP stack: `net/http`, no framework;
- database API: `database/sql`;
- persistence engine: SQLite;
- SQL style: explicit SQL, no ORM/query builder by default;
- migrations: Notespace-owned embedded SQL runner, no migration framework;
- logging baseline: stdlib `log/slog`;
- test baseline: stdlib `testing` + `httptest`.

Still material/open unless resolved elsewhere:

- exact SQLite driver if its CGO/pure-Go trade-off affects packaging/performance;
- authentication/authorization model;
- public API compatibility guarantees;
- self-host packaging details;
- backup/restore format;
- document editor selection;
- future realtime/collaboration protocol.

Do not silently resolve these when they materially affect product/deployment boundaries.

---

# 30. Definition of backend done

A backend change is not complete because code compiles.

Relevant evidence includes:

- `go test ./...` passes;
- server builds;
- migration succeeds from a clean database;
- persistence round-trip is verified;
- error/failure behavior is tested where risk exists;
- HTTP behavior is exercised with `httptest` or integration tests;
- SQL constraints/transactions behave as intended;
- representative performance is sane for the changed path;
- no framework/ORM/query-builder was introduced without approval;
- `.agents/STATE.md` is updated with evidence and the next move.

Stop when the approved acceptance criteria are satisfied.
