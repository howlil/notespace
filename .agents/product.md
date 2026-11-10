# Product

## Desktop

### Problem

Actor: an existing or new Notespace user who wants to use Notespace as a normal desktop application.

Trigger: the user wants to start or resume focused work without opening a browser or manually operating the local server.

Problem: the desktop runtime now launches the existing Notespace product correctly, but the user-facing loop is incomplete around first-run data continuity, closing with pending edits, and recovering from a local runtime failure.

Desired outcome: opening Notespace Desktop should reliably lead to the same Notespace workspace, preserve local work across close/reopen, and recover from runtime problems without requiring terminal knowledge.

### Behavior

```text
Desktop not running
  ↓ open Notespace
Starting local workspace
  ├─ runtime ready
  │    ↓
  │  existing Notespace UI
  │    ├─ local library exists → resume normally
  │    └─ local library empty
  │          ├─ start fresh → create first Workspace
  │          └─ existing user → restore full-library backup
  │
  └─ runtime unavailable
       ↓
     recoverable failure
       ├─ Retry → attempt startup again
       └─ Details → expose diagnostic information without requiring it for normal use

Editing
  ↓ close application
save pending?
  ├─ no  → close
  └─ yes → complete the save or keep the application open with a clear unsaved state
             ↓
           close only when the user's work is safe

Reopen
  ↓
previously persisted library and latest saved edits are present
```

Opening Notespace while it is already running must focus the existing desktop window instead of creating a second independent local runtime.

### Constraints

- Desktop is another way to run the same Notespace product, not a second product implementation.
- Keep the existing web interface and product behavior shared between browser and desktop.
- Desktop owns one local library in its application-data location.
- Existing self-hosted data is not silently adopted or copied; portability uses the existing full-library backup/restore behavior.
- The user must not need to know about localhost, ports, sidecars, or server processes during normal use or recovery.
- SQLite remains the durable source of truth; desktop-specific state must not become a parallel product store.
- Native desktop capabilities are added only when an existing browser behavior is proven insufficient on a supported desktop platform.

### Scope

In:
- normal launch into the existing Notespace UI;
- explicit first-empty-library path to either start fresh or restore an existing Notespace backup;
- safe close/reopen behavior for authored edits;
- recoverable startup/runtime failure with Retry and optional diagnostics;
- single-instance behavior;
- local operation without manually starting a server.

Out:
- tray behavior;
- global shortcuts;
- multi-window Notespace;
- native editor or duplicate desktop navigation;
- notifications;
- cloud sync or cross-device collaboration;
- desktop-specific product features that do not close the core desktop job.

### Proof

- Given a fresh desktop library, when Notespace opens, then the user can clearly choose to create their first Workspace or restore a full-library backup.
- Given an existing backup, when the user restores it in Desktop, then the restored library becomes the current local Notespace library and remains present after reopening the app.
- Given an edited Canvas with a pending save, when the user immediately closes Notespace, then the app either completes the save before exit or clearly prevents exit while the work remains unsaved.
- Given saved authored content, when Notespace is closed and reopened, then the same content is present.
- Given the local runtime cannot start or stops unexpectedly, when the failure state appears, then the user can retry from the app without using a terminal or manually starting the server.
- Given Notespace is already running, when it is opened again, then the existing window is focused and no second independent runtime is created.
- Given the machine has no network connection after installation, when Notespace Desktop starts, then the core local library and authoring loop remain usable.

## Workspace navigation and creation

J1: When moving between Canvas workspaces, find my work and start a new Canvas
without losing my place or wondering which Workspace is open.

- B1 (#198): The persistent Fox links Home independently of a separate Explorer
  toggle. Explorer contains Categories/Workspaces only; category name and chevron
  disclose without navigation. View category explicitly opens its collection.
- B2: Explorer creation always targets the chosen category, including legacy
  Uncategorized; New category is a separate labelled action. Home retains its
  existing creation/first-run workflows and category/direct Workspace links.
- B3: Workspace switches preserve loaded Explorer rows and disclosure state.
  Current authored content still loads from the server, with existing save barriers.
- B4: The current Workspace name remains visible in the shared titlebar. Save
  status remains accessible, and failures expose the existing visible recovery.
  Direct entry reveals its category and keeps the active Workspace reachable,
  even when it is outside the five-item preview.
- X1: Creation failure keeps the name for retry; pending creation disables repeat
  submission/cancellation. Category load failure retains existing rows and Retry.
- X-EXPLORER: Collapse preserves mounted create/rename drafts and in-flight dedupe.
  Dirty Canvas → Fox waits for the existing save barrier; failures retain recovery.
- C1: Preserve Canvas-only behavior, neutral categories and Workspace-only active
  tint. Dock preference is session-only auto/open/closed; the mobile drawer is
  transient and never overwrites it. Reload returns to responsive auto. No new
  persistence, favorites, recents, hierarchy or search subsystem.
- P1 (B1-B2): The existing Library journey creates a category, creates a Workspace
  through its category-targeted action, opens the resulting Canvas and retains it
  on reload. Shell journeys prove persistent Fox, independent toggle, disclosure,
  explicit category routing, drawer dismissal and wide/narrow preference retention.
- P2 (B3-B4): The navigation journey opens a Workspace directly, switches siblings
  without refetching cached Explorer rows, shows identity in the titlebar and
  survives reload without floating identity chrome over the Canvas.
- P3 (X1): The Library journey simulates creation and category-read failures,
  preserves the draft/list across collapse and successfully retries without duplicate
  creation. Canvas persistence proves Fox navigation waits for save and retains failure recovery.
- A1: Pain points are inferred from source, prior user reports and comparative
  product documentation; they are not findings from user interviews.

## Canvas tool and selection interaction

J2: Draw and edit Canvas objects while understanding what each control changes.

- B5: Tool defaults are anchored beside the active tool; selected-object actions
  sit above the selection. Idle Select shows no property toolbar.
- B6: Batch properties show shared values or Mixed, retain supported controls
  for multiple objects of one type, and patch only supported fields per object.
- B7: Manipulation temporarily hides controls without recreating the toolbar.
  Popups stay anchored and contained; Escape closes one popup and retains selection.
- B8: More contains actions omitted from the three quick controls. Native context
  menus and shortcuts remain alternate entries to the same command execution.
- X2: Changing the tool or selected identities invalidates an open popup;
  unavailable commands do not offer misleading no-op entries.
- P4 (B5,B7,X2): The toolbar journey checks active-tool alignment, popup geometry,
  drag continuity, Escape, focus and context-menu dismissal.
- P5 (B6,B8): Selection tests and the property-editing journey prove Mixed,
  batch pressure/corners, nonduplicated overflow, fallback properties and Undo/Redo.

## Canvas Note Card (#203)

J3: While working on a spatial Canvas, capture and reuse written knowledge without leaving the Canvas.

- B9: Activating Note creates one blank, visible Canvas card and focuses writing immediately. A single click selects; double-click edits; Escape exits editing; drag/resize changes only instance geometry.
- B10: Note content is shared by stable identity across Canvas instances; removing an instance preserves the Note. Content changes save independently from Canvas geometry and remain recoverable across reload/close.
- X3: A stale content revision or failed save preserves the local draft and exposes retry/recovery; failed create+place leaves neither an orphan Note nor an unreferenced Canvas instance.
- C2: Canvas remains the only authoring surface. The card has no title field, icon, cover, header/footer, or persistent toolbar. Historical Note DTOs/migrations remain compatibility data and are not reused as canonical storage.
- P6 (B9-B10): Create, type, close/reload, move/resize, duplicate/remove instance and undo preserve the expected content/geometry and focus behavior.
- P7 (X3): Conflicting and failed writes retain the draft; retry is safe and atomic; backup/restore round-trips Notes and typed Canvas references.

## Canvas Code Module (#199)

J-CODE-01: Edit and execute existing Canvas Code Blocks through one predictable toolbar without risking authored source.
- B-CODE-01: One headerless/footerless card and one single-selection toolbar: Language, Output, Run/Stop, Copy, More.
- B-CODE-02: Searchable canonical languages plus Auto; explicit language locks detection and never replaces source.
- B-CODE-03: More retains theme, line numbers, UI-local wrap, auto height, native duplicate and delete.
- B-CODE-04: Output is inside Main, split by rendered card width or stacked; Run reveals it automatically.
- B-CODE-05: Native Excalidraw geometry and undo remain authoritative; output does not change geometry or schema v1.
- B-CODE-06: Toolbar remains while editing source; manipulation/native context menu suppresses it. Mixed selection uses generic actions.
- B-CODE-07: JavaScript uses the bounded Worker. Other languages are source-only; HTML preview stays disabled without browser and WebView2 security proof.
- B-CODE-08: Output/menu/wrap/runtime state is ephemeral; snapshots, copies and PNG/SVG exports contain authored source only.
- X-CODE-01: Stop, timeout, error and truncation are output content; stale source/language/deleted-block results are invalidated and workers terminated.
- X-CODE-02: Escape closes a popup first, then exits editing retaining selection; toolbar interaction must preserve editing and source.
- P-CODE-01 (B-CODE-01,06,X-CODE-02): Existing Canvas toolbar journey proves one toolbar, focus/selection, output toggle and no header.
- P-CODE-02 (B-CODE-02,03): Language unit tests and toolbar journey prove preserved source, Auto/locked language and secondary actions.
- P-CODE-03 (B-CODE-04,05,08): Layout/scene/export tests and toolbar journey prove responsive output and headerless source-only export.
- P-CODE-04 (B-CODE-07,X-CODE-01): Runner tests and browser isolation journey prove bounded execution, cancellation and stale-source fencing.
- P-CODE-05 (B-CODE-07): Existing HTML-source journey proves disabled preview and preserved source; enabling preview requires separate browser + native isolation evidence.

## Workspace library pagination

### Problem and outcome

Browsing a large Workspace library should not repeat or omit entries when Canvas autosave or another library mutation changes the sort order while the user navigates pages.

### Behavior

- Opening a paged All Workspaces or Category view creates a snapshot of the current matching Workspace summaries in the selected order.
- Next and Previous use that same frozen list; changes made after the first page do not reorder it or change its membership.
- Reloading, refreshing, changing the search/filter/sort, or returning to the first page starts a new traversal with current data.
- A snapshot that expires or is evicted restarts at page one; no partial old/new traversal is presented as continuous.
- Recent workspaces remains a live view; opening an individual Workspace always fetches current authored data.
- Deleted Workspaces may appear in an older listing snapshot until refreshed; opening one follows the existing not-found handling.

### Proof

- A paged traversal shows the exact initial set of Workspace identities once, in order, despite a later autosave, rename, move, create, or delete.
- Workspace sorts honor their order at snapshot creation.
- Refresh returns up-to-date membership. Old offset-only API consumers remain compatible.
