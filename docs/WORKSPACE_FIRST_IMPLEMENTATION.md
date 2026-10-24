# Workspace-first product contract and implementation plan

**Status:** M0–M6 implemented on a feature branch; M7 persistence acceptance and rollback documentation added, but latest-head CI and native desktop acceptance are **not yet verified**. **Not shipped or merged.** This document is not a description of the current runtime. `DESIGN.md` and `docs/ARCHITECTURE.md` continue to describe the shipped shell/domain until the relevant slices land.

## Intent, non-goals, and compatibility

Notespace remains a self-hosted knowledge workspace. A Workspace represents one coherent topic or mental model. The requested evolution reduces permanent standalone work and makes ownership clear without imposing milestones or creating a generic project-management application.

Target behavior (Model B / Workspace-first with Capture Queue):

1. Every newly organized Note, Task, Milestone and Activity Session is associated with **one** Workspace. A Task may have no Milestone. A Session may have no Task.
2. A durable, temporary **CaptureItem** may exist without a Workspace. It is an unorganized thought, **not** a standalone PlanningTask or Note. Once organized, it becomes a Note or Task owned by a selected Workspace.
3. **Today** remains a cross-workspace query over the existing task records, including carry-forward semantics, rather than a second task store.
4. Global Search, Activity Dock, Quick Capture trigger, Settings, backup/restore, and Trash remain globally accessible. Ownership does not imply hiding tools inside the Workspace editor.
5. Existing standalone Tasks, completed Tasks, Activity history and pending Activity finalizations must survive migration and remain readable. Do not automatically assign them to invented Workspaces or silently delete them.
6. Preserve the existing authoring shell (WorkspaceRail/Note/Canvas/Split/Plan), Note/Canvas versioning, workspace trash/recovery, responsive desktop chrome and root-mounted utility providers.
7. No new standalone Tasks/Activity after the new server contract is enabled. Existing data follows an explicit compatibility/migration path.

Non-goals: multi-tenancy, billing, a new Activity engine, a new editor/persistence layer, duplicating Tasks in Today, or replacing the SQLite source of truth.

## Milestone dependencies

```text
M0 Baseline / decision record
  ↓
M1 Capture DB + API (atomic conversion)
  ↓
M2 Capture Queue UI + Quick Capture
  ↓
M3 Unified Task composer + legacy Task assignment
  ├─→ M4 Today projection UI
  └─→ M5 Activity start context and recovery
               ↓
M6 Navigation shell consolidation (after M4/M5)
  ↓
M7 End-to-end, backup/migration, desktop and accessibility acceptance
```

Each slice needs its own tests and diff review; M7 does not substitute for local verification. No early removal of the old Inbox route or standalone API path.

## Design Thinking implementation graphs

### M0 — Baseline and contractual safety (this branch)

Shapes:
- `LegacyTask{ id, workspaceId?: string, plannedFor?, completedAt?, version }`
- `ActivitySegment{ workspaceId: string | '', taskId, logicalSessionId }`
- `WorkspaceFirstBaseline{ workspaces, tasks{owned, standalone inbox/open scheduled/completed}, activityRows{without/missing workspace}, captureTablePresent }`

`A` successful graph:

```text
read-only SQLite path
  → connect mode=ro + PRAGMA query_only
  → begin one consistent SQLite read snapshot
  → verify existing projects/planning_tasks/activity_sessions tables
  → count aggregate ownership classes
  → emit JSON to stdout without Note/Task titles or content
```

`E` expected failures: database missing/inaccessible, schema not migrated to required tables, SQLite I/O/lock errors. Return nonzero with explanatory stderr; **never** repair/create/migrate the database during baseline inventory.

`R` contextual capabilities: Python standard-library SQLite connection to an existing database file. No network, no API token, no service account, no background job. Close the connection on exit.

Proof: runnable `python3 -m unittest discover -s scripts -p 'test_workspace_first_baseline.py'`. Run the inventory against an explicitly provided local database path using `python3 scripts/workspace_first_baseline.py /path/to/notespace.db`. Never include the real database in a PR.

**M0 gate:** confirm all legacy ownership classes are observable and can be planned for; target contract is marked future-facing and does not misrepresent shipped behavior.

### M1 — Capture persistence and idempotent conversion

Shapes:
- `CaptureItem{ id, content, version, status: pending|converted, createdAt, updatedAt, targetKind?, targetId?, convertedAt? }`
- `OrganizeCapture{ captureId, expectedVersion, workspaceId, target: note|task }`
- `ConversionOutcome{ captureId, targetKind, targetId }`

`A`: decode HTTP request → validate Capture and Workspace → begin one SQLite transaction → verify optimistic version → create destination through the owning Note/Planning persistence logic → persist conversion identity and state → commit → return outcome. Repeat calls with same conversion identity return the prior authoritative outcome, not duplicate Note/Task creation.

`E`: invalid content/destination, stale version, removed Workspace, conflicting retry payload, DB failure before commit, unknown response after commit. Keep Capture pending for pre-commit errors. Support explicit status reconciliation for unknown result. No client-side delete-then-create.

`R`: capture repository/store, existing Workspace/Note/Planning transaction access, SQLite transaction, clock. Do not create a separate database client per repository just to perform this transaction.

Minimum proof: SQLite integration tests for create/list/edit/delete, atomic rollback, simultaneous organizer calls, stale versions, retry after committed-but-lost response, target referential integrity. Run against real SQLite, not a mock transaction.

### M2 — Queue interface and Quick Capture

Surfaces `C,V,N`:
- **Capture composer**: text/Markdown file, Workspace picker or Queue destination; dirty/saving/failed/saved; nonempty text.
- **Capture Queue**: pending items + organize/edit/delete; empty/loading/error/processing; loaded item and usable API.
- **Organize dialog**: target Workspace and Note/Task; no selection/submitting/conflict/success; valid Capture + Workspace.

`A`: Quick Capture → selected Workspace? create Note through existing API : create CaptureItem → Queue → Organize → use M1 atomic conversion → navigate/focus outcome.

`E`: preserve draft on failed save, show explicit retry after conflict; unknown success requires server reconciliation. Empty Workspace library must still allow queuing captures.

`R`: root QuickCapture provider and HTTP capture adapter; existing dialog/focus utilities. Do not mount a duplicate QuickCapture into pages.

Proof: keyboard-only flow, error-preserved Markdown, Queue → Task and Queue → Note, refresh and delayed responses. Do not replace legacy Inbox data prematurely.

### M3 — Workspace-owned Task creation and legacy assignment

`A`: Global/Today/Workspace Plan create → shared Task composer → resolve Workspace (preselected in authoring; explicit picker globally) → existing `POST /api/workspaces/{id}/tasks` → optional set `plannedFor` via existing versioned update → Plan/Today refresh. Ensure create + schedule failure is reconciled; consider a single server command if two-step scheduling cannot meet correctness.

Legacy: add explicit `assign workspace` command that **moves** existing `planning_tasks.id` to a selected Workspace, checks version and Workspace existence, updates position/milestone ownership in one transaction. Preserve Task identity and Activity handoff references. No duplicate/copy-and-delete.

`E`: missing Workspace, missing Task, stale version, Task deleted while selecting destination, partial create/schedule, network uncertainty. No silent auto-assignment.

Proof: ID and version behavior, task counts before/after assignment, old Inbox/Today retrieval during rollout, completed Tasks remain accessible.

### M4 — Today remains a projection

`A`: existing cross-workspace SQL Today query → Task row with source Workspace → optimistic or refetched versioned update → persisted Plan Task → Today projection. Preserve old carried-forward task behavior.

`E`: out-of-order requests, 409 stale version, success-then-network-error; refetch authoritative state before declaring failure. Render legacy Task metadata until explicit migration.

Proof: Today↔Plan consistency, plan/remove/complete, reload/back navigation, concurrency with Activity handoff.

### M5 — Activity context and recovery

`A`: Start from Workspace: derive Workspace; from Task: derive Workspace from authoritative Task; from global: require Workspace picker → existing Activity lease and heartbeat runtime → global Dock → end → finalize → linked Task handoff.

`E`: second-tab lease blocked, Workspace removed while active, offline heartbeat, finalized server write with failed response, stale Task version. Keep existing finalization/recovery queue and historic standalone sessions, without falsifying historic Workspace attribution.

Proof: cross-tab lock, pause/resume and day boundaries, cross-route continuation, restart recovery, no new Workspace-less session, legacy record display and deletion.

## M6 implementation — navigation and interaction graph

**Shapes:** `ShellDestination = library | today | queue`, `ExplorerState = auto | open | closed`, `CategoryExpansion`, `CaptureQueueState = loading | empty | error | ready`, `WorkspaceOptionLabel`.

**A:** route (`/`, `/today`, `/inbox`) → shared `LibraryPageShell` → compact `ShellRail` shortcuts + labeled `LibrarySidebar` links → category disclosure (no navigation side effect) → explicit category title selection → Library category route → Workspace authoring uses existing 40px rail. Create owns one Quick Capture trigger with explicit destination inside its dialog. Explorer open/closed survives shared-shell navigation.

**E:** failed category fetch shows local retry without collapsing; Capture Queue initial fetch does not pretend an empty queue, error retains explicit Refresh; stale list responses cannot replace newer mutations; empty Workspace pickers explain why destination-dependent Save/Start is disabled; duplicate names show disambiguating ID prefixes; narrow-screen dismissal returns focus to trigger.

**R / scope:** only existing `ShellRail`, `LibraryPageShell`, `LibrarySidebar`, library-navigation feature hook, Capture Queue and Workspace destination UI. Root utilities and Workspace authoring are not duplicated or remounted; no new persistence layer, routes or schema.

**Proof:** pure Workspace option identity test; Playwright labeled route links, independent category disclosure/selection, Queue loading/error/empty; updated global Create and legacy Inbox E2E, existing mobile keyboard, Today/Activity/desktop tests. M7 remains the cross-subsystem acceptance/rollback milestone.

### M6 — Accessible unified navigation

`A`: Library/Today/Queue destinations in labeled nav → category disclosure independent of navigation → category/workspace route → separate 40px authoring WorkspaceRail. One global search and create action, no duplicate overlays.

`E`: invalid/deleted route IDs, loading and page errors, failure on workspace create/move. Do not discard draft or silently navigate.

`R`: existing LibraryPageShell + ShellRail + LibrarySidebar + root utility providers. Update explicit DESIGN contract and existing design tests in the same change.

Proof: keyboard and screen-reader semantics, category expansion state, focus return, desktop/mobile, Back/Forward preserving Recent/All selection.

### M7 — Integrated acceptance and rollback

Verify actual SQLite migration and backup archives (including legacy JSON/ZIP), queue retention, Trash, Activity history/recovery, Today projection, Search, versioned mutation races, accessibility, native desktop startup/restart and rollback documentation.

**Do not claim** end-to-end acceptance solely from component tests or static review.

### M7 implementation — operational proof and rollback

**Shapes:** `Snapshot{SQLite database + WAL/SHM + assets}`, `DurabilityProbe{workspaceId, taskId, captureId, activitySessionId, date}`, `AcceptanceEvidence{commitSHA, verifyRun, desktopRun, failedChecks}`.

**A:** write disposable Workspace/Note/Canvas + owned Task + pending Capture + completed Activity → restart the Docker Compose server over the existing persistent volume → reread the exact Note/Canvas snapshot and authoritative Task/Plan/Today, Capture Queue and Activity history → clean up only the created fixtures (including Trash). Independent SQLite/HTTP tests exercise atomic Capture conversion, converted receipts, legacy JSON, archive ZIP and invalid restore.

**E:** a restart can fail readiness, a resource can disappear/change identity, an HTTP response can fail after commit, a corrupted archive can be rejected, an older build can reject schema-15 ZIP, or an operator can lose post-snapshot writes on rollback. Stop the release on any missing acceptance evidence. Never validate rollback destructively on live data.

**R:** reuse `scripts/smoke-persistence.py` under the existing Compose CI step, `Verify Desktop` for native gates, and the tested SQLite restore code. No alternative production state store or new migration.

**Runbook:** `docs/WORKSPACE_FIRST_ROLLBACK.md` contains the acceptance matrix, offline whole-volume snapshot, immutable pre-upgrade deployment requirement, isolated new-volume rollback and desktop recovery caveats.

**Gate:** distinguish committed acceptance instrumentation from passing evidence. M7 cannot be marked accepted until **Verify** and **Verify Desktop** complete successfully on the same final HEAD and the changes pass a final review.


## M1 backend implementation contract (branch)

The M1 backend is additive; existing Inbox, standalone Task HTTP commands, Quick Capture UI, and Activity behavior remain untouched until later milestones.

Endpoints:

```text
GET    /api/captures                    list pending only
POST   /api/captures                    {content}
GET    /api/captures/{captureId}        read pending or converted receipt
PATCH  /api/captures/{captureId}        {version, content}
DELETE /api/captures/{captureId}        If-Match: "<version>"
POST   /api/captures/{captureId}/organize
                                       {version, workspaceId, kind: "note"|"task"}
```

Successful conversion is serialized within one SQLite transaction: read Capture → validate optimistic version and destination Workspace → create Note/Task with existing table semantics → mark Capture converted and persist target identity → commit. Retrying the original request after a lost response reads the existing receipt and returns its target ID; altered conversion parameters or versions conflict. The converted Capture is deliberately retained as an idempotency receipt, including its original content, in backup/restore. The retention/compaction strategy is deferred until real volume data justifies it.

For Task conversion the first nonempty line provides the title and the original full text is retained as the Task description, within the existing 4,000-rune description limit. Oversized input remains pending with an actionable error. For Note conversion the full original text is persisted in text paragraphs in a Tiptap snapshot; rich Markdown interpretation is **not implemented in M1**, and must be reconciled against the browser's `markdownToSnapshot` behavior before enabling the M2 Organize-as-Note UI. Conversion never discards a pending Capture on failure.

Backup archive schema version advances to 15, and JSON backup version to 2; legacy JSON v1 and earlier archive schema versions remain readable. Both pending Captures and converted receipts round-trip through backup and restore. Old builds should reject new backup versions instead of silently dropping new data.

Focused Go tests exercise CRUD/version conflicts, atomic convert-to-Task and convert-to-Note, duplicate request handling, concurrent same-request conversion, invalid receipt rejection, and archive/legacy-JSON restoration. The full Go race/build/test verification remains governed by CI.


## M5 implemented — Activity Workspace ownership, recovery compatibility

**Shapes:** `ActivityStart { title, activityType, workspaceId, workspaceTitleSnapshot, taskId?, taskTitleSnapshot? }` for new starts, `ManualActivitySession` with optional Workspace on historical recovery only, `PendingActivityFinalization` unchanged.

**A — fresh start and recovery graphs:**

```text
Today Quick Activity → select Workspace from paginated existing Workspace API
                     → verify Workspace still exists via GET
                     → ActivityRuntime.start → useActivitySession.start → single browser lease
                     → durable local active session → idempotent heartbeat → global dock
Today Task Activity → read latest Task → require Task Workspace and incomplete Task
                    → verify referenced Workspace → same ActivityRuntime.start
Workspace rail/global rail Activity → verify Workspace → same ActivityRuntime.start
End → durable outbox → PUT finish/retry → Activity session receipt
    → optional Task completion handoff (same taskId)
Restore legacy unowned session → existing storage decoder + lease + heartbeat recovery
                              → continue/pause/end without injecting fictitious Workspace
Historic unowned Activity DB rows → unchanged read APIs, stats, daily details and exports
```

**E:** no Workspace selected disables fresh start; missing or stale Workspace blocks start without discarding input; missing, completed or legacy unowned Task cannot initiate new Task-linked Activity; errors show a toast and permit explicit retry. Storage/lease/heartbeat failures use existing recovery policy, not a new parallel outbox. Historic queued heartbeats with no owner stay replayable, so backend heartbeat compatibility is retained intentionally.

**R & boundary:** Activity runtime/session hook enforce Workspace required for **fresh** session creation; Workspace picker uses existing paginated API; GET verifies a live Workspace at button action; server reference resolution remains authoritative for Task/Workspace identity. No new SQLite migration, Activity store, timer implementation, or session storage key.

**Proof:** Today Quick Activity requires Workspace and persists owner, global cross-route timer remains durable, Task activity preserves Task ID and Workspace, legacy recovery and no-workspace database rows remain readable; heartbeat response-loss, offline finalization and multiple-tab lease tests remain active.

## M4 implemented — Today projection hardening

**Shapes:** `TaskMutationOutcome = confirmed(task,reconciled) | conflict(task) | missing | unknown`, `TaskPatch`, `PlanningTask(version)`, `TodayProjection(date,tasks)`. No new Task table or local persistence.

**A:** UI Task edit → one versioned Planning API PATCH → response authoritative Task → update existing Today/Plan projection with version guard → emit in-memory Planning invalidation event → mounted sibling projection queries SQLite-backed HTTP API. On navigation or visibility resume, Today fetches the authoritative projection.

**E:** when response fails after commit, GET Task by ID. If its version is exactly previous version + 1 and requested title/completion/planned date matches, treat as confirmed without a second PATCH. If version or values differ, report conflict and display latest state; if missing, remove stale UI entry; if GET fails, label outcome unknown and preserve the UI until a later refresh. Never blindly replay a write with an ambiguous outcome.

**R:** existing Planning service and SQLite task rows remain source of truth. The browser's `PLANNING_TASK_CHANGED_EVENT` only invalidates mounted Today and Plan; no second persistence store or background data worker.

**Execution:** per-Task in-flight guard blocks duplicate local updates; request sequence + mutation epoch rejects obsolete projection fetch responses. Workspace Plan retains current state during refresh. Back/Forward and tab visibility refresh requery the server.

**Verification:** pure reconciliation unit tests (success, response loss, conflict, missing, unknown); projection-version tests; Playwright tests for response lost after commit and Task consistency across two Workspaces; existing Activity handoff and carry-forward test suites. Full CI/desktop gates remain required before merge.

## M3 implemented — Task ownership and legacy assignment

**Shapes:** `PlanningTask {id, workspaceId?, milestoneId?, title, plannedFor?, completedAt?, version}`; `AssignLegacyTask {taskId, workspaceId, version}`.

**A — success graph:**

```text
Today new Task → shared TaskComposer (Workspace picker required)
              → POST /api/workspaces/{id}/tasks
                 {title, plannedFor: Today date}
              → one server create / one SQLite INSERT
              → refetch Today projection

Workspace Plan → same TaskComposer (Workspace preselected, milestone optional)
               → same Workspace task endpoint
               → update Plan

Legacy Inbox/Today Task → select destination Workspace
                        → POST /api/tasks/{taskId}/assign-workspace
                        → SELECT Task + Workspace/version/capacity validation in one SQLite transaction
                        → UPDATE original Task row (same ID, plannedFor, completedAt and description)
                        → reload projected view; Activity references remain attached to same task ID
```

**E — errors:** invalid Workspace/Date/Task; stale version; duplicate assignment; destination capacity; server commit with lost HTTP response. Retries with original version and same destination reconcile the already-owned Task when its version is exactly one greater; differing versions/ownership conflict. Task create does not auto-retry unknown outcomes, preserving the unsent draft and asking user to inspect the destination before manual retry.

**R — owners:** Planning service validates, SQLite Store owns atomic reassignment, HTTP adapter serializes contract, UI owns selection/focus only. Legacy Workspace-less tasks remain readable and editable, while new external create through `POST /api/tasks` requires `workspaceId` (compatibility route). Direct domain fixture creation of legacy tasks remains available for backup/migration regression tests, not normal user-facing creation.

**Preserved:** Task ID, description, createdAt, completedAt, plannedFor, taskId links from Activity, and existing Today carry-forward projection. Workspace Plan remains the single source of Task state; the Queue remains separate from Planning.

**Acceptance:** HTTP create rejects no-Workspace; Today composer selects Workspace; atomic planned date; repeated legacy assignment yields one Task; old Inbox and Today Tasks remain observable; Plan/Today reflect same Task; native desktop tests and historic backup import remain valid.

## M2 implemented transition (branch)

M2 introduces the Queue on the existing `/inbox` surface while **retaining** legacy InboxPlanning below it. The legacy task-create route and controls remain until the dedicated Workspace-owned Task migration in M3; this avoids silently hiding existing standalone Tasks or invalidating deep links. It is an explicit transitional UI, not the final M6 sitemap.

`C/V/N`:
- `CaptureQueue`: pending records / loading-empty-error-edit-organize/delete / backend reachable.
- `QuickCapture`: direct Workspace Note vs Queue intake / saving-success-unconfirmed / content valid; Workspace required only for direct Note.
- `Organize`: Note or Task destination / loading-conflict-confirmed-unconfirmed / selected live Workspace.

`A`:
```text
Global Quick Capture → destination?
  Workspace → existing markdownToSnapshot + existing Note API
  Queue     → POST /api/captures → /inbox Queue
Queue item → choose Workspace and target type
  Note → markdownToSnapshot(raw content) → transactional POST organize(document)
  Task → transactional POST organize (full text retained as description)
On unknown response → GET /api/captures/{id} → reconcile receipt
```

`E`: preserve unsaved text on failed global create; never auto-replay ambiguous POST create; preserve item/edit draft on conversion/patch error; reconcile committed organizer via receipt before reporting failure; keep legacy tasks visible; user can retry failed workspace list.

`R`: one root-mounted QuickCapture, typed `capture-api` adapter, single backend Capture table; no duplicated Queue persistence or new standalone Task pathway. For Notes, the server validates the same Tiptap snapshot shape as existing authored Note creation; the browser uses the existing Markdown importer and supplies its parsed snapshot to the same atomic SQLite conversion. Captured raw content remains stored as the converted receipt for idempotent recovery.

Verification: client adapter tests, UTF-8 byte-size tests, Playwright Queue CRUD/refresh and global shortcut flow, rich Markdown-to-Note E2E, Go race and backup tests, and the existing Inbox/Today/Quick Capture navigation regression suite.

## M0 verification and handoff

Run:

```sh
python3 -m unittest discover -s scripts -p 'test_workspace_first_baseline.py' -v
python3 scripts/workspace_first_baseline.py /path/to/notespace.db
```

Record the aggregate baseline outside the repository; never commit a personal database, task title, note content, session title, or other user-owned data.

Before M1: decide CaptureItem retention policy after conversion, idempotency identity and status endpoint; determine backup manifest versioning so old restore data remains readable. These are explicit unresolved implementation edges, not permissions to skip safety checks.
