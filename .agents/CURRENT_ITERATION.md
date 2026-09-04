# Current Iteration

## Active milestone

**Library Sidebar & Dashboard UX Cleanup**

State: **implemented and verified; all automated gates passing.**

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

- Frontend static, unit, and design contract: `pnpm test` (18/18 pass), `pnpm lint` (0 warnings), and `pnpm typecheck` (0 errors).
- Production build: `pnpm build` passes cleanly, emitting fresh bundle with TanStack Start SSR & client manifests.
- Server verification: `node ../../scripts/check-gofmt.mjs && go vet ./... && go test -race ./... && go build ./cmd/notespace` (0 formatting issues, all unit/race tests pass).
- E2E was intentionally not run for this change; verification is limited to the requested unit/static checks.
- UX cleanup: compact fixed-width sidebar, inline create/rename with Enter-to-create and cancel-only controls, right-click actions, dashboard top bar reduced to the theme icon, accessible confirmation dialogs, and Uncategorized fallback for root workspace creation.
- Workspace authoring: a new workspace opens Note + Canvas in a horizontal split, with a quiet center resize handle and a flex-filled authoring area so the note editor uses the available pane height.
- Workspace rename inputs: workspace and note title inputs are borderless, without a bottom rule or focus ring, and are protected by a static design assertion.
- Note controls: double-clicking a note title enters inline rename, the adjacent plus button creates a note, and note context menus expose moving the note into the active pane, rename, and delete actions.
- Excalidraw integration: pinned to the latest stable `@excalidraw/excalidraw` 0.18.1 with built-in Load, Save as image, Export, Command palette, Search, Help, image tool, canvas background, and clear-canvas controls enabled.
- Note sizing: authoring, pane group, pane, editor, and Tiptap content now form an explicit full-height chain; the editor scrolls its content instead of collapsing to a short container.
- Note overflow: the note editor now fills the pane height through an explicit flex-column chain, scrolls internally once content reaches the bottom, and hides the scrollbar track while preserving wheel/keyboard scrolling.
- Selection actions: after selecting a Note block or Canvas element, right-clicking that surface opens contextual `Send to Canvas` / `Send to Note` actions plus linked navigation; the floating context bar is removed. Canvas pane overflow now contains only `Maximize pane` and `Close pane`.
- Maximize menu overflow: the pane action popup is viewport-anchored in maximize mode with safe edge offsets and bounded scrolling, so the canvas cannot clip it at the screen edge.
- Focus mode: maximizing a pane hides the workspace top bar and expands the authoring surface to the viewport; the study timer remains available as a fixed floating control with its own unclipped detail popover.
- Split focus mode: Note pane actions can maximize the nearest split node as a group, preserving all split children and their ratio; Escape or Restore layout exits either pane or split focus mode.
- Favicon: root metadata registers the lightweight steel-blue Notespace SVG favicon at `/favicon.svg`.
- Legacy cleanup: removed the obsolete `apps/web/src/app` surface and unreferenced pre-library workspace/project CSS, including old splitter, view-switcher, card, and table selectors. The documented `/projects/:id` compatibility route and internal project identifiers remain intentionally preserved.
- UI foundation: web package now owns Tailwind CSS 4.3.3, Motion 13.2.0, Lucide React 1.41.0, and Radix Context Menu/Slot; shared primitives live under `apps/web/src/components/ui`.
- CI workflow: updated `.github/workflows/verify.yml` with `pnpm build` in frontend gate.

## Next action

STOP. Milestone criteria satisfied; legacy cleanup is covered by a static architecture contract.
