# Notespace Landing: Showcase Contract

Status: current landing contract, implemented in `landing/src/pages/index.astro` and `landing/src/styles/showcase.css`. The earlier ambient and marquee versions remain in git history.

## Intent

Get a visitor to download the Windows beta or run Notespace with Docker by showing the product working. The page is white, flat and product-led. Every visual is a mock of a real Notespace surface, and every label comes from the app source or the README.

## Composition

| Section | Shows | Source of truth |
| --- | --- | --- |
| Hero | Product window: Explorer, Canvas diagram, Quick Open loop, runnable code | `QuickOpen.tsx`, `canvas-tool-catalog.tsx`, `CanvasCodeBlockActions.tsx` |
| Canvas | Shapes, component palette, runnable code with language picker, HTML preview | `DiagramPalette.tsx`, `diagram-catalog.ts`, `code-language.ts`, `HtmlPreviewFrame.tsx` |
| Library | Categories and paged workspace views | `LibrarySidebar.tsx`, `WorkspaceLibrary.tsx` |
| Saving | Save states, same-browser tab sync, conflict recovery | `WorkspacePage.tsx`, `CanvasConflictRecovery.tsx` |
| Vault | Library ZIP backup, all-or-nothing restore, Trash | `LibraryTools.tsx` |
| Desktop | Settings window with a live theme switch, unsigned beta note | `AppSettings.tsx`, README |
| Self-host | Compose command and three specs | README |
| Close | Download and self-host CTAs | none |

The HTML preview claim rests on `sandbox="allow-scripts"` in `HtmlPreviewFrame.tsx`. The JavaScript claim rests on the Worker in `code-runner.ts`.

## Copy rules

- Describe shipped capability only. Do not mention Notes, Split View, Focus Mode, Tiptap, Markdown import, or AI. Canvas Note cards are not shipped.
- Sync is same-browser multi-tab only. Make no multiplayer or cross-device claims.
- Keep text to a heading and at most one short line per section. Mock labels come from the app. Workspace names and sample values are illustrative.
- `landing/tests/hero.test.mjs` checks each shown label against the app file that defines it, and checks the self-host commands against `README.md`.

## Download behavior

Every Windows download CTA carries `data-notespace-windows-download` and links the verified MSI. Exactly five exist: nav, hero, mobile menu, desktop and closing. A small client script refreshes them to the newest published MSI through the public GitHub Releases API. The static link is the fallback. The installer is unsigned, and the copy says so.

## Style

- Tokens are scoped to `.nsx` in `showcase.css`. `global.css` is unchanged.
- Page chrome: white background, ink `#0c1020`, muted `#555f75`, dim `#6b7287`, soft panel `#f6f7fb`, hairline borders. Cobalt `#2858d8` is the single accent and is used for buttons and accent text only.
- Mock tokens copy the app's light values from `apps/web/src/shared/styles/globals.css`. The Windows window switches to the app's dark values through `data-mode`.
- Code colors copy the IntelliJ Light palette from `apps/web/src/domain/code/code-theme.ts`.
- Type: Geist via `@fontsource/geist` (400, 500, 600). Display is 96px at most, tracking -0.035em (floor -0.04em). Body measure is at most 60ch.
- Elevation is one hairline border per surface. No shadows, blur, glass, gradient text or colored side stripes.
- Motion: the pen draw-in in the hero, the Quick Open typing loop and the caret blink. All of it stops under `prefers-reduced-motion`.

## Known gaps

- The app sets Open Sans; the mocks use Geist. Adding Open Sans is a dependency change and needs approval.
- The Windows install path and the Cloudflare deployment are not verified by this change.

## Verification

```sh
cd landing
bun run build
node --test tests/windows-release.test.mjs tests/hero.test.mjs tests/workers-root.test.mjs
```

Browser check at 1440px and 390px: no horizontal overflow, the mobile menu opens, the theme switch flips the Windows window, and "Use saved Canvas" arms the discard step.
