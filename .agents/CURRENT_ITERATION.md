# Current Iteration

## Active milestone

**Library Sidebar, Workspace Authoring & Frontend/Backend Contract Cleanup**

State: **implemented and verified; all requested automated gates passing.**

Delivered capability:

```text
Navigation & Deep-Link:
  → Direct URL access and browser reload on /categories/:id and /workspaces/:id
  → Real 404 on missing assets, API misses, or unknown paths (no blanket fallback)
  → Preserved backward compatibility for /projects/:id client route

Build & Verification Contract:
  → Single build contract: apps/web/dist/client built fresh before E2E and deployment
  → Design contract: static assertions for colors, tokens, radii, gradients, and terminology in tests/design-contract.test.ts (runs in ~500ms)
  → Streamlined critical E2E suite: 12 high-value browser journeys (navigation, multi-pane, references, search, study history) without visual bloat
  → Opt-in failure-only artifact hygiene (no screenshot pollution on green runs)
```

## Evidence

- Frontend static, unit, and design contract: `pnpm test` (24/24 pass), `pnpm lint` (0 warnings), and `apps/web` TypeScript compilation (0 errors).
- Production build: `pnpm build` passes cleanly, emitting fresh bundle with TanStack Start SSR & client manifests.
- Server verification: `task check:server` (gofmt contract, `go vet ./...`, and all `go test -race ./...` packages pass); targeted HTTP/project/study/persistence tests also pass.
- E2E was intentionally not run for this change; verification is limited to the requested unit/static checks.
- UX cleanup: compact fixed-width sidebar, inline create/rename with Enter-to-create and cancel-only controls, right-click actions, dashboard top bar reduced to the theme icon, accessible confirmation dialogs, and Uncategorized fallback for root workspace creation.
- Sidebar deletion consistency: after a workspace DELETE succeeds, the Sidebar removes the workspace from every already-loaded category cache before triggering the broader library refresh, so the deleted row cannot remain visible until a reload.
- Notifications: transient success and error feedback now uses one global Radix Toast provider with a compact right-bottom layout, Motion transitions, Lucide status icons, an explicit 4.2-second auto-dismiss timer, and a slim progress cue; inline notification banners are removed while destructive-action confirmation dialogs remain contextual.
- Popup behavior: manual menus, search results, study activity, slash commands, history, and toast notifications share one exclusive popup registry; outside pointer/focus interaction, Escape, or a new popup closes the previous one, and selecting an action closes the related native menu.
- Workspace authoring: a new workspace opens Note + Canvas in a horizontal split, with a quiet center resize handle and a flex-filled authoring area so the note editor uses the available pane height.
- Editable inputs: workspace creation, workspace rename, and note title inputs are borderless, without a bottom rule or focus ring, and are protected by static design assertions.
- Note controls: double-clicking a note title enters inline rename, the adjacent plus button creates a note, and note context menus expose moving the note into the active pane, rename, and delete actions.
- Note editing: Ctrl/Cmd+A selects the complete Tiptap document, Delete/Backspace removes the active selection, and selected text can be highlighted from the Note context menu through Tiptap Highlight marks.
- Note/backend mapping: a Go round-trip contract covers highlight marks, noteId-backed Canvas references, reload durability, and note deletion through the complete workspace snapshot update.
- Excalidraw integration: pinned through the `@excalidraw/excalidraw` alias to maintainer build `@dwelle/excalidraw` 0.5.0-b276327, which includes the native Draw to shape, Lasso selection, and Bucket fill tools in the Excalidraw toolbar, while retaining Load, Save as image, Export, Command palette, Search, Help, image, background, and clear-canvas controls; navigation uses the preview API's `setViewport`.
- Excalidraw stability: kept the UI options, lifecycle callbacks, and custom toolbar renderer referentially stable, and normalized external scene signatures to persisted elements/viewport state so Workspace rerenders do not reconfigure the editor or replay scene updates while drawing; a static regression contract protects the single-instance lifecycle.
- Image persistence: clipboard screenshots in Notes and Canvas are normalized in the browser, stored in a workspace-scoped IndexedDB asset vault, rendered through local object URLs, and stripped from server-bound snapshots; the local asset guard rejects images larger than 8 MiB after normalization.
- Note sizing: authoring, pane group, pane, editor, and Tiptap content now form an explicit full-height chain; the editor scrolls its content instead of collapsing to a short container.
- Note overflow: the note editor now fills the pane height through an explicit flex-column chain, scrolls internally once content reaches the bottom, and hides the scrollbar track while preserving wheel/keyboard scrolling.
- Selection actions: after selecting a Note block or Canvas element, right-clicking that surface opens contextual `Send to Canvas` / `Send to Note` actions plus linked navigation; the floating context bar is removed. Canvas pane actions include `Open note`, `Maximize pane`, and `Close pane`; `Open note` focuses the existing Note pane or creates a split Note pane when needed.
- Link discoverability: right-clicking any Note or Canvas surface now exposes the linking action even before a target is selected; disabled states explain whether the user must select a Note block or Canvas object, labels are consistent (`Link selected object to note` / `Link selected block to Canvas`), and submenu chevrons make the nested target picker visible.
- Block identity lifecycle: newly-created and promoted Notes receive a stable paragraph `blockId`; existing Note documents are normalized on workspace load and scheduled once for persistence, so Link to note does not depend on the user typing first.
- Maximize menu overflow: the pane action popup is viewport-anchored in maximize mode with safe edge offsets and bounded scrolling, so the canvas cannot clip it at the screen edge.
- Focus mode: maximizing a pane hides the workspace top bar and expands the authoring surface to the viewport; the study timer remains available as a fixed floating control with its own unclipped detail popover.
- Canvas-only menu: pane actions anchor from the left on the Canvas header and are bounded to the viewport on narrow screens, preventing the menu from being clipped at the screen edge.
- Split focus mode: Note pane actions can maximize the nearest split node as a group, preserving all split children and their ratio; Escape or Restore layout exits either pane or split focus mode.
- Favicon: root metadata registers the lightweight steel-blue Notespace SVG favicon at `/favicon.svg`.
- Legacy cleanup: removed the obsolete `apps/web/src/app` surface and unreferenced pre-library workspace/project CSS, including old splitter, view-switcher, card, and table selectors. The documented `/projects/:id` compatibility route and internal project identifiers remain intentionally preserved.
- UI foundation: web package now owns Tailwind CSS 4.3.3, Motion 13.2.0, Lucide React 1.41.0, and Radix Context Menu/Slot; shared primitives live under `apps/web/src/components/ui`.
- CSS ownership: reduced `apps/web/src/styles/globals.css` to Tailwind entrypoint, theme tokens, base reset, and accessibility-safe motion defaults; moved sidebar, dashboard, category, workspace, study, toast, loading, editor, and canvas rules beside their owning components, and removed the obsolete workspace responsive sheet. The design contract scans component styles and prevents feature selectors from leaking back into the global sheet.
- Tailwind setup: verified `tailwindcss@4.3.3` and `@tailwindcss/vite@4.3.3` are installed in the web package, kept the official Vite plugin, and removed the unnecessary legacy `@config` directive in favor of the v4 CSS-first `@import "tailwindcss"` and `@theme` setup. A contract test verifies the package, plugin, and entrypoint wiring.
- UI polish: the system `Uncategorized` category is visually differentiated and cannot be renamed/deleted, history/export menus shrink to their content without space-between gaps, the compact learning heatmap is no longer clipped, and route loading copy is operational rather than marketing copy.
- Backend mapping audit: all current frontend API calls map to existing Go routes; workspace notes, highlights, references, history/export, and study activity remain persisted through their existing owners. Browser-local layout/theme/image-vault state intentionally remains local and is not copied into authored snapshots.
- CI workflow: updated `.github/workflows/verify.yml` with `pnpm build` in frontend gate.

## Next action

STOP. Requested note, menu, activity, loading, Uncategorized, frontend/backend mapping, component-owned styling, and Excalidraw stability criteria are satisfied; no E2E was run per the cost constraint.
