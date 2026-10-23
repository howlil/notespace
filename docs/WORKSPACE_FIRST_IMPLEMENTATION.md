# Workspace-first product contract and implementation plan

**Status:** M0 baseline / planned behavior, **not yet implemented**. This document is not a description of the current runtime. `DESIGN.md` and `docs/ARCHITECTURE.md` continue to describe the shipped shell/domain until the relevant slices land.

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

### M6 — Accessible unified navigation

`A`: Library/Today/Queue destinations in labeled nav → category disclosure independent of navigation → category/workspace route → separate 40px authoring WorkspaceRail. One global search and create action, no duplicate overlays.

`E`: invalid/deleted route IDs, loading and page errors, failure on workspace create/move. Do not discard draft or silently navigate.

`R`: existing LibraryPageShell + ShellRail + LibrarySidebar + root utility providers. Update explicit DESIGN contract and existing design tests in the same change.

Proof: keyboard and screen-reader semantics, category expansion state, focus return, desktop/mobile, Back/Forward preserving Recent/All selection.

### M7 — Integrated acceptance and rollback

Verify actual SQLite migration and backup archives (including legacy JSON/ZIP), queue retention, Trash, Activity history/recovery, Today projection, Search, versioned mutation races, accessibility, native desktop startup/restart and rollback documentation.

**Do not claim** end-to-end acceptance solely from component tests or static review.

## M0 verification and handoff

Run:

```sh
python3 -m unittest discover -s scripts -p 'test_workspace_first_baseline.py' -v
python3 scripts/workspace_first_baseline.py /path/to/notespace.db
```

Record the aggregate baseline outside the repository; never commit a personal database, task title, note content, session title, or other user-owned data.

Before M1: decide CaptureItem retention policy after conversion, idempotency identity and status endpoint; determine backup manifest versioning so old restore data remains readable. These are explicit unresolved implementation edges, not permissions to skip safety checks.
