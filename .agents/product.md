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
- Given an edited Note or Canvas with a pending save, when the user immediately closes Notespace, then the app either completes the save before exit or clearly prevents exit while the work remains unsaved.
- Given saved authored content, when Notespace is closed and reopened, then the same content is present.
- Given the local runtime cannot start or stops unexpectedly, when the failure state appears, then the user can retry from the app without using a terminal or manually starting the server.
- Given Notespace is already running, when it is opened again, then the existing window is focused and no second independent runtime is created.
- Given the machine has no network connection after installation, when Notespace Desktop starts, then the core local library and authoring loop remain usable.
