---
colors: {primary: "var(--accent)", surface: "var(--surface)", text: "var(--ink)", muted: "var(--muted)"}
typography: {body: "var(--font-sans)", compact: "11px controls / 12px sections"}
spacing: {control: "4px rhythm", panel: "16px"}
radius: {control: "6px", surface: "8px", dialog: "12px"}
motion: {interactive: "100ms ease-out", surface: "160ms ease-out"}
components: {settings: "compact dialog with task-oriented sections"}
---

## Direction

Notespace is a quiet, compact spatial workspace: the interface should feel like
focused tools around authored Canvas content, not a dashboard of cards.
Use cobalt only for selected and primary states; keep surfaces flat and let
spacing, grouping, and clear verbs carry hierarchy.
Settings should read like a short control panel: one decision per row, one
purpose per section, and no explanatory copy that does not change the next move.

## Guardrails

- Prefer existing shared tokens and `Button`/`IconButton` primitives.
- Avoid repeated rounded cards, decorative gradients, and large empty modal areas.
- Distinguish portable library export/restore from device-local SQLite recovery.
- Keep destructive restore and permanent deletion behind explicit confirmation.

## State

- Dialog tab and busy lock are UI-local state owned by `AppSettings`.
- Portable backup, restore, Trash and loading/mutation state stay in `LibraryTools`.
- Desktop snapshots, diagnostics and native backup state stay in
  `DesktopRecoveryTools`.

## Patterns

Use a compact Settings dialog with a narrow tab rail on wide screens and a
horizontal tab row on narrow screens. Group data actions by user intent, not by
implementation: move/restore a library first, recover this device second,
manage deleted workspaces separately. The Theme setting takes effect
immediately, keeps the accessible label stable, and shows its current mode.

A genuinely empty Home library uses a centered outline folder/Canvas illustration,
short “No workspaces yet” copy, Create Workspace and secondary Restore backup.
Keep the art decorative, static and semantic-token-colored, with no sample records
or empty-state gallery tabs. Loading, errors and empty categories stay distinct.

The shared 38px shell keeps one Fox Home link and a separate labelled Explorer
toggle in browser and Tauri. Search opens Quick Open; Settings stays in the
Explorer footer and remains reachable through Quick Open when collapsed. Workspace switches keep the shell visible and remount only
the authoring session after destination data is ready; only the active
Workspace row morphs, while categories remain visually neutral.

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

Canvas view, background, library, file, export, navigation, and help actions
share one upper-right Canvas options panel. It opens vertically below the More
trigger, right-aligned and scrollable without a visible scrollbar. Fit, zoom and
history are compact labelled icon controls aligned directly with its More trigger. Selected-object actions form a horizontal toolbar
4px above the selection bounds, clamped to the Canvas viewport; it moves below
only when there is no room above. It exposes no more than three type-sensitive
quick actions, keeps complete object commands behind its visible More entry,
and hides without being recreated while the selected object is manipulated,
edited, or has the native context menu open. Tool defaults use a compact vertical
bar beside the active rail button, horizontal above the mobile rail. A round
stroke swatch distinguishes Colors from shape creation. Popup positioning lives
on a static outer container; only its contents animate. The native context menu is the full-command surface and
shares Excalidraw's action manager with keyboard commands.
More omits actions already visible in the three quick controls, but retains any
applicable property that does not fit. Batch styles show Mixed per property;
same-type selections retain Pressure/Corners. Overlay dismissal releases only
its own scope; Escape restores its trigger without clearing selection, and a
changed context closes stale properties without stealing pointer focus.

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
JavaScript retains bounded Worker execution; HTML preview stays disabled until
browser and WebView2 isolation is proven. Exports remain headerless source-only.

Canvas conflicts expose retry-merge, a downloadable local draft including images,
and use-saved recovery with explicit local-discard confirmation. Recovery errors
stay visible in the dialog and busy recovery keeps the dialog open.

## Accessibility

Every settings action keeps a visible label, keyboard path, focus ring, and
recoverable error status. Busy backup/restore operations keep the dialog open
and disable competing actions until the workflow settles.
