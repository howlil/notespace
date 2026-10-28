# Workspace border-only — current navigation contract
Status: Notespace Navigation v8 implementation (Issue #173). Supersedes the October 20 pre-v8 Plan/header description.

## Render graph

```text
WorkspacePage
 ├─ Web: WorkspaceRail (40px) → Back, Canvas / Note / Split, Activity, Focus
 ├─ Desktop custom chrome: titlebar → Back + live Workspace title, centered Search
 │   └─ WorkspaceRail → Canvas / Note / Split, Activity, Focus (no duplicate Back)
 └─ WorkspaceAuthoring → PaneNode tree
     ├─ CanvasEditor → Excalidraw Canvas + anchored tools
     ├─ DocumentEditor → Tiptap Note(s) + picker, find/outline
     └─ Split → bounded resizable panes, pointer + keyboard
         └─ autosave → saved | saving | unsaved | error | conflict
```

There is **no Plan mode or WorkspacePlan UI**. Task/Milestone API and SQLite records are retained for backward compatibility, import/export, recovery, and historical data access; this document does not authorize destructive schema cleanup.

## Interaction and ownership

- The Workspace rail is 40px and full-height on Web; native desktop uses the existing titlebar for Back and current Workspace title, avoiding a duplicate Back control.
- Canvas, Note and Split remain the only view options. Focus hides the rail; Restore layout returns to the prior authoring view.
- Split pointer dragging and keyboard arrows use the existing bounded `resizeSplit` operation (7px hit target, 1px visible border); no new persistence owner.
- Note create/rename/select, Tiptap editing, Canvas changes and conflicts use existing Workspace sessions and autosave. Never report a save as complete before acknowledgement.
- Activity controls are contextual to the Workspace rail. The global runtime still owns active-session persistence/recovery; do not strand running sessions when changing shell visibility.
- Theme, search, Settings and backup/restore retain their existing feature owners. This change does not alter SQLite tables, server planning API, or transport.

## Regression evidence required

1. `tests/workspace/rail.spec.ts`: one rail, three authoring views, contextual Activity and Focus/Restore.
2. `tests/workspace/border-only.spec.ts`, `tests/workspace/layout.spec.ts`, `tests/workspace/m5-visual-acceptance.spec.ts`: geometry, split keyboard and responsive overflow.
3. `tests/planning.spec.ts` and `tests/today-projection.spec.ts`: real server persistence and retrieval of historical Task/Milestone data without Plan UI.
4. `tests/workspace/recovery.spec.ts`: autosave conflict and retry.
5. `scripts/desktop-webdriver-smoke.mjs`: Tauri titlebar Back, live title, centered Search and native lifecycle. Attribute actual results to exact-head GitHub CI, not this contract.

Scope: `apps/web` Workspace UI; no speculative new domain, service, or migration.
