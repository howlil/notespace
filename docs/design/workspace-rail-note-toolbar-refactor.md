# Notespace Workspace Rail & Note Toolbar — Design Freeze

Status: APPROVED DESIGN; M1 and M2 verified; M3 code complete, CI pending (2026-10-21). M4–M5 pending.
Repository: howlil/notespace; branch `refactor/workspace-rail-note-toolbar`.
Basis: design research and interactive prototype approved in conversation. This is the authoritative continuation contract for M1–M5. Do not alter scope or skip milestones.

## Visual contract (source of truth)
- Workspace must be full-bleed, border-only. No decorative shadows, gradients, cards, outside gutters, duplicate navigation.
- Semantic CSS tokens from `apps/web/src/shared/styles/globals.css`: `--bg` #f7f8fa; `--surface` #fff; `--ink` #252630; `--muted` #636979; `--line` #e4e5ec; `--accent` #3f6d61; `--tint` #ebf2ee; `--canvas` #f8f9fc; font Open Sans via `--font-sans`. Preserve dark-token support: do not hardcode light mode hex in production.
- Workspace rail 40px, 1px `--line` border-right, 34px icon hit targets / compact rounded hover, icon-only; top Back to Library; true vertical center Canvas/Note/Split/Plan; bottom Activity, Focus. Never add a Workspace switcher, Guide, Settings, logo, Save status, or More to rail.
- Web: rail extends from top to bottom of application viewport; browser UI is external.
- Desktop Tauri (M2): rail extends from y=0 to bottom of application window. To its right only, a 38px titlebar has an empty native draggable region and window controls (each 39px). DO NOT show workspace title (e.g. Java), Saved, logo, Guide, Settings, or duplicate navigation in desktop titlebar. Desktop titlebar is not the note toolbar. Preserve native-decorations fallback and graceful close.
- Note toolbar per pane (M3/M4) 34px, bottom 1px `--line` border, 28px icon button targets; left inline-rename-capable note title with chevron and always-visible + New Note; right Find/Outline merged Navigate trigger and pane-only ellipsis. No extra code block icon. Linked Canvas frame action must remain accessible without introducing unrelated duplicate menus.
- Note picker: list of Notes; each row [name / always-visible delete icon]; click name to activate, click trash to confirm deletion of that exact Note without switching first. Do not put Rename, New Note, Move to pane or any nested More in Note picker. Rename only inline from title double-click/F2; Enter commits, Escape cancels. Last Note cannot be deleted. New Note via + outside picker. If new Note is created successfully, open it and focus title rename.
- Pane Actions: Split Right / Split Down / Close Pane only. No Delete Note. Preserve max 4 panes, existing cannot-split / cannot-close guards, resize by keyboard/pointer, ratio clamp, and focus/maximize state.
- Navigate (M4): one anchored per-note popover; outline displayed by default; typing in search reveals results. Preserve Tiptap Find & Replace including next/previous, Replace/Replace All, case-sensitive toggles; do NOT implement HTML text replacement or another search engine. Slash menu and selection formatting stay inside editor; no permanent Code Block control.
- Popup interactions: one open at a time; Escape/outside click dismiss; trigger focus restored; no clipping in split/mobile; keyboard and touch support; reduced motion.
- Focus: use existing `useWorkspacePaneLayout` maximize/focus state, not a parallel boolean. Rail hides during focused pane, with a means to exit and Escape support. 
- Activity: preserve existing activity runtime, session history, start/pause/resume/end and error handling. One entry in rail; other surfaces remain reachable from it.
- Save recovery: `useWorkspaceSession`, flushNote, flushAll, local edits and conflict/retry must survive structural changes. Save state must remain accessible via assistive technology without reintroducing Saved into desktop titlebar. Navigation may not discard dirty content.
- Accessibility: semantic nav/toolbar, per-item delete names, aria-pressed for views, aria-expanded/controls on popovers, focus-visible, no fake non-actionable buttons.

## UI ownership matrix

| Command | Sole UI owner |
| --- | --- |
| Back to Library | WorkspaceRail top |
| Canvas, Note, Split, Plan | WorkspaceRail middle |
| Activity | WorkspaceRail bottom (existing Activity runtime) |
| Focus/maximize and restore | WorkspaceRail bottom; focused restore affordance |
| Switch Note | Note title selector |
| New Note | + beside Note title |
| Rename Note | Inline Note title only |
| Delete Note | Trash in individual Note picker row only |
| Find/Outline | Single Navigate popover |
| Split right/down, Close pane | Pane Actions only |
| Code Block insert/convert | Slash and contextual formatting |

## Architecture — design-thinking A/E/R
A: User command -> WorkspaceRail/Note header -> existing pane-layout/commands/Tiptap -> workspace session -> HTTP persistence; view is updated by React state. E: invalid note IDs, create/delete API failure, stale version/conflict, unsaved changes, popup placement, desktop titlebar activation failure. R: existing hooks/state, viewport, DOM focus, native Tauri window control adapter, Tiptap extension. No new state container or persistence system.
Data variants: 1–4 pane leaves; one/many Notes; layout note/canvas/split; plan is separate view; save states saved/saving/conflict/error/unsaved; activity idle/running/paused; platform web/native/custom chrome; width desktop/mobile; focused/normal.

## Interface graph — design-graph
Surfaces: WorkspaceRail; NotePaneHeader; NotePicker; NotePickerRow; NavigatePopover; PaneActions; Editor; Canvas; Plan; DeleteConfirmation; Activity surface; Focus surface. Moves: open library, change view, start/manage activity, maximize/restore, switch/create/rename/delete Note, navigate/find/replace, split/close/resize, save/recover. Every move has a keyboard path and a safe failure state. Environment projections change geometry, not product behavior. No separate Web/Desktop note controller.

## Milestones (sequential; do not prematurely implement next)
- **M0**: preserve this contract, baseline code/tests and screenshots, make dedicated branch.
- **M1**: build responsive WorkspaceRail for Web (Back/View/Activity/Focus), replace horizontal workspace navigation, preserve Plan and existing domain state, avoid duplicate menus, keep desktop native titlebar functional until M2; migrate tests that assert old header shape. Run review/gates before moving on.
- **M2**: Tauri shell refactor to full-height rail at x=0, titlebar only on content column, native decorations fallback; desktop-specific smoke, drag and window controls.
- **M3**: Note toolbar/picker + inline rename, + outside, trash per item, guard API and reconcile pane state.
- **M4**: one Navigate, pane-only actions, no permanent Code button; preserve all Tiptap commands.
- **M5**: visual comparisons (Web/Desktop at full/split/compact), code review, unit/integration/e2e/native/lifecycle regression.

## Suggested files
`apps/web/src/pages/workspace/WorkspacePage.tsx`;
`apps/web/src/features/workspace-authoring/ui/WorkspaceRail.tsx`;
`apps/web/src/features/workspace-authoring/ui/WorkspaceViewSwitcher.tsx` (remove from Workspace if redundant);
`apps/web/src/features/activity/ActivityIndicator.tsx` (reuse runtime; only scoped presentation);
`apps/web/src/shared/ui/desktop-titlebar/{DesktopChromeProvider,DesktopTitleBar,desktop-titlebar.css}` (M2);
`apps/web/src/features/workspace-authoring/ui/{WorkspaceAuthoring,NotePicker}.tsx` (M3);
`apps/web/src/features/workspace-authoring/document/DocumentEditor.tsx` (M4);
`DESIGN.md`; `tests/workspace`; `tests/*contract*`.

## Acceptance
1. Single view switcher; rail 40px edge-to-edge; icon center position doesn't shift due to top/bottom controls.
2. Back, Canvas, Note, Split, Plan each work via pointer and keyboard, with one active state and no duplicate menus.
3. Activity runtime operations preserved, accessible from rail without extra permanent icon.
4. Focus/maximize and restore preserve original pane/split ratios, hidden rail and Escape behavior.
5. Split up to four panes, drag/keyboard resize, compact mobile vertical orientation; Canvas and Plan unaffected.
6. No extra titlebar row, no workspace title or Saved on desktop titlebar after M2; rail spans full window height.
7. Note row Delete targets exact ID; last-note protection; confirmation; create failure safe; inline rename accessible.
8. Navigate retains Find & Replace, outline, selection menu, slash commands, focus and keyboard.
9. Dirty data not lost on navigation/reload/native close; errors remain visible; persisted state valid.
10. No runtime console errors, popover clipping, decorative shadow, design-token drift or duplicate actions.
11. Web E2E + native desktop smoke/lifecycle pass; static design-contract tests updated to new architecture rather than disabled.

## Execution notes
Test scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e:critical`, `pnpm test:desktop:critical`, `pnpm test:desktop:lifecycle`. Native + E2E require configured runners.
Never claim a gate passed if it was not run. Record issues and exact follow-up at each milestone.

## M2 implementation handoff (2026-10-21)
- `DesktopChromeProvider` owns a persistent `desktop-workspace-rail-slot` and stable `desktop-shell-content` wrapper. Workspace route detection comes from the existing TanStack Router, not a new domain state.
- `DesktopChromeContext` exposes `workspaceRailHost`. `WorkspacePage` portals the very same rail only while native custom chrome is active; native-decorations fallback and Web keep the normal in-page rail.
- Desktop Workspace shell is a 40px + flexible grid, with a right-hand 38px native titlebar and ordinary content column; Library/Inbox/Today keep their original horizontal titlebar and layout.
- Focus uses existing `workspace-main.is-focus-mode` and CSS `:has` to collapse the 40px desktop rail column to zero; restoring Focus restores rail width without duplicating state.
- Existing `WindowControls` uses `request_desktop_close` for graceful-close durability. Titlebar drag host `data-tauri-drag-region` stays interactive only on the non-button area; no window-control logic changed.
- M2 acceptance: rail x=0,y=0,w=40,h=window.innerHeight; desktop titlebar x=40,y=0,h=38 with 3 native controls; Note pane starts x=40 and y=38; true view-center in rail; no extra headers or Saved/Java label; focus collapses rail gutter; pages other than Workspace unchanged; native fallback retains in-page navigation.

## M2 verified code review and CI handoff (2026-10-21)
- Runtime commit: `2f43a26f44dce865de46c15572f93081f52e8ab0`. Branch: `refactor/workspace-rail-note-toolbar`. Draft PR: #137.
- `$design-thinking`: Preserve existing single state owner and state transitions. No changes to `useWorkspacePaneLayout`, editor commands, persistence, Activity runtime or Rust close/flush.
- `$design-graph`: Web uses inline rail. Tauri custom chrome uses one portaled React rail in a 40px full-height shell column and an adjacent 38px titlebar. Tauri native fallback uses inline rail; Library/Inbox/Today keep old chrome; Focus collapses rail gutter and Restore restores layout. No duplicate view switcher or titlebar controls.
- `$code-review` delta: provider owns only DOM host and route-based shell composition; page owns all business-state and rail commands; context is a DOM-placement adapter, not a second state machine. React Outlet stays under stable shell parent. Native window controls remain in `WindowControls.tsx` and graceful close invokes `request_desktop_close` unchanged. Legacy Workspace titlebar CSS removed. No actionable code findings remained after native verification.
- **GitHub Verify** run [39494095474](https://github.com/howlil/notespace/actions/runs/39494095474): **success** (TypeScript, lint, unit/contract tests, critical Playwright journeys, Go/server gates, Compose persistence restart smoke). Full browser suite was skipped by workflow configuration (not claimed as run).
- **Verify Desktop** run [39494095529](https://github.com/howlil/notespace/actions/runs/39494095529): **success** in all three jobs (Linux, Windows, Windows-latest), including Windows native WebDriver geometry and Focus/Restore smoke and desktop lifecycle.
- Desktop smoke asserts exact rail x=0,y=0,width=40,height=innerHeight, titlebar x=40,height=38, page x=40,y=38; editor Focus x=0 and restored x=40. Library stays outside Workspace-specific grid.
- M2 complete. **Next M3** on this same branch: Note header (34px) and picker ownership refactor: + always next to title, rename inline only, trash on every list item with exact target ID and last-note/dirty data protections. Do not implement M4 Navigate until M3 passes review and tests.

## M3 implementation state (2026-10-21)
- Runtime commit `30afbad`: Removed duplicated Rename/Move/Delete context menus from Note picker and Delete action from Pane Actions; removed leading FileText from Note title; Note title double-click/F2 is sole Rename UI; + stays outside picker even while editing; each row has independent visible trash and exact note target.
- Create Note still goes through existing HTTP command; on success switches pane and focuses inline rename; on failure leaves existing note unchanged.
- Delete confirms exact note ID, guards last Note and pending clicks, flushes editor snapshots before persistence, keeps dialog open on failure, reconciles all panes on success using a pure helper that avoids duplicate Note assignment. No Tiptap Navigate changes (M4).
- `pane-layout.test.ts`: pure reconciliation tests; `tests/workspace/note-picker.spec.ts`: browser E2E for UI ownership, inline title rename, creation and destructive rollback.
- CI must pass before declaring M3 accepted. M4 remains separate.
