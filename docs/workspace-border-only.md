# Workspace border-only — implementation graph
Status: implementation contract · October 20, 2026
Scope: `apps/web` Workspace only. Preserve existing product behavior.

## Design Graph (Surface<C,V,N>)
```text
WorkspacePage
 ├─ Header: category/workspace switch; Canvas/Note/Split/Plan; activity; save; maximize; guide/settings
 │   ├─ select Canvas → Existing CanvasEditor + Excalidraw tools
 │   ├─ select Note → Existing DocumentEditor + Tiptap
 │   ├─ select Split → Existing PaneNode tree → Note(s) + trailing Canvas
 │   │                   └─ separator drag/keyboard → resizeSplit
 │   └─ select Plan → Existing WorkspacePlan (outside PaneNode tree)
 └─ status: saving | saved | unsaved | error | conflict
```

| Surface | C (content/actions) | V (rendered variants) | N (prerequisites) |
| --- | --- | --- | --- |
| Header | mode, rename, activity, save state, maximize | selected, saving, error, focus | workspace |
| Canvas | tools, elements, zoom, linked-note actions | selection, tool, empty/loaded | Canvas session |
| Note | note picker, Tiptap, code/find/outline | loading, editing, dirty, conflict | note identity |
| Split | 1..4 Note/Canvas panes, resize, close/maximize | horizontal/vertical, active, maximize | PaneNode + layout policy |
| Plan | milestone/task outline, edit, activity | loading, empty, error, completed | workspaceId + planning API |

### Important moves and interaction proof
- Select mode → existing `selectView` or `planOpen` → same authored state and action set.
- Split drag: pointerdown/capture → ratio delta → `resizeSplit` → bounded layout. Keyboard arrows move 0.05; visible focus on separator. Effective border is 1px while the hit target stays 7px.
- Note title/select/create → existing commands and note ID → Tiptap editor → existing autosave. Escape/cancel and menu dismissal unchanged.
- Canvas tool selection/context/linked note → existing Excalidraw session → existing updateCanvas. Toolbar remains reachable even on narrow widths through horizontal overflow.
- Plan task and milestone edit/complete/delete → existing planning API; no client-only duplicate state. Load/error/empty remain intelligible.
- Desktop header is portaled by `HeaderPlacement`; never introduce another header in the Workspace DOM.

## Design Thinking (Program<A,E,R>)
- **Shapes:** `Workspace`, `PaneNode`, `Pane`, `WorkspaceViewMode` (Canvas/Note/Split), `planOpen`, `activePaneId`, `focusMode`, persisted split `ratio`; no new domain shapes.
- **A success:** `WorkspacePage → useWorkspaceAuthoring → renderNode/renderPane → CanvasEditor | DocumentEditor → existing session update/save`. Plan branches to WorkspacePlan and its existing planning API.
- **Execution:** visual updates render synchronously. Preserve debounced saves and no new network requests; resizing remains pointer/keyboard driven, bounded by existing `updateSplit`.
- **E failures:** missing/failed editor and save conflicts keep existing ErrorBoundary, retry and toast; Canvas toolbar overflow, lost capture and clipped menu are presentation risks to verify. No silent save fallback.
- **R context:** React, TanStack Router, Tiptap, Excalidraw, semantic CSS tokens, desktop chrome. Avoid Effect, new services, new dependencies and persistence work.
- **Boundaries:** unchanged HTTP/domain/session decode, external ingress and egress. The redesign never mutates persisted Canvas or Note payload.
- **Policy/scope:** CSS classes scoped to owning Workspace surfaces; popup anchors and focus semantics stay valid; preserve existing listener finalization.
- **Verification:** targeted source regression, typecheck, lint, unit, build, critical browser E2E, desktop-critical, light/dark + mobile checks.

## Milestones and file ownership
- **M0** Document contract here and `DESIGN.md`.
- **M1** `WorkspacePage.tsx`: remove outer gutters; `WorkspaceAuthoring.tsx`: continuous 1px dividers on 7px hit area; preserve ratio/keyboard semantics.
- **M2** `CanvasChrome.tsx`: edge-attached bottom rail and top-right controls; `DocumentEditor.tsx` and `workspace-ui-classes.ts`: border-only popup/toolbar elevation without modifying shared globals.
- **M3** `WorkspacePlan.tsx`: bordered, compact task/milestone rows and seamless surface; no behavioral edits to planning data/actions.
- **M4** `tests/workspace-border-only.test.ts`: targeted regression against the intended shell, pane, Canvas and Plan boundaries. Run CI; review actual changed-file diff.

## Acceptance checklist
- [ ] Continuous edge-to-edge authoring area: no outer gutters or shadow/card pane frames
- [ ] Header unchanged, web/desktop and compact mobile placement safe
- [ ] Resize separator: mouse and keyboard; 7px target / 1px visible line
- [ ] Canvas: original icons/actions, anchored border-only tool chrome, narrow rail scroll
- [ ] Note: title, picker, tools, editor padding, focus, autosave, conflict recovery
- [ ] Plan: milestones, tasks, loose tasks, loading/error, activity preserved
- [ ] Theme, reduced motion, desktop/web view projections unaffected
- [ ] Targeted checks and CI reported with evidence
