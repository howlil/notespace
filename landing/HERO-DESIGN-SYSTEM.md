# Notespace Landing: Showcase Contract

Status: current landing contract, implemented in `landing/src/pages/index.astro` and `landing/src/styles/showcase.css`. The earlier mock-based page remains in git history.

## Intent

A visitor should understand the product from the page alone, then download the Windows app or run the Docker server. Every visual is a real capture of the app at 1440px. Each section has one heading, one line of copy and one or two screenshots. Sections 01 to 09 read in order, so the scroll is the explanation. The feature list is the one text-dense block, because the brief asks for every feature to be defined.

## Composition

| Section | Shows | Source of truth |
| --- | --- | --- |
| Hero | Canvas with four service boxes, arrows and two code blocks (`canvas.webp`) | app capture |
| 01 Code | JavaScript output and an HTML preview (`code.webp`) | `code-runner.ts` (Worker), `HtmlPreviewFrame.tsx` (sandbox), `CanvasCodeBlockActions.tsx` |
| 02 Diagrams | Palette and placed components (`diagram.webp`) | `DiagramPalette.tsx` |
| 03 Canvas notes | A note on the canvas and its info panel (`note.webp`, `note-placements.webp`) | `CanvasNoteCardLayer.tsx`, `CanvasToolRail.tsx`, `NoteInfoPopover.tsx` |
| 04 Saving | Conflict dialog with four choices (`conflict.webp`) | `CanvasConflictRecovery.tsx`, `granular-save-core.ts` |
| 05 Library | Workspace grid and Quick Open (`library.webp`, `quick-open.webp`) | `WorkspaceLibrary.tsx`, `LibrarySidebar.tsx`, `QuickOpen.tsx` |
| 06 Backup and Trash | Data and backup tab with a Trash item (`data-trash.webp`) | `LibraryTools.tsx` |
| 07 Themes | Settings, General, in dark mode (`appearance-dark.webp`) | `AppSettings.tsx`, `theme-model.ts` |
| Feature list | Every shipped feature, grouped by the app's own labels | labels checked by `hero.test.mjs` |
| 08 Windows | MSI download, version, storage location | `README.md`, `src/lib/windows-release.mjs` |
| 09 Self-host | Compose command, password, health check | `README.md` |

Screenshots live in `landing/public/product/`. Each is 2160×1350 (a 1440×900 window at 1.5x), uncropped. The test reads each WebP header and checks the size and the alt text.

## Copy rules

- Describe shipped capability only. No Notes page, Split View, Focus Mode, Markdown import, Tiptap, AI, sign-in, or "open source".
- Control names are the app's own labels. `hero.test.mjs` checks each one against `apps/web/src`.
- Canvas notes are shown because they ship. Whether to market them is an open product decision.
- Multi-tab sync is same-browser only. Make no multiplayer or cross-device claims.
- Magic frame and Auto shape are in the tool catalog but unverified, so the page does not mention them.

## Download behavior

Every Windows download CTA carries `data-notespace-windows-download` and links the verified MSI. Exactly five exist: header, hero, mobile menu, Windows section, and closing. The static fallback is v1.0.3. A small client script swaps in the newest published MSI from the public GitHub Releases API. The installer is unsigned, and the copy says so.

## Style

- Warm white page with the Paper ink and the Paper accent (`--accent: #3252b6` in `globals.css`). The accent colors buttons and links only.
- Elevation is one hairline border per surface. No shadows, blur, filters or gradients.
- Type: Geist via `@fontsource/geist` (400, 500, 600). Body measure is at most 60ch.
- Motion is limited to button color transitions, and all motion stops under `prefers-reduced-motion`.

## Known gaps

- Phone screenshots scale to the column width, so app text is small on phones. `showcase.css` has the shortcut note.
- The app's UI font is Open Sans (`--font-sans` in `globals.css`); the page uses Geist. Matching it needs a dependency decision.
- The diagram palette is credited in the app as "Eraser" icons. The license is unverified, so the page names no catalog and shows no brand logos.
- The v1.0.3 release is published and lists `Notespace_1.0.3_x64_en-US.msi`. The CTA URL returns HTTP 200 through GitHub's redirect. The installer itself was not downloaded or run.
- Screenshots come from a scratch capture harness outside the repo, so the repo cannot regenerate them yet.
- Device recovery and the desktop shell (updater, close bridge) are desktop-only and cannot be captured in a browser.
- The "Saved" status shows only in the note focus view. No focus-view capture ships, because it repeats the note card in section 03.

## Verification

```sh
cd landing
bun run build
node --test tests/windows-release.test.mjs tests/hero.test.mjs tests/workers-root.test.mjs
```
