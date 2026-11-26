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

R2 (Web shell): `routes` and `app` own URL routes, page composition, the persistent shell, loading/error boundaries and browser/desktop presentation. Routes select data and pages; they do not own mutations or editor state.

R3 (Modules): `modules/library`, `modules/workspace`, `modules/canvas` and `modules/note-editor` own user workflows, feature state and their UI. Workspace composes Canvas and Note editing; modules otherwise compose in `app`.

R4 (Entities): `entities/` owns pure Workspace, Canvas-reference and Note rules. It is framework-, HTTP- and browser-independent.

R5 (Platform): `platform/{api,assets,desktop,runtime}` own HTTP transport/mapping, durable assets and caches, native desktop IPC and process-wide runtime barriers. Platform does not become a product orchestrator.

R6 (Server domain & transactional store): `internal/domain` (`+ domain/apperr, domain/archive, icon.go`) owns pure product models, error taxonomy, validation rules, Markdown Note and Excalidraw parsers, external `IconSource` contract, and ZIP/Trash codecs with zero SQL/HTTP imports. `internal/domain/legacynote` is the only code that reads the retired rich Note document and is imported solely by the 0033 migration hook and backup import. `internal/infra/store` (`+ store/paging`) owns atomic cross-entity SQLite persistence across Workspace, Canvas, Notes, Assets, Search, Trash, and Backup; `internal/infra/eraser` implements `domain.IconSource`.

R7 (HTTP transport): `internal/httpapi` owns routing (`router.go`), cross-cutting wrappers (`middleware/`), wire codecs/error mapping/query parsing (`transport/`), and thin capability handlers (`handler/`). It never imports `database/sql`, `internal/infra/sqlite`, or `internal/infra/eraser` and does not own transactions.

R8 (SQLite infra): `internal/infra/sqlite` (`+ sqlite/migrations/sql`) owns dual-pool SQLite handles (serialized writer `MaxOpenConns=1` + concurrent read-only pool), PRAGMAs, `DBTX`/`WithTx`/`WithReadTx`, verified `VACUUM INTO` snapshots, and migration execution with zero domain imports.

## State and ownership

S1: Workspace metadata and hierarchy (`parent_id`) | owner R6/workspace + SQLite | titles/parent/cycle/version invariants are checked before persistence | concurrent writers use expected values/optimistic conflicts | durable local data, no RPO number supplied (A1).

S2: Canvas authored snapshot and Canvas version | owner R6/workspace + SQLite | each accepted update advances the server version and rejects stale writes | frontend never treats an older acknowledgement as current state.

S3: In-memory authoring draft, dirty state and flush registry | owner `modules/workspace` session/autosave | browser memory is disposable and must flush registered Canvas asset writes before the authored snapshot, then flush to S2 before close/navigation when dirty.

S-EXPLORER (#198): the root LibraryExplorerProvider owns session-only dock preference, independent transient mobile drawer visibility, disclosure and cached category pages. Shell derives presentation at 760px and keeps the Explorer subtree mounted across collapse; forms/mutations retain their existing Sidebar/navigation owner. Router/save barriers still own navigation and dirty Canvas. No new persistence or duplicate navigation manager.

S4: Library pagination snapshot/token | owner workspace application/store | snapshot membership and ordering remain stable for one traversal; refresh, filter, sort or eviction starts a new traversal.

S5: Search/FTS projection | owner SQLite | derived and repairable; authored Workspace/Canvas state remains authoritative.

S6: Desktop session cookie, pinned loopback origin, child-process generation and profile data root | owner R1 plus desktop server boundary | one bootstrap is single-use; API requires the HttpOnly same-origin session; a busy pinned port is a recovery failure, not an automatic origin change. Debug builds use `<app-data>/dev`, packaged builds use `<app-data>`, test override uses its exact supplied directory, and stores are never moved or merged automatically.

S-CODE (#199): Excalidraw owns selected IDs and geometry; existing CanvasCodeBlockData v1 owns source/language/theme/line numbers/heightMode. CanvasEditor owns per-element ephemeral output visibility/wrap, while useCodeRunner owns bounded Worker handles/results with source/run identity fencing and cleanup. The single contextual toolbar stays visible while editing code, not manipulation. Source-only exports and measurement use headerless geometry and the same UI-local wordWrap option. Export adapters borrow per-element view options at invocation without serializing them. Selected source/output panes own local scroll/focus, while viewport/use-canvas-pinch owns modified-wheel listener lifetime using the same editor/surface refs; reading never updates authored geometry. Code hit-test math belongs to code layout, diagram-set merging to scene state, and optional Excalidraw library storage to assets; CanvasEditor composes them without a second scene or session owner. No new renderer sandbox, persistence or runtime is introduced.

S7: Browser theme, cache and local asset cache | owner shared/browser or platform/assets | never authoritative for Workspace content. Memory is an LRU capped at 32 MiB/64 entries; disk targets 128 MiB, evicting only confirmed server copies. Unknown legacy assets remain protected until upload succeeds. Permanent deletion and successful library restore invalidate caches and fence stale in-flight loads.

## Structure and dependency direction

Every web production module belongs to one of six layers under `apps/web/src`: `routes`, `app`, `modules`, `platform`, `entities`, `shared`. The framework entry `router.tsx` and generated `routeTree.gen.ts` live at the source root. Routes load data and select pages. `app` composes pages, the persistent shell, Quick Open and Settings from modules. Modules own workflows and call `platform` for I/O. `platform` may use `entities` and `shared`; `entities` and `shared` depend only on their own layer. ESLint (`notespace/web-boundaries`) enforces the direction, module entries and model isolation.

| Owner | Grouping / entry | Contract |
|---|---|---|
| Composition | `routes/` (framework-owned), `app/{pages,shell,settings,command-palette}` | Thin URL routes; `app` composes modules and mounts `LibraryPageShell` only in `PersistentAppShell`. |
| Library | `modules/library/index.ts`; `collection/`, `explorer/`, `backup/`, `model/` | Sidebar joins Explorer state/UI; one root-mounted provider survives route changes. |
| Workspace | `modules/workspace/index.ts`; `session/`, `model/` | Session owns draft/save/recovery; it composes Canvas and Note editing and lazy-loads `CanvasEditor`. |
| Canvas | `modules/canvas/{core,chrome,objects,selection}` | `core` is the Excalidraw orchestrator; `objects` holds code block, diagram, flowchart and Note card; chrome owns tool rail/view UI; HTML/XML preview uses a two-layer opaque-origin `srcdoc` sandbox with server framing headers and Tauri/WebView2 frame isolation; code execution uses a same-origin worker with bounded output; PNG/SVG exports include the code-block and Note overlays. |
| Note editor | `modules/note-editor/index.ts`; `model/note-markdown.ts` | One CodeMirror editor, one marked-token model feeding the React read view and the SVG export; Notes never mount a second editor. |
| Entities | `entities/{workspace,note}.ts` | Pure shapes and rules; no React, HTTP or browser APIs. |
| Platform | `platform/{api,assets,desktop,runtime}` | HTTP clients, durable assets/cache, native IPC and quiescence barriers; platform never imports modules. |
| Generic UI | `shared/{ui,browser,lib,styles}` | Export consumed primitives and composite blocks; `PersistentAppShell` owns single-shell mounting and `CanvasControllerContext` owns Canvas slice distribution. |
| R6 Go domain | `internal/domain` (`+ apperr, archive, legacynote, icon.go`) | Pure models, validation, Markdown/scene parsers, ZIP/Trash codecs, `IconSource` contract; zero `database/sql` or `net/http`. |
| R6 Go store | `internal/infra/store` (`store/workspace/note/asset/search/backup`) + `store/paging` | Single transactional `Store` coordinator; `store/paging` stays SQL-free. |
| R7 HTTP | `internal/httpapi/router.go`; `httpapi/{middleware,transport,handler}` | Router composes middleware + handler; zero `database/sql`, `sqlite`, or `eraser` imports in `httpapi`. |
| R8 SQLite | `internal/infra/sqlite` (`open/tx/snapshot`) + `migrations/sql`; `internal/app` (+ `desktop`) | Pure dual-pool SQLite infra & migrations with zero domain imports; `app` is the composition root. |
| R1 Rust | Thin lib.rs; runtime.rs + runtime/{state,sidecar,readiness,shutdown}.rs; window/recovery/updates/diagnostics.rs | Crate-private facade; one RuntimeProcess owns child generation and close/backup locks. |
| Browser proofs | `tests/e2e/{canvas,library,settings,support}` | One harness; recursive discovery, critical selection and fixture roots move together. |
| CLI / landing | `scripts/{dev,verify,release,assets}`; Astro pages/layouts/components/styles/lib | Update Taskfile/package/workflow paths together. Small landing needs no additional hierarchy. |

Outside callers use a module's `index.ts`; inside a module, use direct imports. Compose sibling modules in `app`, except that Workspace may use Canvas and Note editing and Canvas may use Note editing. Root-owned stylesheet imports stay explicit and ordered in the managed head. Keep the Excalidraw SDK inside Canvas and load CanvasEditor lazily through Workspace.

Go subfolders create packages; Store/API receiver methods cannot move there unchanged. Extract repositories/handlers behind existing facade signatures. Children must not import their parent facade; Go packages are the entries, not TypeScript-style index files.

`internal/infra/store.Store` coordinates atomic SQLite transactions via `internal/infra/sqlite.DB` (`WithTx`/`WithReadTx`) and passes borrowed `sqlite.DBTX` / `*sql.Tx` across internal helpers. Pure archive codecs (`domain/archive`) and document/scene parsers (`domain`) remain SQL-free: `Store` takes the consistent snapshot, decodes/validates before restore, and alone owns atomic mutation. Canvas writes funnel through a single `applyCanvasTx` helper (both generic workspace updates and Canvas Note create/delete) that composes Canvas update, `syncNoteGeometryTx`, `advanceCanvasSearchRevisionTx`, and `invalidateNotesInWorkspaceSearchTx` on that same transaction. The per-Note FTS projection is lazy via `canvas_note_search_meta`. Dual-pool SQLite serializes writes (`MaxOpenConns=1`, `BEGIN IMMEDIATE`) while reads and clean search run on the concurrent `mode=ro` reader pool without blocking autosave. Pre-migration snapshots run in `internal/infra/sqlite` before executing `sqlite/migrations` with the injected `store` scrub hook.

Put module-specific state, actions, and UI with the owning capability. Keep shared code limited to primitives used across capabilities and group files by responsibility. Use relative paths for local web imports so lint can resolve their owners.

Change one owner with its callers/tests/checks together. Keep public module exports limited to consumed interfaces, and cross-module composition in `app`. Go children cannot reach parent facades; shared SQL contracts remain SQL-only. No schema/API/source-of-truth change belongs to a folder move.

## Contracts

K1 Web → HTTP: relative `/api/...` requests use typed adapters; transport maps status/errors, while application packages own semantics. All APIs use `Workspace` and `Canvas Note`; retired `/api/projects`, `/api/categories`, `PATCH /api/workspaces/{id}/category`, full-snapshot `PATCH /api/workspaces/{id}`, `planning`, `capture`, and `activity` routes are removed. `GET /api/legacy/categories/{id}` resolves migrated category deep links.

K2 HTTP → application: decode and validate transport input, call the narrow use-case, map known domain errors. No handler reaches through a service to its store or starts a cross-domain transaction.

K3 Application → SQLite: interfaces are owned by the consuming application package. A transaction is required when one invariant spans Workspace, Canvas, Notes, assets, Trash or full-library restore.

K4 Canvas save: client sends the base version; server accepts the next state or returns conflict; client fetches/rebases/merges according to the Canvas conflict rules and never overwrites an unresolved concurrent edit. Acknowledgements merge into both the live draft and any queued edit before the next write. Failed image uploads remain in the asset barrier until retry succeeds or the image is removed.

K5 Desktop: Tauri starts the sidecar, waits for its one-use bootstrap URL, then uses the authenticated sidecar origin. In debug, static bootstrap prevents an aborted initial Vite SSR stream; UI/HMR may proxy to Vite, but `/api` remains sidecar-owned.

K6 Migration: migrations are append-only and must validate existing data, retain a verified pre-upgrade recovery copy when required, then commit or rollback atomically. Code N must read the supported N-1 state during rollout; breaking removal uses expand → migrate → contract. Previously applied migration variants are recognized only by explicit checksum; follow-up behavior ships in a new migration, never by rewriting stored checksums or replacing the library. Each migration commits its schema fingerprint in the same transaction so restart can resume after a later step fails.

K7 Retired domain contraction (`0031_contract_retired_domains.sql`): historical `planning`, `capture`, `activity`, legacy `workspace_notes`, `workspace_history`, and retired `projects` columns (`references_state`, `split_ratio`, `notes_revision`) are contracted from the active schema and server packages. Portable recovery uses v4 ZIP archives (`application/zip`, still accepting v2 and v3, see K9); desktop native SQLite recovery (`snapshot.go`) remains active.

K8 Canvas Note (issue #203): canonical Note content is a library-level, versioned entity; SQLite stores `canvas_notes.document_state` as `{"type":"markdown","text":"…"}`, the only accepted document, with the Markdown source as its sole authority. `internal/domain/document.go` validates the envelope (exactly `type` and `text`, UTF-8, no NUL, within 1 MiB) and derives search text, label, excerpt, emptiness and backlinks from the text; rendering and export lex the same text with marked and never persist a second representation. References are plain Markdown: `![label](/workspaces/<w>?noteId=<id>)` embeds a Note, `[label](…&blockId=<b>)` references a block, a trailing ` ^id` names a block, and an image is `![alt](/api/workspaces/<w>/assets/<id>)`. A Note references an asset by that destination (`workspace_asset_references`, migration 0034). Canvas scene elements carry typed `{ noteId, instanceId, version }` references and own geometry. Note content and Canvas snapshots have independent optimistic versions and save lifecycles. Create+place is one idempotent server transaction; removing an instance never deletes its Note. Rendered Markdown is allowlisted: images only from the asset route, links only `isSafeNoteLink`, inline HTML only `<u>`, `<mark data-tone>`, `<span data-color>` and `<br>`; everything else is literal text. Search and reference previews are derived, read-only and bounded. A mounted Canvas re-reads its referenced Notes on entry; real-time multi-window collaboration is out of scope. Canonical Note deletion is a guarded library operation (`DELETE /api/notes/{id}`): it removes only an empty Note that no live Canvas element places, clearing that Note's orphan instance rows in the same transaction. Notes with content or placements use Trash (B16): `canvas_notes.deleted_at` (migration 0032, NULL = active) marks a trashed Note whose content, revision and instance rows stay intact; the `library` package owns the lifecycle (`POST /api/notes/{id}/trash`, `GET /api/trash/notes`, `POST|DELETE /api/trash/notes/{id}`); trashed Notes stay readable via `GET /api/notes/{id}` (`deletedAt` set) but reject update and placement with `note_trashed` (409), disappear from list, search and backlinks, and `deleted_at` rides in the archive `notes[]`. Permanent delete is allowed only from Trash and has no automatic purge.

K9 Legacy Note conversion (migration 0033, expand → migrate → contract in one step): `store.convertNotesToMarkdownTx` runs inside the 0033 transaction after the verified pre-upgrade snapshot. It rewrites every `type:"doc"` Note with `legacynote.Upgrade` (existing Markdown is kept byte for byte), saves the original in `canvas_note_legacy_documents` (removed with its Note), advances the revision, and fails the whole migration, naming the Note, when any Note cannot be converted or the converted text would lose a letter or digit of the original. Note ids, instance ids, placements, references, assets and trashed state are untouched. The note-asset triggers are dropped in 0033 and recreated against Markdown references in 0034 so the rewrite cannot release an image. Backup archives v2 and v3 are converted at import before any restore statement runs; an archive that cannot be converted is rejected and the library is left untouched. Exports are v5. A build before this change rejects a v5 archive instead of misreading it.

K10 Workspace hierarchy (migration 0035): `projects.parent_id` replaces mandatory `categories` (`projects.category_id`). Ordinary categories become root Workspaces with valid empty Canvases via deterministic collision-safe `category_workspace_redirects`; `'legacy'` members become roots; `workspace_trash` and `workspace_search` move from `category_id` to `parent_id`; `verifyAndUpgradeWorkspaceHierarchyTx` verifies Canvas presence, acyclicity, and trash payload `parentId` inside the FK-off transaction before `migrations.Validate` and commit. Non-empty parent deletion returns `409 workspace_has_children`; reparenting validates cycle/self/missing-parent in transaction; orphaned trashed children restore to root with `restoredToRoot: true`. Backup archives v2–v4 convert categories to root Workspaces at import before restore.

K11 Knowledge Graph, Tags, Browser Nav & Sections (migration 0036): `note_references` (derived from `ExtractNoteReferences` in the same tx as note creation/update/restore; no target FK so broken links remain visible), `tags`, and `note_tags` live in SQLite. Exports are v6 (still importing v2–v5). `GET /api/notes` supports AND `tagIds` filters and 5-tier deterministic `scope=related` ranking (`selectedNoteId`) returning transparent `relatedReason` labels. Client-only `browserNavStore` (`localStorage`) owns per-tab history, tab groups, and pinned tabs/folders; Canvas Semantic Sections derive hierarchical outlines (`?sectionId=`) and workspace shortcuts without changing Canvas snapshot ownership.

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

FL6 Canvas Note knowledge actions: an active card changes Markdown source, adds managed images or writes stable references → the authoring session flushes versioned Note content → SQLite updates the canonical entity and derived search/reference projections → another Canvas reloads the identity on entry. Invalid input, missing targets and unavailable AI remain recoverable presentation states and do not create a second content owner.

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

DEC4 [one-way]: contract retired `planning`, `capture`, `activity`, legacy `workspace_notes`, `workspace_history`, `/api/projects`, and JSON backup restore codecs (`0031_contract_retired_domains.sql`), keeping only active Workspace, Canvas, Canvas Note, Asset, and ZIP (v4) recovery contracts alongside desktop SQLite snapshots.

DEC5 [one-way]: Markdown is the only Note format and CodeMirror the only Note editor; Tiptap and ProseMirror are removed from runtime, manifests and lockfile. Driver: one source of truth, a smaller dependency and maintenance surface, and no parallel legacy workflow. Trade-off: no slash menu, formatting toolbar, table toolbar, extract-to-Note or reference pickers; highlight, colour and underline survive as allowlisted inline HTML. Existing Notes convert once (K9).

DEC6 [two-way]: keep cross-Canvas Note freshness as re-read-on-entry and explicit recovery, not a subscription protocol. Driver: local-first single-user scope and K8's optimistic revision contract. Trade-off: a second already-open Canvas can be stale until it re-enters or reloads; real-time synchronization requires a separately authorized collaboration boundary.

DEC7 [one-way]: make the per-Note FTS projection lazy and single-path. Canvas writes share one `applyCanvasTx` tx helper (generic updates + Note create/delete), and `canvas_note_search_meta` (migration 0030) tracks each Note's revision so `syncCanvasNotesTx` reindexes only stale Notes instead of rebuilding every row per search; placement changes invalidate via `InvalidateNotesInWorkspaceTx`. Driver: K8 derived projections, FL6 lazy search, and R8 single-write-owner; removes the duplicated canvas-update tx logic and the full note FTS rebuild on every query. Trade-off: one extra meta table and an invalidation hook; over-invalidation (shared Notes reindexed across workspaces) is accepted as correct-but-broader. Revisit if note counts stay small and the rebuild cost is unmeasured.

DEC8 [one-way]: reject `image/svg+xml` (and any `image/svg*`) at every asset ingress. New uploads/restores deny SVG (`NormalizeMimeType` is shared by upload, store, and restore) so untrusted SVG never executes inline on the same origin; any pre-DEC8 stored non-image or SVG asset remains readable only behind download isolation (`Content-Security-Policy: sandbox`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`). Driver: secure-default ingress and non-destructive upgrade compatibility. Trade-off: no new user-uploaded SVG in asset storage; icons (validated from the eraser source and served separately) remain unaffected.

DEC9 [one-way]: classify Canvas Note write errors at the Store boundary instead of mapping every failure to conflict. `normalizeNoteWriteError` turns only SQLite constraint codes (UNIQUE/PRIMARYKEY/FOREIGNKEY) into `note.ErrConflict` (409) and wraps everything else as an infrastructure error (500). Driver: accurate error semantics, reliability and observability. Trade-off: a non-constraint database fault no longer masquerades as a user-facing conflict.

## Fitness rules

F1: Web module placement and dependency direction | `notespace/web-boundaries` in `eslint.config.mjs` | `bun run lint` checks imports, re-exports, and dynamic imports.
F2: `entities/` and every `model/` folder are independent of React, browser, HTTP, editor, Excalidraw and desktop packages | web boundary and restricted-global rules | `bun run lint`.
F3: Modules compose through `app`; native SDK access stays in `platform/desktop` and `platform/runtime` | web boundary rule | `bun run lint`.
F4: Server `internal/` keeps exact 4 tiers (`app`, `httpapi`, `domain`, `infra`) and enforces strict one-way DAG (`app → httpapi → {domain, infra/store}`, `infra → domain`, `domain` free of `sql`/`http`, `infra/sqlite` free of `domain`/`http`) | `tests/architecture_test.go` AST checks | enforced in Go tests; exception requires D#.
F5: Canvas Note authoring is only through Canvas; the retired rich document is read only by `domain/legacynote` from the 0033 hook and backup import | source/route contract tests, migration and archive-import tests | CI | pass when Canvas ownership checks and the K9 conversion tests remain green.
F6: Generated/bundled output is excluded from architecture analysis | `.gitignore`/index scope plus source-only checks | CI | never use `target-codex-check`, `dist`, or generated assets as design evidence.

F7: Module outsiders use its public entry, internals import directly, and `CanvasEditor` stays lazy via dynamic import | `notespace/web-boundaries` in `eslint.config.mjs` | `bun run lint`.
F8: Subpackage boundaries hold across `httpapi/{middleware,transport,handler}`, `infra/store/paging`, `domain/archive`, `infra/sqlite`, and `infra/eraser`; pure domain/archive/paging packages never import `database/sql`, and `httpapi` never touches SQL, SQLite, or Eraser directly | `tests/architecture_test.go` + mid-write rollback proof | `go test -race ./...`.
F9: Nested browser suites remain discovered exactly once; configured script entries exist | `scripts/verify/browser-discovery.test.mjs`, recursive all/critical/file selection | `node --test scripts/verify/browser-discovery.test.mjs`.
F10: Web UI tokens (`bg-surface`, `no-scrollbar`, `z-[var(--z-*)]`) and single persistent shell ownership (`LibraryPageShell` only in `PersistentAppShell`) | `notespace/ui-tokens` & `notespace/web-boundaries` in `eslint.config.mjs` | `bun run lint`.

## Debt and risks

D1: Historical SQLite table name `projects` remains for Workspace rows | avoids destructive table rename with no product payoff | pay only with measured migration benefit | migrations owner.

Risks/trade-offs: (1) one SQLite boundary limits future independent scaling; (2) third-party Canvas state is complex, so browser/native proof must remain focused on durable behavior rather than implementation details.

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
- Web boundary: `bun run typecheck`, `bun run lint`, `bun run test`, then the affected WebdriverIO critical journey when a user flow changes.
- Server boundary: `gofmt`, `go vet ./...`, focused tests, and `go test -race ./...`   when concurrency or persistence semantics change.
- Persistence/migration: real SQLite integration tests and server-process   restart smoke; never fake transaction semantics.
- Desktop boundary: prepare sidecar, lifecycle smoke, `cargo check --no-default-features`,   and native WebDriver only when the matching Windows driver is available.
- Release evidence, versioning and publication remain owned by   `release-engineering`; this file does not claim deployed/released state.

Stop when the requested owner/boundary is explicit, its invariant has a proof, and the relevant checks are green. Do not reorganize for symmetry alone.
