---
colors: {primary: "var(--accent)", surface: "var(--surface)", text: "var(--ink)", muted: "var(--muted)"}
typography: {body: "var(--font-sans)", compact: "12px controls / 13px navigation / 11px minimum in shell"}
spacing: {control: "4px rhythm", panel: "16px"}
radius: {control: "6px", surface: "8px", dialog: "12px"}
motion: {interactive: "100ms ease-out", surface: "160ms ease-out"}
components: {settings: "compact dialog with task-oriented sections"}
---

## Direction

This is compact UI memory and a Settings/recovery ownership supplement.
[`DESIGN.md`](../DESIGN.md) is the canonical interaction/visual contract;
runtime semantic tokens in `apps/web/src/shared/styles/globals.css` are authoritative.
The metadata and summaries here do not override either source.

Notespace is a quiet, compact spatial workspace: the interface should feel like
focused tools around authored Canvas content, not a dashboard of cards.
Follow `DESIGN.md` → Color ownership and component rules for primary/selected
states; keep surfaces flat and let spacing, grouping, and clear verbs carry hierarchy.
Settings should read like a short control panel: one decision per row, one
purpose per section, and no explanatory copy that does not change the next move.

## Guardrails

- Follow strict UI composition order: **Global Tokens (`globals.css`) → Shared Blocks (`shared/ui/blocks/`) → Shared Primitives (`shared/ui/`) → custom markup only if unrepresented**.
- Use semantic Tailwind utilities (`bg-surface`, `text-ink`, `border-line`, `text-xs`/`text-sm`/`text-2xs`), `no-scrollbar`, and `z-[var(--z-*)]` tokens; never add arbitrary `var()` classes, raw `[scrollbar-width:none]`, or magic numeric z-indices (`notespace/ui-tokens` enforces this).
- Keep `LibraryPageShell` mounted once in `PersistentAppShell`; pages render content only. Avoid cross-module DOM scraping (`document.querySelector` into another module's internals) and remove dead UI flows immediately.
- Avoid repeated rounded cards, decorative gradients, and large empty modal areas.
- Distinguish portable library export/restore from device-local SQLite recovery.
- Keep destructive restore and permanent deletion behind explicit confirmation.

## Reusable UI Schema

- **Tokens (`apps/web/src/shared/styles/globals.css`)**: semantic colors, typography (`text-2xs`, `text-xs`, `text-sm`, `text-nav`, `text-base`, `text-title`), `--sidebar-width`, `--z-*` strata, and `@utility no-scrollbar`.
- **Shared Blocks (`shared/ui/blocks/`)**: `CommandListDialog`, `AsyncStateView`, `SettingSection`, `SettingRow`.
- **Shared Primitives (`shared/ui/`)**: `Button`, `IconButton`, `Input`, `SearchInput`, `Switch`, `SegmentedControl`, `ColorSwatchPicker`, `Badge`, `Kbd`, `SectionLabel`, `Dialog` + `DialogHeader`, `AnchoredPopover`, `MenuItem` / `MenuSection` / `MenuDivider`, `ContextMenu`, `Skeleton`.

## State

- Dialog tab and busy lock are UI-local state owned by `AppSettings`.
- Portable backup, restore, Trash and loading/mutation state stay in `LibraryTools`.
- Desktop snapshots, diagnostics and native backup state stay in
  `DesktopRecoveryTools`.

## Patterns

Use a compact Settings dialog with a narrow tab rail on wide screens and a
horizontal tab row on narrow screens. Group data actions by user intent, not by
implementation: move/restore a library first, recover this device second,
manage deleted workspaces separately. The Appearance section exposes two compact radio groups: Mode (`System`, `Light`, `Dark`) and Color theme (`Paper` default, `Stone`, `Sage`, `Amber`, `Graphite`). Both take effect immediately, persist in browser storage, keep accessible labels stable, and reflect the active resolved theme while keeping the Fox Spirit brand mark fixed in Cobalt.

A genuinely empty Home library uses a centered outline folder/Canvas illustration,
short “No workspaces yet” copy, Create Workspace and secondary Restore backup.
Keep the art decorative, static and semantic-token-colored, with no sample records
or empty-state gallery tabs. Loading, errors and empty categories stay distinct.

The sidebar-only single shell has no 38px top bar: one Fox Home link, a separate labelled Explorer toggle, and Search (`Ctrl/Cmd+K`) live in the Explorer header; Settings stays in the Explorer footer and remains reachable through Quick Open when collapsed. Desktop collapse uses Arc Edge-Peek (zero floating top-left button; left-edge hover peeks the Explorer overlay; `Ctrl+\` toggles); narrow viewports (`<=760px`) keep a quiet borderless ghost `Show Explorer` button. Desktop (Tauri) overlays adaptive frameless window controls (macOS stationary traffic lights top-left; Windows borderless `─ □ ×` top-right + top 10px drag strip). Workspace switches keep the shell visible and remount only the authoring session after destination data is ready; only the active Workspace row morphs, while categories remain visually neutral.

Explorer contains Categories and Workspace rows, with no All workspaces or
global New workspace entry. The Categories plus creates a category; each category
exposes its own create action on hover/focus and touch. Name/chevron disclose;
F2/context menu rename and an always-available View category retain navigation.
Dock width is 228px or zero without unmounting forms. At <=760px the same panel
overlays Canvas with backdrop/Escape/route dismissal and focus return. A transient
drawer never overwrites session-only dock preference; hidden content is inert. Cached category rows live with Explorer disclosure
state across routes and refresh on library changes without blanking the list.
The active Workspace is included even outside the category preview. Its name
appears as plain text beside the logo in the shared titlebar. Never float a
Workspace name/save-status card over the Canvas or tool rail. Routine saved
status remains accessible without permanent visual chrome; failures keep the
existing visible recovery actions. On narrow screens, title and Search share
the titlebar without overlapping.

Canvas zoom/fit/history, view, background, library, file, export, navigation, and help actions
share one upper-right Canvas options panel. It opens vertically below the single borderless ghost **More canvas actions (`⋯`)**
trigger, right-aligned and scrollable without a visible scrollbar; Canvas background is plain-only (Excalidraw snapping Grid remains in View). Object actions and styles open via right-click in a unified compact context menu (inline quick controls + max 1-level submenu) for Shapes, Frames (outline + 50% background), Note Cards, Code Blocks, and empty Canvas (including Full mode `Alt+Z` to hide Explorer). The left tool rail groups Navigate, Shapes, Lines, and Draw into compact flyouts (left-click opens group, right-click opens tool defaults aligned to the button), while Note, Code, Diagram, and More stay direct. Selection bounding boxes auto-hide while actively editing a Note or Code Block. All surfaces stay flat with zero drop shadows (`--shadow-float: none`, `--shadow-popup: none`) and hidden scrollbars on menus/dialogs/notes.

Code Blocks are the selection-toolbar exception: remain visible during source
editing, hide during manipulation/context menus, and expose Language, Output,
Run/Stop, Copy and More. Keep source and transient output in one headerless card;
use rendered width for split/stack without modifying native scene geometry.
Languages are searchable in a viewport-clamped popup capped at 320px with
search pinned above its scrolling list. The toolbar shows only the language name,
with Auto/detection kept in the popup and tooltip. The name truncates before any
action clips; all five actions remain reachable at 320px. Output has a
tooltip and a visibly pressed state. Compact More uses a light/dark theme switch
reflecting the resolved theme and an Auto reset; it also holds lines/wrap/fit/duplicate/delete.
Selected source and output are focusable scroll regions with thin scrollbar
affordances; source reading does not require editing. Pane scrolling stays local,
while modified-wheel pinch remains Canvas-owned. Fit and source-only image export
follow the current UI-local wrap option without persisting it.
Popup Escape restores its trigger before editing Escape retains selection.
Use existing semantic tokens and Lucide; no permanent status or output toolbar.
JavaScript retains bounded Worker execution; HTML/XML preview is opt-in and renders lazily inside the output pane within a two-layer opaque-origin `srcdoc` sandbox (five-action toolbar limit preserved via the Run/Preview action). Exports remain headerless source-only.

Canvas conflicts expose retry-merge, a downloadable local draft including images,
and use-saved recovery with explicit local-discard confirmation. Recovery errors
stay visible in the dialog and busy recovery keeps the dialog open.

## Accessibility

Every settings action keeps a visible label, keyboard path, focus ring, and
recoverable error status. Busy backup/restore operations keep the dialog open
and disable competing actions until the workflow settles.
