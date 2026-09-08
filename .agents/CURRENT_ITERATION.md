# Current Iteration

## Status

**Milestone: Eraser-backed native diagram icons — integration gate.**

The diagram slice now uses the current Eraser catalog as local metadata, loads SVGs through the same-origin Notespace server gateway, and renders valid assets as native Excalidraw image elements.

## Product outcome

A user can:

- search the generated catalog of 3,947 Eraser icons locally;
- browse General, Tech, AWS, Google Cloud, Azure, Oracle Cloud, Kubernetes, and Networking categories;
- insert either a structured component (container + SVG + label) or an icon-only native SVG image;
- reopen diagrams with stable structured identity and server-owned canvas assets;
- use Diagram beside the other Notespace-owned Canvas tools in one anchored toolbar.

## Implemented slices

### S1 — Icon catalog

- `scripts/sync-eraser-icons.mjs` parses the canonical Eraser docs sections and generates `apps/web/src/features/diagram/catalog/eraser-icons.generated.json`.
- The committed file contains 3,947 metadata entries only: `name`, `category`, and generated human-readable `label`.
- The picker searches this local metadata; no SVG payloads are bundled.

### S2 — Same-origin icon gateway

- Go serves `GET /api/icons/eraser/{slug}` from `apps/server/internal/httpapi`.
- The gateway validates slug characters, restricts the upstream host/path, requires SVG media type, limits payloads to 1 MiB, rejects script/event-bearing payloads, and caches valid SVG bytes in memory.
- Browser code has no runtime request to `storage.googleapis.com` and Notespace does not add CORS headers for this flow.

### S3/S4 — Native SVG and semantics

- Managed component nodes retain a native shape, bound label, and native image element backed by Excalidraw `BinaryFileData`.
- Icon-only nodes render the SVG image directly without a rectangle; the existing text fallback remains only for an unavailable/invalid asset.
- Structured metadata remains in the existing canvas snapshot and geometry synchronization remains native-editor driven.

### S5 — Eraser-style picker

- The picker has global search, category drilldown, counts, component/icon-only mode, and a fixed-row virtualized grid so the full catalog does not mount at once.
- The panel is positioned relative to the Diagram control rather than the Canvas viewport corner.

### S6 — Unified Canvas toolbar

- `CanvasToolbar` owns the Notespace tool row and uses Excalidraw's public `setActiveTool()` API for selection, hand, shapes, arrow, line, draw, text, image, and eraser.
- Excalidraw's native toolbar is hidden through the host surface; no DOM insertion/hacking is used.
- Diagram is a toolbar control with its picker nested at the control anchor; More opens the public command palette.
- Follow-up fix: the picker anchor is outside the toolbar's horizontal scroll container, and the native Excalidraw toolbar variants are hidden by a scoped host-surface rule so the two tool rows cannot overlap.
- Follow-up fix: the Notespace toolbar now maps the complete dependency `ToolType` set, including Lasso, Frame, Embed, Auto shape, Magic frame, Laser pointer, Bucket fill, and Eraser.
- Diagram picker behavior: new catalog selections are icon-only; the Component/Component toggle was removed. Existing component nodes remain readable for snapshot compatibility.
- Canvas toolbar polish: Diagram is represented by an icon-only control with an accessible label and tooltip retained.
- Diagram picker polish: removed Architecture, Flowchart, starter creation, and Custom Icons controls; the picker is now focused on searching and inserting SVG icons.

### Reusable UI audit (engineering enabler)

- Existing shared primitives remain the source of truth for buttons, inputs, dialogs, context menus, and popup dismissal.
- Added `apps/web/src/components/ui/popup-surface.tsx` as a small ref-forwarding primitive for the repeated non-modal popup surface tokens.
- Reused `PopupSurface` in Category actions, Workspace actions/history, and Study activity; positioning, roles, and dismissal remain feature-owned.

### Brand asset refresh

- The Figma Foldling exports are stored locally under `apps/web/public/brand/` so the app does not depend on expiring Figma asset URLs.
- `NotespaceLogo` is the shared brand component used by the Sidebar and route-pending screen, with the light Foldling variant selected for dark theme surfaces.
- `/favicon.svg` now uses the Figma Foldling Ink export while keeping the existing root-route favicon contract.

### S7 — Excalidraw Notespace design-system adapter

- `CanvasToolbar` now reuses the shared `IconButton` primitive through one local `CanvasToolbarButton`, keeping every canvas tool icon-only with the same focus, active, hover, and motion grammar as the rest of Notespace.
- `CanvasEditor` keeps Excalidraw as the rendering engine but removes scattered feature utility overrides; the host surface is now the single styling boundary.
- `globals.css` maps Excalidraw's public CSS variables and visible UI surfaces—tool controls, islands, menus, context menus, library/sidebar panels, dialogs, inputs, focus states, and toasts—to Notespace light/dark tokens.
- The native Excalidraw toolbar and bottom menu are hidden with higher-specificity scoped selectors, preventing the dependency toolbar from reappearing above the Notespace-owned toolbar.
- Restored Excalidraw's missing drawing-properties surface as a Notespace-owned `Style` tab in Canvas details: stroke/background colors, fill style, stroke width/style, sloppiness, edges, and opacity update the active drawing defaults and the selected drawable element. The contextual detail panel opens from its toolbar control or a double-click on a selected canvas object, while the compact vertical toolbar remains the persistent surface. Expanded contextual actions to cover grid, edit, group, arrange/layer, align/distribute, transform, copy/paste styles, lock, frame, and library operations.
- Follow-up compactness pass: collapsed the large color palettes into inline stroke/fill controls, reduced choice-button height and section spacing, and removed non-essential helper copy from the Style surface while keeping the full style contract available.
- Follow-up popup behavior: removed visible group headings from Diagram and More tools, retained labels only for accessibility, and added shared outside-pointer dismissal plus immediate close when a core canvas tool is selected.

### Reusable page-control audit (engineering enabler)

- Replaced repeated page-level raw buttons and text inputs with the existing `Button`, `IconButton`, and `Input` primitives in `DocumentEditor`, `Workspace`, `Dashboard`, `Sidebar`, `QuickCapture`, `QuickOpen`, `CategoryDetail`, `DiagramPalette`, toast actions, study controls, and the workspace guide.
- Preserved specialized native controls where a shared primitive does not exist or where semantics require a custom row/cell: file inputs, selects, textareas, listbox/context rows, heatmap cells, disclosure summaries, and editor-specific menu items.
- Added a design-contract assertion so the audited pages continue to consume the shared primitives.

### Home dashboard redesign

- Reworked the Recent workspaces screen into a compact library hierarchy: explicit Library context, resume-focused heading, contained search, view tabs, grouped workspace list, and secondary learning activity.
- Reduced oversized whitespace and row height while preserving category navigation, workspace links, global search, empty/loading states, and study activity interactions.
- Kept the redesign within existing Notespace surfaces, steel-blue tokens, typography, and shared UI primitives; no new route, persistence contract, or decorative asset was introduced.

### Loading state refinement

- Added the shared `Skeleton` primitive with the existing Notespace pulse motion and reduced-motion fallback.
- Added `WorkspaceListSkeleton` for stable, content-shaped loading rows on Home and Category detail.
- Replaced text-only loading feedback in Sidebar category expansion, Study activity metrics/heatmap/detail, and lazy Note/Canvas panes with contextual skeleton states that preserve layout while data loads.

### Landing refresh

- Updated the standalone Astro landing to use the same local Foldling brand assets as the app, including light/dark-aware wordmark rendering and the landing favicon.
- Reframed the hero around Notespace's actual product loop: one workspace for structured Notes, spatial Canvas, and owned deployment; the primary CTA still points to the public source repository because Notespace has no hosted signup flow.
- Added a compact Notes / Canvas / Owned summary rail, clearer section landmarks, a skip link, and removed the landing header blur so the page follows the low-elevation Notespace visual contract.

### Slash insert menu polish

- Fixed the document slash-command popup item layout by forcing a stable flex row with a non-shrinking icon column and a text column that owns its wrapping.
- Increased the popup width/height budget for the two-line command descriptions and hid the visual scrollbar while preserving wheel, touch, and keyboard scrolling.
- Added a static design-contract assertion so the popup keeps its hidden-scrollbar and left-aligned item layout rules.

### Note toolbar cleanup

- Removed the standalone image-upload button from the Note editor toolbar to reduce competing actions in the compact row.
- Image insertion remains available through the slash command, paste, and drag-and-drop flows.

### Home learning activity hierarchy

- Moved Learning activity above the library view tabs and workspace list, immediately after Home search, so study context is visible without scrolling to the bottom.
- Changed the activity surface to the same bordered, rounded panel language as Workspaces and restored Today / This week / Streak summaries in the Home view.
- Increased heatmap cells slightly and raised workspace rows from the previous compact height so both sections carry comparable visual weight while remaining responsive.

### Canvas chrome rail redesign

- Replaced the floating horizontal Notespace canvas toolbar with a flat, scrollable vertical rail anchored to the left edge of the Canvas surface; all existing Excalidraw tools remain available, including bucket fill, laser, magic frame, frame, embed, and eraser.
- Added compact shortcut badges and accessible labels to tool buttons, plus a separate Diagram icon and a details icon so the toolbar stays narrow without losing discoverability.
- Moved undo, redo, zoom out, zoom percentage/reset, zoom in, and Browse library into a flat utility bar anchored to the upper-right of the Canvas; the separate fit/expand control was removed.
- Added a side-open Canvas details panel with background toggle, settings/command palette access, duplicate, delete, and more actions through Excalidraw's public action manager; Diagram's icon-only picker now opens beside the vertical rail.
- Removed custom and scoped Excalidraw surface shadows to keep the Canvas chrome flat and avoid competing floating layers.
- Upgraded tool discovery from browser-only titles to delayed, hover/focus tooltips rendered through a body portal; each tooltip now carries a tool name, short functional description, and shortcut without being clipped by the scrollable rail.

## Verification evidence

- `pnpm test`: 58 passed.
- `pnpm lint`: passed with `--max-warnings 0`.
- `pnpm typecheck`: passed.
- `pnpm build`: production web/SSR build passed; Vite retained its existing large-chunk warning.
- Reusable UI extraction: `PopupSurface` is exported through the UI barrel and passed typecheck, lint, tests, and production build.
- Brand refresh: local Figma SVG assets, shared `NotespaceLogo`, and favicon contract passed typecheck, lint, tests, and production build.
- Excalidraw design-system adapter: typecheck passed, lint passed, all 57 tests passed, and the production web/SSR build passed.
- Reusable page-control audit: typecheck passed, lint passed, all 58 tests passed, and the production web/SSR build passed.
- Home dashboard redesign: typecheck passed, lint passed, all 58 tests passed, and the production web/SSR build passed. Visual design QA is recorded as blocked because no browser surface was available for an implementation screenshot.
- Loading state refinement: typecheck passed, lint passed, all 58 tests passed, and the production web/SSR build passed. Browser visual verification remains unavailable in this session.
- Landing refresh: `pnpm build` in `landing/` passed, including static `/index.html`, copied brand assets, and favicon output. `git diff --check` passed.
- Slash insert menu polish: `pnpm test` (58/58), `pnpm lint` with `--max-warnings 0`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The production build retains the existing large-chunk warning from editor dependencies.
- Note toolbar cleanup: the toolbar now exposes search, Markdown export, and outline actions only; image insertion paths remain owned by the editor command/input handlers.
- Home learning activity hierarchy: `pnpm test` (58/58), `pnpm lint` with `--max-warnings 0`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The production build retains the existing large-chunk warning from editor dependencies.
- Canvas chrome rail redesign: `pnpm test` (58/58), `pnpm lint` with `--max-warnings 0`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Browser visual verification remains unavailable in this session; production build retains the existing large-chunk warning from editor dependencies.
- Canvas tooltip behavior: Eraser's documented `/` → search → `Enter` command-discovery model was used as the interaction reference; toolbar tooltips now disclose the same kind of contextual description while hover/focus and keyboard access remain supported. Final `pnpm typecheck`, `pnpm lint`, `pnpm test` (58/58), and `pnpm build` passed.
- Canvas utility bar follow-up: lowered the utility layer beneath the Workspace pane action menu, removed the redundant fit/expand button, and wired Browse library to Excalidraw's native Library sidebar so it stays inside the active Canvas instead of navigating to the Dashboard.
- Browse library regression fix: the action now calls `ExcalidrawImperativeAPI.toggleSidebar({ name: "default", tab: "library", force: true })`; the Notespace `/` route and its loading screen are no longer involved when opening the official catalog.
- Canvas utility bar compactness: Browse library is now icon-only and the separate zoom in/zoom out controls were removed; the current zoom percentage remains available as the reset control.
- Loading state refinement: reduced route loading feedback to the Notespace mark only, with a restrained float/breathe animation, hover response, and screen-reader status instead of a progress dashboard.
- Canvas details layering: the details panel is now portaled to `document.body` and positioned from the details control's measured anchor, so narrow or overflow-hidden workspace panes cannot clip or cover it.
- Canvas active-tool state: active tools now use a high-contrast Notespace accent background with a white icon and shortcut badge, while `aria-pressed` continues to expose the state semantically.
- Official Library action: Browse library now targets Excalidraw's `default` sidebar and `library` tab, synchronizes its active state, and closes/reopens the same native catalog consistently across desktop and mobile layouts.
- Canvas tool hierarchy follow-up: kept the 11 frequently used native tools on the rail, moved secondary tools into a grouped More menu (Selection, Insert, Review, Utilities), and now consults Excalidraw `isToolSupported()` before rendering a control.
- Canvas popup layering follow-up: utility controls now sit at `z-10`, below the Workspace action popup layer, so History and Export cannot be visually or interactively covered by the Canvas utility bar.
- Built CSS inspection confirmed the scoped Excalidraw token adapter and native-toolbar hide selectors are present in the production artifact.
- Follow-up UI fix: production CSS contains the scoped native-toolbar hide rule; the picker layout no longer clips vertical overflow.
- `go vet ./...`: passed.
- `go test -race ./...`: passed.
- production Go binary build (`go build -trimpath -o <temporary> ./cmd/notespace`): passed.
- Focused Go gateway tests cover valid SVG fetch, cache reuse, invalid slugs, and unsafe/non-SVG rejection.
- Graph coverage check found no recorded gaps for every operated-on path; changed files are marked metadata-changed pending graph refresh, so source reads and automated gates remain the authoritative evidence for this working tree.
- Canvas tool grouping: `pnpm typecheck`, `pnpm lint`, `pnpm test` (58/58), `pnpm build`, and `git diff --check` passed. Browser visual verification remains unavailable in this session.
- Canvas popup layering: source and design-contract checks updated for the lower utility layer; the existing browser-visual-verification limitation remains.
- Canvas toolbar position: the left tool rail is now vertically centered within the active Canvas surface instead of being pinned to its top edge.
- Canvas details anchor: the details panel now measures the complete left rail, so it opens beside the toolbar rather than beside the individual Details button and follows the rail's current position responsively.
- Canvas popup collision placement: More, Canvas details, and Diagram panels now measure their rendered height and open upward when the toolbar is near the bottom edge, while retaining viewport-safe side fallbacks.
- Canvas right-side workspace placement: restored pane trees now normalize the single Canvas pane into the trailing/right branch while preserving note-only splits as a left subtree; row splits containing Canvas stay horizontal at narrow widths so Canvas does not move underneath Notes.
- Workspace header and export cleanup: removed the Workspace Note's dark-mode toggle and workspace/Markdown download actions; the top-bar overflow menu is now the final control, and the workspace name is a same-category workspace switcher.
- Canvas motion polish: the rail and utility bar enter with restrained motion, toolbar popups and tooltips use direction-aware enter/exit transitions, Diagram category/content changes animate without mounting the full catalog, and panel resizing repositions through `ResizeObserver`; global reduced-motion behavior remains respected.
- Design token reference: expanded `DESIGN.md` with implementation-aligned semantic color, typography, spacing, radius, border/focus, elevation, overlay, motion, responsive, and component-state tokens; a design-contract test now guards the documented runtime token surface.
- Canvas right-side workspace placement: `pnpm typecheck`, `pnpm lint`, `pnpm test` (60/60), `pnpm build`, and `git diff --check` passed. Browser visual verification remains unavailable in this session; the build retains the existing large-chunk warning from editor dependencies.
- Workspace header and export cleanup: frontend gates passed; `go test ./...` and `go vet ./...` passed from `apps/server`. The landing Astro build hit an existing Windows/Astro native prerender crash after Vite completed; no source error was reported.
- Canvas details action consolidation: moved Excalidraw's native canvas actions into the Notespace Canvas details panel, removed the duplicate native MainMenu surface, anchored Details to its own rail control, and kept the panel viewport-aware so it opens upward beside the control when the rail is low. Final `pnpm typecheck`, `pnpm lint`, `pnpm test` (60/60), `pnpm build`, and `git diff --check` passed; the build retains the existing large-chunk warning.
- Canvas hover and narrow-viewport cleanup: removed descriptive hover tooltips from rail tools so they cannot cover canvas content; Diagram, Details, and More retain their expanded popover interaction, and the Details panel width now respects the available space beside the rail on very narrow viewports. Final verification remains green after the cleanup.
- Native Canvas controls follow their owning context: Style now exposes stroke/fill, common arrowheads, and text font family/size/alignment; Selection retains group, ungroup, lock, order, align/distribute, and flip; the utility bar owns zoom in/out/reset, fit canvas, grid, and object snapping; File owns Copy as PNG/SVG.
- Canvas toolbar E2E debugging: added `tests/canvas-toolbar.spec.ts` with seven browser scenarios covering rail/More grouping, hover-exclusive popups, empty Details suppression, Shape/Line/Pen/Text contextual sections, style state changes, a newly created text element inheriting the selected font size, and selected-arrow arrowhead/type controls. The first run caught the `Frame F` accessible-name shape and a non-persisting Text `L` default; the test selector was corrected and the default font state was fixed. The empty Details case then caught a wrapper that rendered despite having no controls; shared context detection now prevents that empty popup. Focused E2E passes 7/7; the full repository E2E run timed out after four minutes without a test-level result.
- Workspace view switcher: replaced pane-level Open Canvas, Open note, and Close pane controls with one centered Canvas / Note / Split switcher in the workspace topbar. Switching modes preserves authored content, keeps Canvas trailing on the right in Split mode, and resets focus mode safely. Typecheck, lint, 61 tests, build, and diff checks pass; browser visual verification remains unavailable in this session.
- Canvas popup baseline: Diagram, Canvas details, and More tools now share the More tools rail anchor for vertical positioning, so their popup baseline stays aligned with the bottom utility control even when the panel opens upward. Typecheck, lint, 61 tests, and diff checks pass; browser visual verification remains unavailable in this session.
- Diagram palette progressive disclosure: the initial Diagram popup now keeps only its header, global search, and category navigation visible. Icon results, counts, Icon only state, and selected-diagram actions render only after a search or category is chosen, keeping the default panel compact. Typecheck, lint, 61 tests, build, and diff checks pass; browser visual verification remains unavailable in this session.
- Canvas details actions and background palette: Canvas background now expands into 12 Notespace-aligned light/dark presets plus a custom color input and persists through `viewBackgroundColor`; Command palette opens Excalidraw's public dialog state directly, while Find on canvas uses the public `toggleSidebar` search state and reports unavailable engine actions instead of failing silently. Typecheck, lint, 61 tests, production build, and diff checks pass; browser visual verification remains unavailable in this session.
- Canvas details tabs: grouped the long Canvas details menu into four animated tabs—Canvas, File, Navigate, and Selection—so only one action group is visible at a time while preserving the background palette and native Excalidraw actions. Typecheck, lint, 61 tests, production build, and diff checks pass; browser visual verification remains unavailable in this session.
- Empty Canvas chrome: removed the static Canvas pane header and its reserved 34px row; Canvas now renders directly into the full pane height, while Note panes retain their title and action header. Typecheck, lint, 61 tests, production build, and diff checks pass; browser visual verification remains unavailable in this session.
- Note toolbar cleanup: removed the Note-only expand/restore control and its `Minimize2` trigger from the pane header; the global Workspace top-bar layout control remains the single maximize/restore entry point.
- Toast system cleanup: replaced the Radix toast wrapper with a Notespace-owned live region using semantic tokens, accessible status/error roles, hover/focus pause, dismiss/action controls, and token-aligned motion; removed `@radix-ui/react-toast` from the web package.
- Toast system cleanup: `pnpm typecheck`, `pnpm lint`, `pnpm test` (61/61), `pnpm build`, and `git diff --check` pass. Browser visual verification remains unavailable in this session; the build retains the existing large-chunk warning from editor dependencies.
- Native Canvas controls: `pnpm typecheck`, `pnpm lint`, `pnpm test` (61/61), `pnpm build`, and `git diff --check` pass. The production build retains the existing large-chunk warning from editor dependencies; browser visual verification remains unavailable in this session.

## Architecture boundaries

- `StructuredDiagram` remains Notespace domain state stored in the versioned canvas snapshot.
- Excalidraw remains the renderer/editor adapter; Notespace owns the unified toolbar and diagram semantics.
- The browser never accesses the Eraser/GCS origin directly. The Go gateway is the only runtime upstream boundary and returns same-origin `image/svg+xml`.
- Generated catalog metadata is committed; SVG bytes are lazy-loaded and cached, not committed or bundled.
- Existing workspace ownership, autosave, server-owned image assets, and freeform Canvas behavior remain unchanged.

## Next action

When this dirty working-tree batch is promoted, run the exact-head CI `Verify` check. Before visual handoff, capture the Home/loading/activity states, refreshed landing, Note toolbar, slash insert menu, and Canvas rail/panels at their intended viewports and resolve the blocked comparison in `design-qa.md`; browser automation was unavailable in this session.
