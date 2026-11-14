# Notespace Design Contract

This contract defines the single-shell Welcome + Canvas navigation. The approved Welcome v3 and Canvas prototype are visual references. Runtime tokens in `apps/web/src/shared/styles/globals.css` remain authoritative. Canvas remains the only authored surface; issue #203 adds canvas-native Note Cards within that surface.

## Decision order

`Product Intent → Information Hierarchy → Interaction Model → Visual Hierarchy → Components → Decoration`

## Product intent

Notespace is a self-hosted, compact spatial knowledge workspace. Make finding a Workspace, editing its Canvas, and resuming focused work the shortest useful paths. Avoid extra top-level destinations, dashboard chrome, and duplicative navigation.

## Canonical navigation — single shell (planned)

- **One shell, two addressable content states:** `/` renders Welcome; `/workspaces/$workspaceId` renders the selected Workspace Canvas. They share the same application chrome, optional Explorer, Quick Open and Settings. This does **not** collapse distinct URLs or replace browser Back/Forward with local state.
- **Shell controls (#198):** one persistent Fox links Home; a separate labelled Show/Hide Explorer toggle remains available in browser and Tauri. The 38px header preserves brand/toggle position, Workspace identity and Quick Open. Settings stays in the Explorer footer and is reachable via Quick Open when closed.
- **Category-first Explorer:** only Categories and Workspace rows; no All workspaces link or global New workspace button. Category name/chevron disclose without navigation. Category-targeted plus creates there; F2/context menu renames, and every category has explicit View category. The protected legacy Uncategorized ID and Home creation/routes remain unchanged.
- **Dock/drawer:** the dock is 228px or zero, preserving mounted form drafts and pending operations. At <=760px the same panel overlays Canvas, closes on backdrop/Escape/navigation, and returns focus to the toggle. Hidden content is inert. Session-only desktop auto/open/closed preference is independent of transient mobile drawer state and resets to auto on reload; toggling never remounts or resets Canvas. Dialogs/menus take keyboard precedence. Width transition is 160ms with reduced-motion support.
- **Welcome, empty library:** only when the authoritative library has zero Workspaces, show a centered UIarc-inspired outline folder/Canvas illustration, “No workspaces yet”, brief next-step copy, one primary **Create Workspace** action and secondary **Restore backup**. Keep the illustration decorative, static and token-colored; no sample knowledge-map content or gallery tabs. Never treat loading, errors or an empty category as an empty library.
- **Welcome, existing library:** show the Notespace cobalt paper-stack Workspace cards, compact continue/resume entry, library search and creation actions. The Category Explorer remains available; selecting a category is addressable through `/?category=...`. No second dashboard, stats, activity feed or redundant navigation.
- **Workspace:** full-bleed Excalidraw Canvas is the only authoring surface. Its floating tool rail, Diagram palette and More tools retain the existing native Notespace SVG geometry and behaviors. Upper-right Canvas chrome keeps fit, zoom, and history as direct compact icon controls; **More canvas actions** opens only secondary view, background, library, file, export, navigation and help actions. Explorer is optional and can be toggled without leaving the selected Workspace.
- **Canvas Note Card (#203):** Note is a plain content card created and edited directly on Canvas. It has no standalone route, title field, icon, cover, header/footer or persistent toolbar. Selection is single-click; editing is double-click; creation focuses the editor; Escape exits editing. Text selection may expose a compact, viewport-clamped formatting control; slash menus and recovery state are contextual and dismissible. Geometry belongs to the Canvas instance, while canonical content is shared by Note identity. Read-only embeds/previews never mount another editor; missing targets state the condition without mutating content. Removing an instance does not delete its Note. Existing retirement-era DTOs and migrations remain compatibility history, not Note storage.
- **Removed from navigation:** standalone Note view, Split View, Focus Mode, Activity indicators/dock, and their switches/rails. No permanent page or navigation for these modes.
- **Global utilities:** Quick Open (`Ctrl/Cmd+K`), Settings, backup export/restore, Trash, confirmations, and Canvas conflict recovery remain reachable in both content states.
- **Desktop:** reuse the existing 38px titlebar/native window controls and one application shell. Avoid extra Workspace rail, duplicate branding or titlebar controls; browser and Tauri share product behavior.
- **Compatibility:** old links to a Workspace remain valid; legacy `?note=...` and `?block=...` query state is ignored because the Note editor no longer exists. Existing local pane-layout preferences may be ignored, never treated as authored data or destructively migrated. Preserve historical Activity/Task/Milestone records while rejecting pre-Canvas-only Note backups.

## Layout archetypes

| Surface | Ownership | UI contract |
| --- | --- | --- |
| Welcome (first-run) | Route + library feature | Same shell, centered outline empty state, Create/Restore entry, no Canvas tool rail |
| Welcome (existing library) | Route + `WorkspaceLibrary` | Same shell, existing cobalt paper-stack cards (max 196px, radius 18px), optional 228px Explorer |
| Workspace authoring | `WorkspacePage` + Canvas feature | Persistent shell, full-bleed Canvas, floating native tools, one Canvas options panel |
| Note editing | Workspace Canvas | Inline plain card; selected, editing, manipulating and recoverable save states; no separate route |
| Utilities | Settings, Quick Open, data/recovery | Overlays keep accessible focus and recoverable pending/error states |

## Workspace editor and Canvas contract

Preserve existing Excalidraw primitives, diagrams, code blocks, image assets, keyboard shortcuts, pan/zoom and undo/redo. Canvas is the sole authored content boundary. A Note card's geometry and typed identity reference are scene-owned; its versioned content is Note-store-owned. Read-only instances render semantic content without mounting another editor. Light/dark rendering uses semantic tokens; failed or conflicting saves retain the draft and expose recovery.

Keep Canvas granular autosave and conflict handling, blocking unsafe navigation/desktop close until pending Canvas snapshots are settled. Maintain a recoverable empty Canvas state; distinguish genuinely empty Canvas from content positioned offscreen (offer **Back to content** where applicable).

Preserve theme, Open Sans, the semantic tokens below, 4px spacing rhythm, 6px controls, 8px popup surfaces and low-elevation Canvas chrome. Use the approved outline empty state for a genuinely empty library; retain the existing Welcome resume/card composition when Workspaces exist. Keyboard, reduced motion, focus restoration and touch/pointer interaction must remain usable.

Canvas chrome has three explicit scopes: the left rail creates and selects content, direct upper-right controls own fit, zoom and history, the adjacent **More canvas actions** panel owns secondary view, background, library, file, export, navigation and help actions, and the contextual selection toolbar owns selected-object actions. Secondary tool overflow opens by click, keyboard focus, or touch—not hover—and exposes visible group labels and tool names. A secondary tool remains reflected in the rail after selection. Fit, zoom and history remain compact labelled icon controls aligned with the More trigger, not nested inside its popup. Canvas options opens vertically below More with its right edge aligned to that trigger; it stays scrollable but never exposes a scrollbar.

Tool defaults use compact vertical controls beside the active rail button, horizontal above the mobile rail. Idle Select has no property controls. Selected-object actions form a horizontal toolbar 4px above the selection bounds, clamped to the Canvas viewport; when there is no room above, it moves below. The toolbar exposes at most three type-sensitive quick actions. **More selected shape actions** contains actions not already visible, including applicable properties omitted from the quick controls. Batch properties display shared values or Mixed; multiple Pen strokes retain Pressure and multiple shapes retain Corners. A round stroke swatch distinguishes Colors from shape creation.

Contextual controls are temporarily hidden while an object is dragged, resized, rotated, edited, or has a native context menu open; they are not recreated after every gesture. **Code-specific exception (#199):** its single selected-object toolbar stays visible while editing/selecting source. It exposes Language, Show/Hide Output, Run/Stop, Copy and More instead of the generic three-action limit. The language trigger shows only its language name, with Auto/detection retained in its popup and tooltip. Language is searchable with Auto/detection and source-only capability labels; its popup is capped at 320px with a pinned search and scrolling list. Truncate the language value before clipping any of the five actions at 320px. Output exposes a tooltip and a visibly pressed state. Compact More uses a light/dark theme switch reflecting the resolved theme plus an Auto reset, and retains line numbers, UI-local wrap, auto height, native duplicate and delete. The card has no header/footer; optional output stays inside its native geometry, side-by-side at sufficient rendered width and stacked otherwise. Output never resizes the authored element or appears in source-only export. Selected source and output are focusable scroll regions with thin scrollbar affordances, so reading does not require editing; local pane scrolling preserves Canvas-owned modified-wheel pinch. Fit and source-only exports follow the UI-local wrap option without persisting it. Escape closes the popup before ending editing; toolbar focus does not discard source editing. HTML preview remains disabled until browser and WebView2 isolation is verified; JavaScript reuses the bounded Worker. Popup coordinates belong to a static outer container and only the inner content animates. Excalidraw's native context menu is the full-command surface: it retains an existing selection, selects an unselected target before opening, shares the action manager with keyboard commands, and closes on Escape without deselecting. Selection overflow keeps its entry point visible while the action list can scroll. Opening one overlay scope closes the other scopes. Escape restores its trigger; a new tool or selection closes stale properties without stealing pointer focus.

Workspace navigation keeps the application shell visible while destination data loads. Once the destination is ready, replace only the keyed authoring session; do not fade the whole page out before showing the next Canvas. The active Workspace indicator morphs within the persistent Explorer; categories stay visually neutral even when their Workspace list is shown.

## Visual direction

Default direction:

- clean, compact, minimalist, restrained, intentional;
- content-forward and editor/tool-like;
- low elevation and disciplined surface count;
- controlled spacing rather than oversized whitespace;
- clear alignment and grouping before borders/shadows;
- subtle motion only when it explains state or continuity;
- light and dark modes must remain coherent.

Glassmorphism or bento composition is allowed only when it has a clear semantic or structural job. Neither is a default styling recipe. Workspace library cards use a restrained cobalt-blue thumbnail field with a translucent, blurred metadata surface to separate identity from supporting details without changing the compact card hierarchy.

## Design tokens

These tokens describe the current Notespace implementation. The semantic CSS variables in `apps/web/src/shared/styles/globals.css` are the runtime source of truth; this section is the design-system reference for choosing them consistently. When a new token is needed, update this document and the runtime token definition in the same change.

### Token usage hierarchy

Use tokens in this order:

1. semantic CSS variables such as `var(--surface)`, `var(--ink)`, and `var(--accent)`;
2. shared UI primitives such as `Button`, `IconButton`, `Input`, `PopupSurface`, and `Dialog`;
3. Tailwind utility classes that express the documented scale;
4. a local value only when the component has a real geometry requirement that cannot be expressed by the shared scale.

Do not introduce a one-off hex color, shadow, radius, or animation duration inside a feature component when an existing semantic token already expresses the state.

### Color tokens

The application uses semantic colors so the same component can remain coherent in light and dark themes. Components should consume the token name, not the theme-specific hex value.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#F7F8FA` | `#18191D` | Application background and page canvas outside contained surfaces |
| `--surface` | `#FFFFFF` | `#202126` | Cards, panels, popups, inputs, and editor chrome |
| `--sidebar` | `#FFFFFF` | `#1C1D22` | Secondary navigation and low-emphasis workspace regions |
| `--canvas` | `#F8F9FC` | `#1D1E24` | Drawing surface behind Excalidraw content |
| `--ink` | `#252630` | `#E8E8EF` | Primary text, icons, and high-emphasis content |
| `--muted` | `#636979` | `#999BA9` | Supporting text, metadata, inactive icons, and hints |
| `--line` | `#E4E5EC` | `#34353E` | Dividers, input borders, panel borders, and quiet outlines |
| `--accent` | `#2858D8` | `#91B1FF` | Focus, selected controls, links, active icons, workspace card fields, and primary emphasis |
| `--tint` | `#EAF0FF` | `#223254` | Hover background, active background, selected rows, and soft emphasis |
| `--button` | `#26262F` | `#E6E6ED` | Primary action background |
| `--button-text` | `#FFFFFF` | `#22232A` | Text and icons on the primary action |
| `--danger` | `#B13E4B` | `#FF9AA5` | Destructive actions and error state |
| `--warning` | `#98651A` | `#F3BC6A` | Non-blocking warnings and partial operation results |
| `--danger-foreground` | `#FFFFFF` | `#22232A` | Readable text/icon on a filled destructive button |
| `--success` | `#4D765D` | `#8FC3A0` | Saved, completed, or healthy state; readable over light/dark tinted surfaces |

The Tailwind theme aliases map these semantics to utility names:

```text
bg-background  → --bg
bg-surface     → --surface
bg-sidebar     → --sidebar
bg-canvas      → --canvas
text-ink       → --ink
text-muted     → --muted
border-line    → --line
text-accent    → --accent
bg-tint        → --tint
text-danger    → --danger
text-success   → --success
bg-button      → --button
text-button-text → --button-text
```

Use `--tint` for a state that needs to be noticed without becoming a new visual layer. Use `--accent` for the foreground or outline that explains why the state is active. Active controls should normally combine both: tinted background, accent foreground, and a restrained accent ring when keyboard or selection clarity requires it.

### Typography tokens

Notespace uses Open Sans throughout the application. The available local weights are 400, 500, and 600.

| Token / usage | Value | Guidance |
| --- | --- | --- |
| `--font-sans` | `Open Sans, system-ui, sans-serif` | Default for body, controls, editor chrome, and Excalidraw UI |
| Body | `14px` | Default document and application text |
| Display / page title | `25–30px` | Use sparingly for Home or focused entry points |
| Section title | `12–14px`, weight 500–600 | Titles for contained sections and panels |
| Compact control | `11px`, weight 500 | Buttons, tabs, toolbar labels, and compact navigation |
| Supporting text | `9–10px`, weight 400–500 | Metadata, descriptions, shortcut hints, and helper copy |
| Icon caption | `8px`, weight 400–500 | Dense icon grids where the icon remains the primary signal |
| Primary weight | `500` | Default emphasis for controls and compact labels |
| Strong weight | `600` | Page titles, section headings, and selected state labels |

Text should be readable before it is decorative. Keep supporting copy short, use `text-muted` for hierarchy rather than reducing contrast arbitrarily, and preserve the `tabular-nums` treatment for changing numeric values such as zoom and counts.

### Spacing tokens

The layout follows Tailwind's 4px base spacing scale. The most common Notespace composition values are:

| Token name | Value | Typical use |
| --- | --- | --- |
| `space-0.5` | `2px` | Tight icon-to-label and grid gaps |
| `space-1` | `4px` | Small control gaps and compact rows |
| `space-1.5` | `6px` | Button padding, panel internals, and toolbar groups |
| `space-2` | `8px` | Standard control padding and popup gaps |
| `space-2.5` | `10px` | Comfortable compact row padding |
| `space-3` | `12px` | Panel padding and section separation |
| `space-4` | `16px` | Larger content groups and page rhythm |
| `space-5` | `20px` | Dialog or page-level separation |

Prefer the scale above over arbitrary spacing. Values such as 3px, 5px, 7px, and 9px are reserved for optical alignment in dense icon rails or brand geometry; they should not become general layout defaults. Large empty regions need a product reason and should not be used to make a surface appear more premium.

### Radius tokens

Rounded corners communicate component hierarchy, not decoration.

| Token name | Value | Current utility | Use |
| --- | --- | --- | --- |
| Control | `6px` | `rounded-md` | Buttons, inputs, rows, and shortcut badges |
| Surface | `8px` | `rounded-lg` | Popups, cards, toolbars, and contained panels |
| Dialog | `12px` | `rounded-xl` | Modal content and high-emphasis transient surfaces |
| Pill | `9999px` | `rounded-full` | Status dots, compact tags, and progress indicators only |
| Workspace identity card | `18px` | `rounded-[18px]` | Intentional square paper-stack library card exception, including its loading skeleton |

Ordinary controls keep the 6px `rounded-md` radius; standard popups use 8px `rounded-lg` rather than locally chosen 5px or 7px. The 18px paper-stack card is a documented brand component, not a general surface radius.

The Excalidraw adapter has its own engine-facing values to keep dependency UI aligned with Notespace:

```text
--border-radius-md: .5rem;
--border-radius-lg: .625rem;
```

These adapter values are intentionally scoped under `.notespace-canvas-surface .excalidraw`; they are not a reason to create a second application-wide radius system.

### Border and focus tokens

| Token name | Value | Use |
| --- | --- | --- |
| Default border | `1px solid var(--line)` | Surfaces, inputs, separators, and quiet outlines |
| Accent border | `1px solid var(--accent)` | Selected controls, active library state, and selected picker mode |
| Keyboard focus | `2px solid var(--accent)` with `3px` offset on buttons/links and `2px` on editable fields | Application buttons, links, inputs, and editable fields |
| Canvas focus | `2px solid var(--accent)` with `2px` offset | Excalidraw adapter controls and Canvas-owned tools |
| Active ring | Accent at low opacity | Additional clarity for an active tool without increasing saturation |

Focus is stateful feedback, not decoration. Do not render a persistent focus ring for every pointer interaction, and do not remove the keyboard path to make a component look cleaner. Borderless inline inputs still require visible keyboard focus; a transparent border alone is not sufficient. Disabled controls should communicate unavailability (`not-allowed`) rather than pretending to be processing (`wait`).

### Elevation and overlay tokens

Notespace is intentionally low-elevation. The Canvas rail and Canvas popups use `shadow-none` so the drawing surface remains calm and the hierarchy comes from placement, borders, and tint.

| Layer | Current value | Use |
| --- | --- | --- |
| Flat surface | `none` | Canvas chrome, Excalidraw islands, main content surfaces |
| Lightweight popup | `var(--shadow-popup)` = `0 12px 32px #0002` | Shared `PopupSurface`, context menus, workspace/document popups, and activity dock outside the Canvas |
| Dialog | Existing `shadow-2xl shadow-black/20` | Modal confirmation and dialog surfaces only |

Canvas overlay strata are local implementation tokens and should remain consistent:

```text
utility bar       → z-10
Canvas rail host   → z-100
tooltip portal     → z-200
Canvas panel       → z-1000
```

An overlay must still be positioned from its owning anchor. A larger z-index is not a substitute for correct placement, ownership, or dismissal behavior.

### Motion tokens

Motion should explain continuity: where a popup came from, which state changed, or which content is loading. It must never delay an action or make the interface feel theatrical.

| Token name | Duration | Easing | Use |
| --- | --- | --- | --- |
| Immediate control | `100ms` | `ease-out` | Shared button color, border, opacity, and press response |
| Tooltip | `120ms` | `ease-out` | Delayed contextual tool explanation |
| Canvas panel | `160ms` | `ease-out` | More, Details, and Diagram enter/exit |
| Canvas content | `140–180ms` | `ease-out` | Category navigation, grid refresh, and selected-diagram footer |
| Loading pulse | `1.4s` | `ease-in-out` | Skeleton and non-blocking loading feedback |
| Loading mark | `2.6–2.8s` | Cubic or `ease-in-out` | Brand mark breathing/float while a route is pending |
| Toast lifetime bar | `var(--toast-duration)` | `linear` | Progress indication only |

The root `MotionConfig` provides a default `160ms ease-out` transition for `motion/react`. Components may use a shorter duration when the state is local and immediate, but should stay within the ranges above. Common press feedback is a small transform (`scale(.97)` for controls and approximately `.985` for compact action rows), paired with color or tint feedback.

All motion must respect `prefers-reduced-motion: reduce`. The global stylesheet disables animation and transition in that mode, and motion components use the root `reducedMotion="user"` policy. Do not add an animation that has no reduced-motion-safe resting state.

### Responsive layout tokens

Breakpoints are content constraints, not device-label assumptions. These are the current thresholds used by the app:

| Threshold | Layout responsibility |
| --- | --- |
| `480px` | Collapse very narrow sidebar and toast layouts |
| `520px` | Compress category, study, and guide layouts |
| `560px` | Compact Home rows and workspace controls |
| `700px` | Adjust Canvas surface and workspace chrome |
| `760px` | Reduce workspace pane controls |
| `800px` | Switch dense workspace/editor control layouts |
| `1150px` | Reduce wide document-editor floating controls |

At narrow widths, preserve the primary action and keyboard access first. Canvas toolbars may become vertically scrollable with the visual scrollbar hidden, while popups remain viewport-clamped and anchored to their owning control.

### Component state tokens

App control size follows the established Tailwind `min-h-7` (28px) and `min-h-8` (32px) utilities. The compact native desktop titlebar may project a 30px control size because its 38px frame is an environment-specific constraint, not a second generic button size. The workspace view switcher uses 32px in the regular web header; avoid redundant competing `!important` declarations in the workspace CSS.


The standard interactive state grammar is:

```text
default   → surface/background + muted foreground
hover     → tint background + ink/accent foreground
focus     → accent outline with a restrained offset
active    → tint background + accent foreground + optional accent ring
pressed   → active state plus a short scale response
disabled  → muted/disabled color and approximately 50% opacity
danger    → danger foreground/background; never rely on color alone
success   → success icon or status text with a readable label when needed
```

Every interactive component needs an accessible name and a keyboard path. Icon-only controls must retain `aria-label`, and a tooltip is supplementary explanation rather than the only accessible name.

## Color and emphasis

Notespace is **neutral-first**. Writing and spatial thinking are the primary visual subjects; brand color supports navigation and interaction without competing with user-authored notes or Canvas content. Keep the approved restrained cobalt-blue identity:

- Light accent/focus: `#2858D8` (`--accent`); light active tint: `#EAF0FF` (`--tint`).
- Dark accent/focus: `#91B1FF` (`--accent`); dark active tint: `#223254` (`--tint`).
- Neutral backgrounds, ink, supporting text, and status colors remain the semantic tokens in the table above.

The brand accent colors theme-aware navigation, focus, selected states, and new diagram presets. Existing user-authored Canvas colors are content and must not be rewritten during a theme change.

### Color distribution

Use **80 / 15 / 5 as a visual composition heuristic**, not as a measured pixel quota or a requirement to recolor each screen:

- **~80% neutral working surfaces:** `--bg`, `--surface`, `--sidebar`, `--canvas`. Documents, notes, and Canvas should feel quiet and content-first.
- **~15% supporting hierarchy:** `--line`, `--muted`, `--tint` for grouping, metadata, dividers, and low-emphasis interaction states.
- **~5% accent:** `--accent` for brand recognition, selection, links, keyboard focus, and other meaningful active states—not broad decorative fills.

The ratio is evaluated by perceived emphasis across a representative screen; it is not a CSS budget. Purposeful workspace-card thumbnails and user-authored Canvas/document colors are contextual content, not justification for coloring the whole UI blue.

### Color ownership and component rules

Use this dependency direction when choosing colors:

```text
primitive values (centralized light/dark definitions)
  → semantic tokens (--bg, --ink, --accent, --tint, ...)
  → shared component variants and interaction states
  → page composition
```

The current runtime defines color values directly in semantic tokens; **do not introduce a parallel primitive-token layer solely to satisfy this diagram**. Components consume semantic roles, not copied hex codes.

- **Primary actions:** use neutral `--button` / `--button-text` by default, not an accent-blue button on every page. Filled destructive actions use `--danger` / `--danger-foreground` as a pair; never force white text for every theme.
- **Selected, active, or focused:** pair `--tint` with `--accent` where needed; preserve the shared keyboard focus outline. Hover uses restrained tint.
- **Destructive or success feedback:** use `--danger` or `--success` only for their state meaning; accompany color with clear text, icons, or labels when needed.
- **Exceptional fixed colors:** allowed for user-authored content, illustrations, syntax/data palettes, logos, or deliberate terminal previews; keep them scoped and document why a semantic token is unsuitable.
- Do not introduce additional accent hues, gradients, glow, neon, or decorative color noise into functional UI surfaces.

Emphasis should come primarily from information hierarchy, density, typography, spacing, and state—not saturation.

### Contrast and light/dark verification

- Target **WCAG AA**: at least **4.5:1 for normal text**, **3:1 for large text**, and **3:1 for essential non-text UI indicators** against adjacent colors where applicable. Evaluate actual rendered surfaces, including opacity and overlays.
- Check text, links, placeholders, inactive-but-readable labels, focus indicators, selected states, and Canvas controls in both light and dark mode. Decorative or disabled-only elements do not need to be forced into normal-text treatment.
- **Resolved baseline contrast:** light `--muted: #636979` targets at least **4.5:1** over `--surface`, `--bg`, `--canvas`, and `--tint`. The filled destructive button uses the theme-specific `--danger-foreground` rather than hard-coded white on the light pink dark-theme danger background. The design-token test also checks readable success status text in both themes; still verify overlays, alpha blends, and authored surfaces in the browser.
- Preserve the approved Cobalt / White Fox Spirit identity unless an explicit product decision changes it; brand illustrations never override semantic UI state colors.

### Fox Spirit brand asset contract

The approved rebrand uses **Cobalt `#2858D8` and White `#FFFFFF`** for the fox character. Functional components continue to use semantic tokens, not hard-coded brand values.

- `/brand/notespace-fox-head.svg` — compact rounded-square mark for navigation and wordmarks at 24–32px; consistent across light and dark UI.
- `/brand/notespace-fox-full.svg` — full-body mascot for marketing illustration and desktop app-icon source artwork. Keep outside authored Workspace panes.
- `/brand/notespace-fox-micro.svg` — reduced-details fallback used by `/favicon.svg` at 16–32px.
- The web and Astro landing `public/brand` copies must remain byte-identical; `NotespaceLogo` owns application logo rendering. Do not restore retired Foldling assets or use them for new app chrome.
- Preserve the real 6/8/12/18px radius hierarchy, compact icon controls, neutral-first primary buttons, border-only Workspace and user-authored Canvas colors. Do not add decorative foxes to editor or Canvas tool chrome.
- Before any native build or release, run `bun run desktop:icons` to regenerate ICO, ICNS and PNG packaging assets into ignored `icons/fox-spirit/` from the reviewed `notespace-fox-full.svg`; builds without regeneration must fail instead of using checked-in legacy icons. Windows CI verifies the actual EXE icon resource is cobalt Fox Spirit. Preserve `com.howlil.notespace` so MSI upgrades do not create a new application or orphan user data.

## Component and interaction rules

- Reuse existing tokens and interaction primitives before creating parallel component systems.
- Prefer Radix primitives for behavior-heavy controls when the repository already uses an applicable primitive.
- Interactive controls need an accessible name and keyboard path where applicable.
- Menus, dialogs, popovers, selects, and inline editing must expose state clearly without oversized framing.
- Prefer inline/seamless editing for lightweight rename/create actions when it reduces ceremony; do not add a modal merely because it is easy to implement.
- Destructive actions must remain explicit and recoverable/cancellable when the product behavior allows it.
- Do not use persistent focus rings as decoration; focus indication exists for keyboard accessibility and should be restrained but visible.
- Avoid redundant headers, breadcrumbs, section labels, cards, and wrappers that repeat context the user already has.

## Anti-slop rules

Reject UI that relies on any of the following without a concrete information or interaction purpose:

- giant gradient hero areas;
- neon glow or excessive blur;
- decorative sparkles/AI motifs;
- excessive glass cards or nested card-on-card framing;
- oversized rounded rectangles around ordinary content;
- bento grids used only to make a dashboard look modern;
- low-density dashboards that waste space;
- icon-heavy controls with unclear meaning;
- duplicate navigation or repeated actions;
- decorative metrics that do not change a user decision;
- motion that delays interaction or exists only for spectacle.

## Quality bar for design changes

A design change is not complete because the page renders or matches a screenshot. Verify the behavior and hierarchy affected by the change:

- primary action remains obvious;
- progressive disclosure still works;
- keyboard navigation/focus remains usable;
- light/dark state remains coherent when affected;
- foreground/background contrast and semantic color roles remain valid on the affected surfaces;
- narrow layout remains usable when affected;
- workspace focus is not diluted by library/dashboard chrome;
- destructive and error states remain understandable;
- no redundant surface was introduced merely to host a control.

Automated browser tests should protect stable interaction/design contracts, not exact pixels. Screenshots/traces are diagnostic evidence, not a substitute for product judgment.

## Change rule

When a requested visual change conflicts with this file, prefer the explicit current user instruction. Otherwise preserve this contract and make the smallest coherent design change that improves the requested user outcome.
