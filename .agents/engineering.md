# Engineering

This is the system contract for Notespace. It records ownership and boundaries, not a promise to reorganize the whole repository. Current source and tests are the implementation truth; migrations are incremental and behavior-preserving.

## System

Notespace is a browser product with an optional Windows Tauri shell around the same Go HTTP server and one SQLite source of truth.

```text
browser / Tauri WebView
        ↓ same-origin HTTP
httpapi + desktop boundary
        ↓ application capabilities
workspace  planning  activity  asset  icon  library
        ↓ consumer-owned ports
SQLite adapter + migrations
```

The desktop path is:

```text
Tauri lifecycle → one Go sidecar on loopback → existing web/API contract → SQLite
```

Product references: Desktop behavior and recovery in `product.md`; paginated Workspace traversal in `product.md`. The current branch also carries the explicit Canvas-only/Note-retirement migration; it must not create a second product model.

## Responsibilities

R1 (Desktop): own window, single-instance, resource path, sidecar lifecycle, loopback origin, update and close/flush orchestration. It must not own product entities or ordinary CRUD.

R2 (Web shell): own routes, page composition, loading/error boundaries and browser/desktop presentation. Routes select data and pages; they do not own mutations or editor state.

R3 (Feature use-cases): own user workflows and feature state. Current primary owners are `features/library`, `features/search`, and `features/workspace-authoring`.

R4 (Domain): own pure Workspace, Canvas, diagram, autosave, merge and validation rules. Domain code is framework-, HTTP- and browser-independent.

R5 (Adapters): own HTTP transport/mapping, browser events/storage, durable assets and third-party editor integration. Adapters do not become product orchestrators.

R6 (Application packages): own server use-cases and invariants. `workspace` owns Workspace/category/Canvas semantics; `library` owns Trash, backup and restore; `planning`, `activity`, `asset`, and `icon` retain their explicit contracts until product scope retires them.

R7 (HTTP controller): own routing, decoding, transport validation, authorization/middleware, status/error mapping and compatibility headers. It calls one application use-case and does not perform transactions.

R8 (SQLite adapter): own SQL, scanning, transactions, derived projections, connection configuration and migration execution. It implements ports; it is not imported by application packages.

## State and ownership

S1: Workspace metadata and category membership | owner R6/workspace + SQLite | titles/category/version invariants are checked before persistence | concurrent writers use expected values/optimistic conflicts | durable local data, no RPO number supplied (A1).

S2: Canvas authored snapshot and Canvas version | owner R6/workspace + SQLite | each accepted update advances the server version and rejects stale writes | frontend never treats an older acknowledgement as current state.

S3: In-memory authoring draft, dirty state and flush registry | owner R3 `useWorkspaceSession`/autosave | browser memory is disposable and must flush registered Canvas asset writes before the authored snapshot, then flush to S2 before close/navigation when dirty.

S-EXPLORER (#198): the root LibraryExplorerProvider owns session-only dock preference, independent transient mobile drawer visibility, disclosure and cached category pages. Shell derives presentation at 760px and keeps the Explorer subtree mounted across collapse; forms/mutations retain their existing Sidebar/navigation owner. Router/save barriers still own navigation and dirty Canvas. No new persistence or duplicate navigation manager.

S4: Library pagination snapshot/token | owner workspace application/store | snapshot membership and ordering remain stable for one traversal; refresh, filter, sort or eviction starts a new traversal.

S5: Search/FTS projection | owner SQLite | derived and repairable; authored Workspace/Canvas state remains authoritative.

S6: Desktop session cookie, pinned loopback origin, child-process generation and profile data root | owner R1 plus desktop server boundary | one bootstrap is single-use; API requires the HttpOnly same-origin session; a busy pinned port is a recovery failure, not an automatic origin change. Debug builds use `<app-data>/dev`, packaged builds use `<app-data>`, test override uses its exact supplied directory, and stores are never moved or merged automatically.

S-CODE (#199): Excalidraw owns selected IDs and geometry; existing CanvasCodeBlockData v1 owns source/language/theme/line numbers/heightMode. CanvasEditor owns per-element ephemeral output visibility/wrap, while useCodeRunner owns bounded Worker handles/results with source/run identity fencing and cleanup. The single contextual toolbar stays visible while editing code, not manipulation. Source-only exports and measurement use headerless geometry and the same UI-local wordWrap option. Export adapters borrow per-element view options at invocation without serializing them. Selected source/output panes own local scroll/focus, while modified-wheel pinch remains Canvas-owned; reading never updates authored geometry. No new renderer sandbox, persistence or runtime is introduced.

S7: Browser theme, cache and local asset cache | owner shared/browser or asset adapter | never authoritative for Workspace content. Memory is an LRU capped at 32 MiB/64 entries; disk targets 128 MiB, evicting only confirmed server copies. Unknown legacy assets remain protected until upload succeeds. Permanent deletion and successful library restore invalidate caches and fence stale in-flight loads.

## Structure and dependency direction

Keep the six web layers: routes → pages → features → domain; routes/pages/features may use adapters, adapters may use domain/shared, shared imports shared only. Folder moves do not change authoritative state, routes, schemas, public HTTP/IPC contracts or process topology.

These seams are implemented. Current source and executable architecture checks define their exact entries; changes move the owner, its callers, tests and operational references together.

| Owner | Target grouping / entry | Contract |
|---|---|---|
| R2 composition | routes stays framework-owned; pages/{home,workspace,shell} | Thin URL routes; pages compose features. |
| R3 library | features/library/index.ts; collection/, explorer/, backup/ | Sidebar joins Explorer state/UI; one root-mounted provider survives route changes. |
| R3 authoring | features/workspace-authoring/index.ts; session/, canvas/ | Session owns draft/save/recovery; CanvasEditor stays the Canvas orchestrator. |
| Canvas | Keep assets/chrome/code/diagram/flowchart/native/selection/state/sync/viewport | Colocate the Canvas-only palette in canvas/diagram/palette; code-block execution stays in canvas/code/execution with a same-origin worker CSP and bounded host output; PNG/SVG exports include the code-block overlay. HTML preview stays disabled until its browser navigation/network boundary can be enforced. |
| R1 web desktop | features/desktop/index.ts; chrome/lifecycle/recovery/updates | Native UI and close bridge leave generic shared UI/root route bodies; root still composes cross-feature slots. |
| R4 rules | domain/{workspace,diagram,code} | Small cohesive modules stay flat; framework/HTTP/browser/editor dependencies stay outside. |
| R5 adapters | adapters/{http,browser,assets,desktop} | IPC/quiescence is distinct from generic browser events. Adapters never import features. |
| Generic UI | shared/ui/{controls,overlays,feedback,theme,brand} | Export consumed primitives; native chrome belongs to R1. |
| R6 Go use-cases | Existing internal/{workspace,planning,activity,capture,asset,icon,library} | Keep small packages flat; consumer-owned ports remain here. |
| R7 HTTP | httpapi.New(Dependencies) facade; capability handler packages; httpapi/internal/transport | Root mounts middleware once. Children cannot import root API or persistence. |
| R8 SQLite | Root Store/connection/transaction facade; sqlite/internal/{dbtx,workspace,planning,activity,capture,assets,search,backup} | One adapter/pool/transaction authority, not one database per capability. |
| R1 Rust | Thin lib.rs; runtime.rs + runtime/{state,sidecar,readiness,shutdown}.rs; window/recovery/updates/diagnostics.rs | Crate-private facade; one RuntimeProcess owns child generation and close/backup locks. |
| Browser proofs | tests/e2e/{canvas,library,settings,compatibility,support} | One harness; recursive discovery, critical selection and fixture roots move together. |
| CLI / landing | scripts/{dev,verify,release,assets}; Astro pages/layouts/components/styles/lib | Update Taskfile/package/workflow paths together. Small landing needs no additional hierarchy. |

Outside feature callers use its public entry; internals use direct imports, not self-barrels. Root-owned stylesheet imports remain explicit and ordered in the managed head. Do not eagerly export CanvasEditor and collapse its lazy engine boundary. A directory needs a coherent owner/capability, not a mandatory file-count threshold.

Go subfolders create packages; Store/API receiver methods cannot move there unchanged. Extract repositories/handlers behind existing facade signatures. Children must not import their parent facade; Go packages are the entries, not TypeScript-style index files.

SQLite root coordinators begin/commit/rollback. Compound backup/restore/Trash/migration passes the same borrowed *sql.Tx through a minimal SQL-only DBTX interface. Children never begin transactions or use *sql.DB inside a borrowed transaction. Cross-capability recovery uses explicit transaction-bound snapshot/restore entries, not another repository's tables. Preserve the single connection, paging-cache lifetime, search refresh and pre-upgrade snapshot ordering. Aggregate tests stay at the facade; repository tests follow their package.

Place new files in the existing owning capability. Keep small cohesive capabilities flat; add a subfolder only for a distinct responsibility or dependency boundary. Do not introduce generic catch-all components/hooks/utils folders, unused barrels, or forwarding files for retired locations. Feature roots and operational script groups are checked automatically. New import aliases require resolver support in the architecture check.

Change one owner with its callers/tests/checks together. Keep public feature exports limited to consumed interfaces, and cross-feature composition in pages/root. Go children cannot reach parent facades; shared SQL contracts remain SQL-only. No schema/API/source-of-truth change belongs to a folder move.

## Contracts

K1 Web → HTTP: relative `/api/...` requests use typed adapters; transport maps status/errors, while application packages own semantics. New APIs use `Workspace`; `/api/projects` and old schema names remain compatibility-only.

K2 HTTP → application: decode and validate transport input, call the narrow use-case, map known domain errors. No handler reaches through a service to its store or starts a cross-domain transaction.

K3 Application → SQLite: interfaces are owned by the consuming application package. A transaction is required when one invariant spans Workspace, Canvas, history, assets, Trash or full-library restore.

K4 Canvas save: client sends the base version; server accepts the next state or returns conflict; client fetches/rebases/merges according to the Canvas conflict rules and never overwrites an unresolved concurrent edit. Acknowledgements merge into both the live draft and any queued edit before the next write. Failed image uploads remain in the asset barrier until retry succeeds or the image is removed.

K5 Desktop: Tauri starts the sidecar, waits for its one-use bootstrap URL, then uses the authenticated sidecar origin. In debug, static bootstrap prevents an aborted initial Vite SSR stream; UI/HMR may proxy to Vite, but `/api` remains sidecar-owned.

K6 Migration: migrations are append-only and must validate existing data, retain a verified pre-upgrade recovery copy when required, then commit or rollback atomically. Code N must read the supported N-1 state during rollout; breaking removal uses expand → migrate → contract. Previously applied migration variants are recognized only by explicit checksum; follow-up behavior ships in a new migration, never by rewriting stored checksums or replacing the library. Each migration commits its schema fingerprint in the same transaction so restart can resume after a later step fails.

K7 Note retirement: the runtime is Canvas-only, but the current code still has compatibility DTO fields (`Note`, document, references) and historical schema names. New behavior must not create Note state. Removing those fields or legacy routes is a separate contract change and requires migration/backup evidence.

DEP1 SQLite/modernc: local durable store; failure blocks writes and startup, recovery is through validation and backup paths; no remote availability target is assumed.
DEP2 Tauri/WebView2: desktop host boundary; failure is surfaced as recoverable startup/native verification failure, not hidden in web product code.
DEP3 Excalidraw: editor implementation dependencies; failures are contained by Workspace-authoring adapters and persisted snapshots.
DEP4 Eraser/CDN icon source: optional external dependency; timeout/cache/fallback must not corrupt authored state.

## Critical flows

FL1 Desktop launch: Tauri → sidecar → SQLite migration/health → one-use session → WebView → existing UI. If startup fails, show Retry/diagnostics without creating a second runtime.

FL2 Canvas authoring: Canvas event → authoring session → registered asset writes → autosave/conflict core → HTTP API → workspace service → SQLite versioned Canvas row → acknowledgement. Close/navigation first flushes assets and granular saves.

FL3 Pagination: library query → workspace service/store creates or resumes a snapshot → SQLite returns stable page → UI advances using snapshot token. A stale/evicted token restarts from page one.

FL4 Destructive lifecycle: Trash/restore/backup request → library use-case → one SQLite transaction → validated durable result. No raw delete path bypasses the library contract.

FL5 Note retirement: startup migration validates and snapshots old data → removes retired Note payloads/links → scrubs Canvas artifacts → serves empty compatibility fields. Restore/backup remains the recovery boundary; no hidden Note payload may remain in active or Trash state.

## Guarantees

G1 (Desktop, Canvas close) [H]: when a dirty Canvas is closed or navigated, the system either persists it or blocks/communicates failure; measure at the HTTP acknowledgement and reopen/read-back boundary. Numeric SLO is A1.

G2 (Desktop) [H]: opening an already-running instance focuses the existing window and does not create a second owned runtime; measure with the single- instance/native lifecycle proof.

G3 (Pagination) [H]: one traversal returns each snapshot member once in its initial order despite later mutation; measure with SQLite integration and browser race proof.

G4 (Migration) [H]: an invalid or interrupted upgrade never silently replaces the source database; measure with migration integrity and recovery tests.

G5 (Structure) [H]: application/domain packages cannot depend upward on HTTP, SQLite or UI; measure with architecture checks on every PR.

## Challenge

| Flow | Failure/threat | Containment | Detection | Recovery |
|---|---|---|---|---|
| FL1 | sidecar crash, port occupied, invalid bootstrap | pinned loopback, generation guard, recovery UI | readiness/exit signal | Retry; preserve origin/data |
| FL2 | stale version, response loss, close during save | optimistic version, idempotent creation IDs, flush barrier | conflict/error status and save state | refetch/rebase/merge or preserve draft |
| FL3 | mutation reorders results, token expires | server-owned snapshot token and restart rule | snapshot/offset contract tests | restart traversal at page one |
| FL4/FL5 | partial delete/restore or corrupt migration input | single transaction, validation, recovery snapshot | integrity/migration tests | rollback or manual verified restore |
| FL5 | legacy Note data hidden in opaque payloads | explicit scrub/delete policy before serving | migration artifact and search checks | restore from pre-upgrade snapshot |
| K1/K2 | unauthorized loopback/cross-origin API call | host/origin checks, one-use HttpOnly session, same-origin mutation middleware | HTTP security tests | reject request; do not mutate |

## Decisions

DEC1 [one-way]: keep a modular monolith with one Go process and SQLite instead of service splitting. Driver: G1/G4 and local-first product constraints. Trade-off: less independent scaling, far simpler transactions and recovery. Revisit only with measured independent scaling/team/failure-domain pressure.

DEC2 [one-way]: keep Tauri as a thin shell and same-origin HTTP instead of duplicating product logic in Rust IPC. Driver: Desktop constraint and G1. Trade-off: native features need explicit adapters; product behavior stays shared.

DEC3 [one-way]: keep one SQLite adapter/connection/transaction authority instead of per-domain database owners. Driver: FL4/FL5 atomicity. Private query/codec packages behind Store are allowed only with a borrowed-transaction contract and rollback proof, never independent pools or commits. Trade-off: explicit facade/delegation work reduces density while preserving recovery. Revisit for a new authoritative state owner or transaction boundary.

DEC4 [two-way]: retain legacy Project/Note-compatible read shapes while the Canvas-only migration settles. Driver: K6/K7 compatibility. Contract removal requires explicit product scope and migration proof.

## Fitness rules

F1: Web dependency allowlist and dynamic-import scan | `tests/architecture-boundaries.test.ts` | CI `bun run test` | routes/pages/features/adapters/domain/shared graph passes; no exception.
F2: Web domain has no browser/HTTP/framework imports | same architecture test | CI | pass when all domain files remain pure; exception requires D#.
F3: Features do not import sibling implementations | same architecture test | CI | pass; compose siblings in pages.
F4: Server packages keep `httpapi → capability → sqlite` direction through consumer-owned ports | `internal/architecture` import checks | enforced in Go tests; exception requires D#.
F5: No new Note authoring surface or legacy UI route | source/route contract tests | CI | pass when retirement tests remain green; compatibility fields are allowed only at K7.
F6: Generated/bundled output is excluded from architecture analysis | `.gitignore`/index scope plus source-only checks | CI | never use `target-codex-check`, `dist`, or generated assets as design evidence.

F7: Feature outsiders use its public entry; no self-barrel, eager Canvas export or scattered large-feature roots | web architecture tests with negative entry cases | `bun run test`.
F8: Handler/query children cannot import root facades; query packages cannot open connections or own Begin/Commit/Rollback | Go AST/import checks, negative dependency cases; real mid-write restore rollback proof | `go test -race ./...`.
F9: Nested browser suites remain discovered exactly once; configured script entries exist in dev/verify/release/assets | `tests/browser-discovery.test.ts`, recursive all/critical/file selection | `bun run test`; script-specific suites retain existing CI owners.

## Debt and risks

D1: Workspace DTO/model still carries `Note`, `document`, `references` and empty compatibility arrays | preserves rollout compatibility | pay when K7 contract is explicitly removed | workspace owner.

D2: `/api/projects` and historical SQLite table names remain | avoids destructive rename with no product payoff | pay only with measured migration benefit | httpapi/migrations owner.

D3: planning/activity/capture server contracts remain while their UI surfaces are retired | preserves stored history/API compatibility | pay after product scope decides data/API retirement | product + application owners.

Risks/trade-offs: (1) legacy compatibility widens DTO and test surface; (2) one SQLite boundary limits future independent scaling; (3) third-party Canvas/editor state is complex, so browser/native proof must remain focused on durable behavior rather than implementation details.

## Assumptions

A1: Product supplies numeric latency/availability/RPO targets later; until then, correctness and recovery are verified behaviorally and no invented SLO is used.
A2: Browser and desktop continue to share product behavior and local SQLite remains authoritative.
A3: Planning/activity/capture data retirement is not authorized merely because its UI is absent; the current contract keeps those packages isolated.

## Verification and release boundary

- PF-CODE-01 (P-CODE-01…03) [important] | layout/scene/export + source contracts | iter: `bun run test`; pr: `bun run typecheck`, `bun run lint`.
- PF-CODE-02 (P-CODE-01…05,X-CODE-01…02) [critical] | existing Canvas toolbar + HTML-source browser journeys | pr: web build then `node scripts/verify/browser-e2e.mjs --file tests/e2e/canvas/canvas-toolbar.e2e.mjs` and HTML-source file; native proof remains required before enabling preview.
- Web boundary: `bun run typecheck`, `bun run lint`, `bun run test`, then the   affected WebdriverIO critical journey when a user flow changes.
- Server boundary: `gofmt`, `go vet ./...`, focused tests, and `go test -race ./...`   when concurrency or persistence semantics change.
- Persistence/migration: real SQLite integration tests and server-process   restart smoke; never fake transaction semantics.
- Desktop boundary: prepare sidecar, lifecycle smoke, `cargo check --no-default-features`,   and native WebDriver only when the matching Windows driver is available.
- Release evidence, versioning and publication remain owned by   `release-engineering`; this file does not claim deployed/released state.

### #198 implementation trace (M0–M4)

- T: Fox → existing Home route/save blocker; toggle → dock/drawer presentation; category title → disclosure; View category → existing category route.
- O: root Explorer provider retains disclosure/cache and separate dock/drawer state; shell owns responsive/focus presentation; Sidebar/navigation retain drafts and mutations.
- FL: mounted/inert collapse preserves drafts and pending dedupe; focus moves before breakpoint hiding; failed Canvas flush blocks Home and retains recovery.
- PL: no schema, storage, API, IPC, dependency or authoring-session changes; Canvas chrome is paint-isolated below the mobile drawer.
- LF: dock preference resets to auto on reload; drawer dismisses without writing it; media, Home-click and keyboard subscriptions clean up on owner teardown.
- VER AC-01/02/04/16: unified-shell browser journeys, injected titlebar-activation failure, and native titlebar/Explorer/caption-control smoke.
- VER AC-03: workspace-rail journey preserves the Canvas DOM instance, edited source, selected toolbar and zoom while releasing dock width.
- VER AC-05/06/07/08/17: existing navigation, category-first, race and category/protected-default journeys; no parallel navigation model.
- VER AC-09/13/14/15: creation/rename and breakpoint draft journeys; independent dock/drawer/reload assertions; Fox pending-save and failed-save/retry proof.
- VER AC-10/11/18: drawer/Quick Open/focus journeys plus rendered 1280/390/320px light/dark, real touch-pointer and reduced-motion acceptance.
- VER AC-12: typecheck, lint, Node contracts, complexity <=10 for shell, web build, affected browser journeys and isolated native smoke; mobile-overwrites-dock mutation was detected and restored.

Stop when the requested owner/boundary is explicit, its invariant has a proof, and the relevant checks are green. Do not reorganize for symmetry alone.
