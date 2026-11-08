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

- B1: All workspaces is a visible Explorer destination; category disclosure
  expands a list, while its name opens the category collection.
- B2: New workspace creates a named Workspace in the current category (or
  Uncategorized from All workspaces) and opens its Canvas after creation succeeds.
  New category stays a separate, explicitly labelled action.
- B3: Workspace switches preserve loaded Explorer rows and disclosure state.
  Current authored content still loads from the server, with existing save barriers.
- B4: The current Workspace name remains visible in the shared titlebar. Save
  status remains accessible, and failures expose the existing visible recovery.
  Direct entry reveals its category and keeps the active Workspace reachable,
  even when it is outside the five-item preview.
- X1: Creation failure keeps the name for retry; pending creation disables repeat
  submission/cancellation. Category load failure retains existing rows and Retry.
- C1: Preserve Canvas-only behavior, neutral categories and Workspace-only active
  tint. No new persistence, favorites, recents, hierarchy or search subsystem.
- P1 (B1-B2): The existing Library journey creates a category, creates a Workspace
  through its visible action, opens the resulting Canvas and retains it on reload.
- P2 (B3-B4): The navigation journey opens a Workspace directly, switches siblings
  without refetching cached Explorer rows, shows identity in the titlebar and
  survives reload without floating identity chrome over the Canvas.
- P3 (X1): The Library journey simulates creation and category-read failures,
  preserves the draft/list and successfully retries without duplicate creation.
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
