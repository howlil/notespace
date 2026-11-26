# Engineering

This is the system contract for Notespace. It records ownership and boundaries, not a promise to reorganize the whole repository. Current source and tests are the implementation truth; migrations are incremental and behavior-preserving.

## System

Notespace is a browser product with an optional Windows Tauri shell around the same Go HTTP server and one SQLite source of truth.

```text
browser / Tauri WebView
        ↓ same-origin HTTP
internal/app (+ desktop) → internal/httpapi (router, middleware, transport, handler)
        ↓                          ↓
internal/infra/store (+ paging)    internal/infra/eraser
        ↓              ↓           ↓
internal/infra/sqlite  internal/domain (+ apperr, archive)
 (+ migrations/sql)
```

The desktop path is:

```text
Tauri lifecycle → one Go sidecar on loopback → existing web/API contract → SQLite
```

Product references: Desktop behavior and recovery, Workspace navigation, Canvas tools, and Canvas Note Card behavior in `product.md`. Canvas remains the only authoring surface; the #203 Note entity is an explicit content capability inside Canvas, not a second page or navigation model.

## Responsibilities

R1 (Desktop): own window, single-instance, resource path, sidecar lifecycle, loopback origin, update and close/flush orchestration. It must not own product entities or ordinary CRUD.

R2 (Web shell): own routes, page composition, loading/error boundaries and browser/desktop presentation. Routes select data and pages; they do not own mutations or editor state.

R3 (Feature use-cases): own user workflows and feature state. Current primary owners are `features/library`, `features/search`, and `features/workspace-authoring`.

R4 (Domain): own pure Workspace, Canvas, diagram, autosave, merge and validation rules. Domain code is framework-, HTTP- and browser-independent.

R5 (Adapters): own HTTP transport/mapping, browser events/storage, durable assets and third-party editor integration. Adapters do not become product orchestrators.

R6 (Server domain & transactional store): `internal/domain` (`+ domain/apperr, domain/archive, icon.go`) owns pure product models, error taxonomy, validation rules, ProseMirror/Excalidraw parsers, external `IconSource` contract, and ZIP/Trash codecs with zero SQL/HTTP imports. `internal/infra/store` (`+ store/paging`) owns atomic cross-entity SQLite persistence across Workspace, Canvas, Notes, Assets, Search, Trash, and Backup; `internal/infra/eraser` implements `domain.IconSource`.

R7 (HTTP transport): `internal/httpapi` owns routing (`router.go`), cross-cutting wrappers (`middleware/`), wire codecs/error mapping/query parsing (`transport/`), and thin capability handlers (`handler/`). It never imports `database/sql`, `internal/infra/sqlite`, or `internal/infra/eraser` and does not own transactions.

R8 (SQLite infra): `internal/infra/sqlite` (`+ sqlite/migrations/sql`) owns dual-pool SQLite handles (serialized writer `MaxOpenConns=1` + concurrent read-only pool), PRAGMAs, `DBTX`/`WithTx`/`WithReadTx`, verified `VACUUM INTO` snapshots, and migration execution with zero domain imports.

## State and ownership

S1: Workspace metadata and category membership | owner R6/workspace + SQLite | titles/category/version invariants are checked before persistence | concurrent writers use expected values/optimistic conflicts | durable local data, no RPO number supplied (A1).

S2: Canvas authored snapshot and Canvas version | owner R6/workspace + SQLite | each accepted update advances the server version and rejects stale writes | frontend never treats an older acknowledgement as current state.

S3: In-memory authoring draft, dirty state and flush registry | owner R3 `useWorkspaceSession`/autosave | browser memory is disposable and must flush registered Canvas asset writes before the authored snapshot, then flush to S2 before close/navigation when dirty.

S-EXPLORER (#198): the root LibraryExplorerProvider owns session-only dock preference, independent transient mobile drawer visibility, disclosure and cached category pages. Shell derives presentation at 760px and keeps the Explorer subtree mounted across collapse; forms/mutations retain their existing Sidebar/navigation owner. Router/save barriers still own navigation and dirty Canvas. No new persistence or duplicate navigation manager.

S4: Library pagination snapshot/token | owner workspace application/store | snapshot membership and ordering remain stable for one traversal; refresh, filter, sort or eviction starts a new traversal.

S5: Search/FTS projection | owner SQLite | derived and repairable; authored Workspace/Canvas state remains authoritative.

S6: Desktop session cookie, pinned loopback origin, child-process generation and profile data root | owner R1 plus desktop server boundary | one bootstrap is single-use; API requires the HttpOnly same-origin session; a busy pinned port is a recovery failure, not an automatic origin change. Debug builds use `<app-data>/dev`, packaged builds use `<app-data>`, test override uses its exact supplied directory, and stores are never moved or merged automatically.

S-CODE (#199): Excalidraw owns selected IDs and geometry; existing CanvasCodeBlockData v1 owns source/language/theme/line numbers/heightMode. CanvasEditor owns per-element ephemeral output visibility/wrap, while useCodeRunner owns bounded Worker handles/results with source/run identity fencing and cleanup. The single contextual toolbar stays visible while editing code, not manipulation. Source-only exports and measurement use headerless geometry and the same UI-local wordWrap option. Export adapters borrow per-element view options at invocation without serializing them. Selected source/output panes own local scroll/focus, while viewport/use-canvas-pinch owns modified-wheel listener lifetime using the same editor/surface refs; reading never updates authored geometry. Code hit-test math belongs to code layout, diagram-set merging to scene state, and optional Excalidraw library storage to assets; CanvasEditor composes them without a second scene or session owner. No new renderer sandbox, persistence or runtime is introduced.

S7: Browser theme, cache and local asset cache | owner shared/browser or asset adapter | never authoritative for Workspace content. Memory is an LRU capped at 32 MiB/64 entries; disk targets 128 MiB, evicting only confirmed server copies. Unknown legacy assets remain protected until upload succeeds. Permanent deletion and successful library restore invalidate caches and fence stale in-flight loads.

## Structure and dependency direction

Every web production module belongs to one of six layers. The framework entry `router.tsx` and generated `routeTree.gen.ts` live at the source root. Routes load data and compose pages. Pages compose features. Features own workflows and call adapters for I/O. Adapters may use domain or shared modules. Domain and shared each depend only on their own layer. ESLint enforces dependency direction, feature entries, and domain isolation.

| Owner | Target grouping / entry | Contract |
|---|---|---|
| R2 composition | routes stays framework-owned; pages/{home,workspace,shell} | Thin URL routes; pages compose features. |
| R3 library | features/library/index.ts; collection/, explorer/, backup/ | Sidebar joins Explorer state/UI; one root-mounted provider survives route changes. |
| R3 authoring | features/workspace-authoring/index.ts; session/, canvas/ | Session owns draft/save/recovery; CanvasEditor stays the Canvas orchestrator. |
| Canvas | Keep assets/chrome/code/diagram/flowchart/native/selection/state/sync/viewport; chrome owns tool rail/catalog, view/command UI and contextual positioning; selection composes callback-only controls and pure popup math | Colocate the Canvas-only palette in canvas/diagram/palette; code-block execution stays in canvas/code/execution with a same-origin worker CSP and bounded host output; HTML/XML preview stays in canvas/code/preview using a two-layer opaque-origin `srcdoc` sandbox paired with server framing headers and Tauri/WebView2 COM + init-script frame isolation; PNG/SVG exports include the code-block overlay. |
| R1 web desktop | features/desktop/index.ts; chrome/lifecycle/recovery/updates | Native UI and close bridge leave generic shared UI/root route bodies; root still composes cross-feature slots. |
| R4 rules | domain/{workspace,diagram,code} | Small cohesive modules stay flat; framework/HTTP/browser/editor dependencies stay outside. |
| R5 adapters | adapters/{http,browser,assets,desktop} | IPC/quiescence is distinct from generic browser events. Adapters never import features. |
| Generic UI | shared/ui/{primitives,controls,overlays,blocks,feedback,theme,brand} | Export consumed primitives and composite blocks; native chrome belongs to R1; `PersistentAppShell` owns single-shell mounting and `CanvasControllerContext` owns Canvas slice distribution. |
| R6 Go domain | `internal/domain` (`+ apperr, archive, icon.go`) | Pure models, validation, AST/scene parsers, ZIP/Trash codecs, `IconSource` contract; zero `database/sql` or `net/http`. |
| R6 Go store | `internal/infra/store` (`store/workspace/note/asset/search/backup`) + `store/paging` | Single transactional `Store` coordinator; `store/paging` stays SQL-free. |
| R7 HTTP | `internal/httpapi/router.go`; `httpapi/{middleware,transport,handler}` | Router composes middleware + handler; zero `database/sql`, `sqlite`, or `eraser` imports in `httpapi`. |
| R8 SQLite | `internal/infra/sqlite` (`open/tx/snapshot`) + `migrations/sql`; `internal/app` (+ `desktop`) | Pure dual-pool SQLite infra & migrations with zero domain imports; `app` is the composition root. |
| R1 Rust | Thin lib.rs; runtime.rs + runtime/{state,sidecar,readiness,shutdown}.rs; window/recovery/updates/diagnostics.rs | Crate-private facade; one RuntimeProcess owns child generation and close/backup locks. |
| Browser proofs | tests/e2e/{canvas,library,settings,support} | One harness; recursive discovery, critical selection and fixture roots move together. |
| CLI / landing | scripts/{dev,verify,release,assets}; Astro pages/layouts/components/styles/lib | Update Taskfile/package/workflow paths together. Small landing needs no additional hierarchy. |

Outside callers use the feature's `index.ts`. Inside a feature, use direct imports. Compose sibling features in pages or the root route. Root-owned stylesheet imports stay explicit and ordered in the managed head. Keep the Excalidraw SDK inside Canvas and load CanvasEditor lazily through Workspace authoring.

Go subfolders create packages; Store/API receiver methods cannot move there unchanged. Extract repositories/handlers behind existing facade signatures. Children must not import their parent facade; Go packages are the entries, not TypeScript-style index files.

`internal/infra/store.Store` coordinates atomic SQLite transactions via `internal/infra/sqlite.DB` (`WithTx`/`WithReadTx`) and passes borrowed `sqlite.DBTX` / `*sql.Tx` across internal helpers. Pure archive codecs (`domain/archive`) and document/scene parsers (`domain`) remain SQL-free: `Store` takes the consistent snapshot, decodes/validates before restore, and alone owns atomic mutation. Canvas writes funnel through a single `applyCanvasTx` helper (both generic workspace updates and Canvas Note create/delete) that composes Canvas update, `syncNoteGeometryTx`, `advanceCanvasSearchRevisionTx`, and `invalidateNotesInWorkspaceSearchTx` on that same transaction. The per-Note FTS projection is lazy via `canvas_note_search_meta`. Dual-pool SQLite serializes writes (`MaxOpenConns=1`, `BEGIN IMMEDIATE`) while reads and clean search run on the concurrent `mode=ro` reader pool without blocking autosave. Pre-migration snapshots run in `internal/infra/sqlite` before executing `sqlite/migrations` with the injected `store` scrub hook.

Put feature-specific state, actions, and UI with the owning capability. Keep shared code limited to primitives used across capabilities and group files by responsibility. Use relative paths for local web imports so lint can resolve their owners.

Change one owner with its callers/tests/checks together. Keep public feature exports limited to consumed interfaces, and cross-feature composition in pages/root. Go children cannot reach parent facades; shared SQL contracts remain SQL-only. No schema/API/source-of-truth change belongs to a folder move.

## Contracts

K1 Web → HTTP: relative `/api/...` requests use typed adapters; transport maps status/errors, while application packages own semantics. All APIs use `Workspace` and `Canvas Note`; retired `/api/projects`, full-snapshot `PATCH /api/workspaces/{id}`, `planning`, `capture`, and `activity` routes are removed.

K2 HTTP → application: decode and validate transport input, call the narrow use-case, map known domain errors. No handler reaches through a service to its store or starts a cross-domain transaction.

K3 Application → SQLite: interfaces are owned by the consuming application package. A transaction is required when one invariant spans Workspace, Canvas, Notes, assets, Trash or full-library restore.

K4 Canvas save: client sends the base version; server accepts the next state or returns conflict; client fetches/rebases/merges according to the Canvas conflict rules and never overwrites an unresolved concurrent edit. Acknowledgements merge into both the live draft and any queued edit before the next write. Failed image uploads remain in the asset barrier until retry succeeds or the image is removed.

K5 Desktop: Tauri starts the sidecar, waits for its one-use bootstrap URL, then uses the authenticated sidecar origin. In debug, static bootstrap prevents an aborted initial Vite SSR stream; UI/HMR may proxy to Vite, but `/api` remains sidecar-owned.

K6 Migration: migrations are append-only and must validate existing data, retain a verified pre-upgrade recovery copy when required, then commit or rollback atomically. Code N must read the supported N-1 state during rollout; breaking removal uses expand → migrate → contract. Previously applied migration variants are recognized only by explicit checksum; follow-up behavior ships in a new migration, never by rewriting stored checksums or replacing the library. Each migration commits its schema fingerprint in the same transaction so restart can resume after a later step fails.

K7 Retired domain contraction (`0031_contract_retired_domains.sql`): historical `planning`, `capture`, `activity`, legacy `workspace_notes`, `workspace_history`, and retired `projects` columns (`references_state`, `split_ratio`, `notes_revision`) are contracted from the active schema and server packages. Portable recovery uses v3 ZIP archives (`application/zip`, while still accepting N-1 v2 ZIP archives during rollout per K6); desktop native SQLite recovery (`snapshot.go`) remains active.

K8 Canvas Note (issue #203): canonical Note content is a library-level, versioned entity in a new storage namespace; SQLite stores a tagged document in `canvas_notes.document_state`. New blank Notes use `{"type":"markdown","text":"…"}` with Markdown source as the content authority. Existing `type:"doc"` ProseMirror Notes keep their content and editor. Both kinds share Note identity, revisions, autosave, and archive validation. Rendering Markdown uses a transient projection. Canvas scene elements carry typed `{ noteId, instanceId, version }` references and own geometry. Note content and Canvas snapshots have independent optimistic versions and save lifecycles. Create+place is one idempotent server transaction; removing an instance never deletes its Note. Existing backups must round-trip canonical Notes and references; restore validates references and rejects malformed or unsupported Note schema versions atomically. Rich input is parsed, sanitized and validated at its ingress; assets remain managed by the existing asset lifecycle. Search and reference previews are derived projections; a preview is read-only and bounded, never another canonical editor. A mounted Canvas re-reads its referenced Notes on entry; real-time multi-window collaboration is out of scope. Canonical Note deletion is a separately guarded library operation (`DELETE /api/notes/{id}`): it removes only an empty Note that no live Canvas element places, clearing that Note's orphan instance rows in the same transaction; it is never an instance-delete alias and writes no Trash record because an empty Note holds nothing to recover. Notes with content or placements use Trash instead (B16): `canvas_notes.deleted_at` (migration 0032, additive, NULL = active) marks a trashed Note whose content, revision and instance rows stay intact. The `library` package owns the lifecycle (`POST /api/notes/{id}/trash`, `GET /api/trash/notes`, `POST|DELETE /api/trash/notes/{id}`); trashed Notes stay readable via `GET /api/notes/{id}` (`deletedAt` set) but reject update and placement with `note_trashed` (409), disappear from list, search and backlinks, and `deleted_at` rides in the v3 archive `notes[]` (absent in older archives = active). Permanent delete is allowed only from Trash and has no automatic purge.

DEP1 SQLite/modernc: local durable store; failure blocks writes and startup, recovery is through validation and backup paths; no remote availability target is assumed.
DEP2 Tauri/WebView2: desktop host boundary; failure is surfaced as recoverable startup/native verification failure, not hidden in web product code.
DEP3 Excalidraw: editor implementation dependencies; failures are contained by Workspace-authoring adapters and persisted snapshots.
DEP4 Eraser/CDN icon source: optional external dependency; timeout/cache/fallback must not corrupt authored state.

## Critical flows

FL1 Desktop launch: Tauri → sidecar → SQLite migration/health → one-use session → WebView → existing UI. If startup fails, show Retry/diagnostics without creating a second runtime.

FL2 Canvas authoring: Canvas event → authoring session → registered asset writes → autosave/conflict core → HTTP API → workspace service → SQLite versioned Canvas row → acknowledgement. Close/navigation first flushes assets and granular saves.

FL3 Pagination: library query → workspace service/store creates or resumes a snapshot → SQLite returns stable page → UI advances using snapshot token. A stale/evicted token restarts from page one.

FL4 Destructive lifecycle: Trash/restore/backup request → library use-case → one SQLite transaction → validated durable result. No raw delete path bypasses the library contract.

FL5 Domain contraction: startup migration validates and snapshots old data → contracts retired `planning`, `capture`, `activity`, `workspace_notes`, and `workspace_history` schema → preserves active Workspaces, Canvas, Notes, Assets, and Trash.

FL6 Canvas Note knowledge actions: an active card creates semantic document changes, managed assets or stable references → the authoring session flushes versioned Note content → SQLite updates the canonical entity and derived search/reference projections → another Canvas reloads the identity on entry. Invalid input, missing targets and unavailable AI remain recoverable presentation states and do not create a second content owner.

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

DEC4 [one-way]: contract retired `planning`, `capture`, `activity`, legacy `workspace_notes`, `workspace_history`, `/api/projects`, and JSON backup restore codecs (`0031_contract_retired_domains.sql`), keeping only active Workspace, Canvas, Canvas Note, Asset, and v3 ZIP recovery contracts alongside desktop SQLite snapshots.

DEC5 [two-way]: retain Tiptap/ProseMirror as the editor and document model for existing rich Notes (K8); use only MIT-licensed core/extensions and keep editor-specific code behind the Canvas Note adapter. Driver: J3/B9-B10, M1-M4, and no existing rich-text editor owner. Trade-off: added editor payload and ProseMirror schema/version maintenance. Revisit if the in-app IME/paste/Canvas-transform spike fails or measured lazy-chunk cost is unacceptable. Feasibility evidence: current app uses React 18; registry metadata for Tiptap 3.30.3 declares React 18 peer support and MIT licensing; StarterKit and table are modular dependencies. This is a package/API feasibility result, not a verified in-app IME, SSR, clipboard, or zoom result; those remain M1 proof gates.

DEC6 [two-way]: keep cross-Canvas Note freshness as re-read-on-entry and explicit recovery, not a subscription protocol. Driver: local-first single-user scope and K8's optimistic revision contract. Trade-off: a second already-open Canvas can be stale until it re-enters or reloads; real-time synchronization requires a separately authorized collaboration boundary.

DEC7 [one-way]: make the per-Note FTS projection lazy and single-path. Canvas writes share one `applyCanvasTx` tx helper (generic updates + Note create/delete), and `canvas_note_search_meta` (migration 0030) tracks each Note's revision so `syncCanvasNotesTx` reindexes only stale Notes instead of rebuilding every row per search; placement changes invalidate via `InvalidateNotesInWorkspaceTx`. Driver: K8 derived projections, FL6 lazy search, and R8 single-write-owner; removes the duplicated canvas-update tx logic and the full note FTS rebuild on every query. Trade-off: one extra meta table and an invalidation hook; over-invalidation (shared Notes reindexed across workspaces) is accepted as correct-but-broader. Revisit if note counts stay small and the rebuild cost is unmeasured.

DEC8 [one-way]: reject `image/svg+xml` (and any `image/svg*`) at every asset ingress. New uploads/restores deny SVG (`NormalizeMimeType` is shared by upload, store, and restore) so untrusted SVG never executes inline on the same origin; any pre-DEC8 stored non-image or SVG asset remains readable only behind download isolation (`Content-Security-Policy: sandbox`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`). Driver: secure-default ingress and non-destructive upgrade compatibility. Trade-off: no new user-uploaded SVG in asset storage; icons (validated from the eraser source and served separately) remain unaffected.

DEC9 [one-way]: classify Canvas Note write errors at the Store boundary instead of mapping every failure to conflict. `normalizeNoteWriteError` turns only SQLite constraint codes (UNIQUE/PRIMARYKEY/FOREIGNKEY) into `note.ErrConflict` (409) and wraps everything else as an infrastructure error (500). Driver: accurate error semantics, reliability and observability. Trade-off: a non-constraint database fault no longer masquerades as a user-facing conflict.

## Fitness rules

F1: Web module placement and dependency direction | `notespace/web-boundaries` in `eslint.config.mjs` | `bun run lint` checks imports, re-exports, and dynamic imports.
F2: Web domain is independent of browser, HTTP, UI, editor, and desktop runtime | web boundary and restricted-global rules | `bun run lint`.
F3: Features compose through pages or routes; non-desktop features delegate native SDK access to adapters | web boundary rule | `bun run lint`.
F4: Server `internal/` keeps exact 4 tiers (`app`, `httpapi`, `domain`, `infra`) and enforces strict one-way DAG (`app → httpapi → {domain, infra/store}`, `infra → domain`, `domain` free of `sql`/`http`, `infra/sqlite` free of `domain`/`http`) | `tests/architecture_test.go` AST checks | enforced in Go tests; exception requires D#.
F5: Canvas Note authoring is only through Canvas; legacy Note fields/routes cannot become its canonical storage | source/route contract tests | CI | pass when Canvas ownership checks and legacy compatibility tests remain green under K7/K8.
F6: Generated/bundled output is excluded from architecture analysis | `.gitignore`/index scope plus source-only checks | CI | never use `target-codex-check`, `dist`, or generated assets as design evidence.

F7: Feature outsiders use its public entry, internals import directly, and `CanvasEditor` stays lazy via dynamic import | `notespace/web-boundaries` in `eslint.config.mjs` | `bun run lint`.
F8: Subpackage boundaries hold across `httpapi/{middleware,transport,handler}`, `infra/store/paging`, `domain/archive`, `infra/sqlite`, and `infra/eraser`; pure domain/archive/paging packages never import `database/sql`, and `httpapi` never touches SQL, SQLite, or Eraser directly | `tests/architecture_test.go` + mid-write rollback proof | `go test -race ./...`.
F9: Nested browser suites remain discovered exactly once; configured script entries exist | `scripts/verify/browser-discovery.test.mjs`, recursive all/critical/file selection | `node --test scripts/verify/browser-discovery.test.mjs`.
F10: Web UI tokens (`bg-surface`, `no-scrollbar`, `z-[var(--z-*)]`) and single persistent shell ownership (`LibraryPageShell` only in `PersistentAppShell`) | `notespace/ui-tokens` & `notespace/web-boundaries` in `eslint.config.mjs` | `bun run lint`.

## Debt and risks

D1: Historical SQLite table name `projects` remains for Workspace rows | avoids destructive table rename with no product payoff | pay only with measured migration benefit | migrations owner.

Risks/trade-offs: (1) one SQLite boundary limits future independent scaling; (2) third-party Canvas/editor state is complex, so browser/native proof must remain focused on durable behavior rather than implementation details.

## SLI baseline, recovery & assumptions

- Startup/readiness SLI: sidecar `/api/health` (`ok`) and single-use loopback bootstrap complete within startup window (`FL1`, one runtime generation).
- Save durability SLI: dirty Canvas/Note/asset flush acknowledges before close/navigation (`G1`, `K4`), rejecting stale optimistic versions with zero silent drop.
- Update install integrity SLI: stable MSI is updater-signed (`latest.json`, `.msi.sig`, `SHA256SUMS.txt`, GitHub build provenance attestation), verified post-publication (`verify-desktop-release-assets.mjs`), and N-1 -> N upgrade preserves user data.
- Latency & privacy SLI: `RequestObservability` logs `request_id`, `method`, `route`, `status`, `response_bytes`, `duration_ms`, and DB pool wait deltas without workspace titles, Canvas JSON, Note text, or search queries; `TestPersistenceScaleEvidence` checks 1 MiB Canvas save P95 <= 250 ms.
- Recovery & no-auto-downgrade: pre-upgrade `VACUUM INTO` snapshot (`.recovery/*.db`, `ValidateFull`) runs before schema changes; failed migrations roll back atomically leaving DB and snapshot recoverable; unsupported future `schema_migrations`, checksum mismatches, or `schema_state` drift fail closed with zero silent downgrade or automatic store relocation (`S6`).
A2: Browser and desktop continue to share product behavior and local SQLite remains authoritative.

## Verification and release boundary

- PF-CODE-01 (P-CODE-01…03) [important] | layout/scene/export + source contracts | iter: `bun run test`; pr: `bun run typecheck`, `bun run lint`.
- PF-CODE-02 (P-CODE-01…05,X-CODE-01…02) [critical] | Canvas toolbar + HTML preview browser journeys | pr: web build then `node scripts/verify/browser-e2e.mjs --file tests/e2e/canvas/canvas-toolbar.e2e.mjs` and `tests/e2e/canvas/workspace-html-preview.e2e.mjs`; Windows WebView2 proof runs in `desktop-webdriver-smoke.mjs`.
- PF-CI-01 (#200 A2/M1): browser discovery owns full/legacy/smoke/affected plans; policy maps suite/case risks, always retains P0 smoke, and falls back to full for unknown/shared impact. Invalid inputs fail; publisher authority is PF-CI-05. Proof: discovery/CLI unit tests at iter; actual selected/full WebdriverIO runs at pr. No application/storage/native lifecycle authority moves.
- PF-CI-02 (#200 A1/M2): PR ci classifies complete merge-base paths (rename/delete included); unknown/history failure selects all owners. The always-running gate independently recollects diff, matches the exact-SHA plan, and rejects missing/failed/canceled/skipped required proof or stale job SHA. Web checks and browser prepare/build/proof run independently after classification; exactly one production web build per selection (browser job when selected, web job otherwise), with both required exact-SHA results still aggregated. Browser builds and tests in one checkout, not via an artifact handoff. Proof: policy matrices at iter; real Git/CLI and parsed workflow DAG/build-ownership checks at pr; actual GitHub checks before integration. Publisher authority is PF-CI-05; reused native workflow has a distinct concurrency group.
- PF-CI-03 (#200 M3/A2): legacy/reused Windows native PR selection consumes the same tested owner map; master always requires Windows 2022 proof. Colocated web/Go test-only paths run their unit owner; native chrome CSS remains host-specific. Bun package-download/2.1.0 driver caches are OS/arch/runtime/lock keyed, master-write only after successful proof; installed Windows node_modules must not be archived (junctions were lost in actual warm verification). Frozen install recreates project links every run; driver validation, Rust/PE/lifecycle and real close/readback never skip on hits. Package snapshots exclude every lookup alias/junction (including broken aliases), unlinking cache entries without following/deleting targets; snapshot roots cannot themselves be junctions. Proof: policy/real-FS and parsed-cache contracts at iter/pr; real cold/warm Windows at pr/merge, measurements in PR evidence.
- PF-CI-04 (#200 M4/A2, lean CI): stage is fresh gate evidence: PR splits lanes per changed owner with conservative fail-closed fallback; `master` push skips heavy app/desktop lanes only for pure docs-only or landing-only diffs (running all lanes for any app, server, desktop, script, workflow, beta-release-note, or unknown diff) + real Compose restart (BuildKit GHA cache) and legacy-critical∪P0 browser proof; manual/scheduled regression runs full browser plus extended Linux, Windows-latest, and macOS desktop checks. Regression has a separate check/concurrency identity, not release authority. Proof: event/owner/CLI matrices and parsed DAG checks at iter/pr; actual PR/master/manual runs at merge.
- PF-CI-05 (#200 M5a/A1): master requires strict, GitHub-Actions-bound `ci / gate`, including admins; no review requirement is added. Publishers collect authenticated current-master + latest push `ci` identity and exact-run/attempt gate plus target-specific required lane proofs (`--target desktop | image`); reject stale master/SHA, newer failed/pending run, wrong source, missing/duplicate/skipped/canceled gate or target lane proof, or stale attempt. Manual/scheduled regression and legacy names never authorize publication. Recollect run metadata and master after job collection.
- PF-CI-06 (#200 M5b, trigger isolation & lean release): all publication/deployment entries are manual-only; ordinary pushes, tags and completion events never dispatch releases. Canonical entry is `release.yml`: validated preflight (safe default), desktop-stable, desktop-stable-resume, or image. Each publisher depends on read-only exact-master admission, with lane-scoped permissions and explicit secret mappings. Stable passes immutable tag output from prepare-only to its Windows MSI artifact owner in the same run (`windows-installer` starts immediately after preflight; cross-platform macOS/Linux checks run in regression; dedicated `windows-2022-desktop-release` Rust cache restores before version sync; redundant `cargo test` and `test:desktop:native` stay in master CI/critical proof while `test:desktop:critical`, real MSI N-1→N upgrade, signing, manifest, provenance, and post-publication `verify-desktop-release-assets.mjs` gates remain hard blockers; `image` builds once, verifies `compose.yaml` + `smoke-persistence.py --compose-restart`, then promotes the exact verified digest). Exact-master CI precedes signing/build/push admission.
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
