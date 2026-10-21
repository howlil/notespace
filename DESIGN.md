# Notespace Design Contract

This file is the repository-level source of truth for user-facing design decisions. It complements `.agents/PROJECT.md`; it does not authorize new product scope.

## Decision order

Every visual change must follow this order:

`Product Intent → Information Hierarchy → Interaction Model → Visual Hierarchy → Components → Decoration`

Do not start from gradients, glass, cards, bento, animation, iconography, or a fashionable component style and then force the product to fit it.

## Product intent

Notespace is a focused self-hosted knowledge workspace for writing and spatial thinking. The interface should make it easy to:

1. resume recent work;
2. find knowledge quickly;
3. browse large categories progressively;
4. enter a workspace and focus on authored content.

The UI is not a marketing site, analytics dashboard, generic SaaS admin, file explorer, or AI productivity template.

## Canonical hierarchy

### Home

Priority order:

1. resume/search;
2. recent workspaces;
3. category summaries;
4. progressively disclosed category contents;
5. secondary activity history.

Home may use a collapsible library sidebar. It must not duplicate the same navigation/action hierarchy in several competing surfaces.

### Inbox

Inbox is the zero-organization capture surface for standalone tasks. A task in Inbox has no Workspace and no `plannedFor` date. Keep Inbox deliberately temporary and low-ceremony: capture, rename, delete, or move to Today. Do not add milestones, priority, due dates, recurrence, timers, analytics, or a second backlog hierarchy here. Workspace-owned work remains in Workspace Plan and must not be duplicated into Inbox.

### Today

Today is a lightweight execution projection, not a second workspace system. It combines tasks explicitly chosen for the local calendar day, whether they belong to a Workspace Plan or are standalone. Keep it list-first and context-preserving: workspace-owned tasks retain a visible path back to their workspace, while standalone tasks remain clearly distinguishable.

Activity sessions are observed time, separate from task planning. A session may link to a task and Workspace or remain standalone. Workspace Plan tasks may start an Activity directly; Today is an optional execution projection, not a prerequisite for doing planned work. Starting an activity must not require creating or organizing a task first. Activity type is deliberately coarse: Build, Learn, Read, Write, Exercise, or Other. Starting from a Workspace must ask for that coarse type instead of silently classifying all Workspace time as Learn; the Workspace supplies context, not activity meaning. Starting from a task in Today or Workspace Plan must also choose its own type explicitly; a standalone Quick Activity selection must never leak into task classification. Keep the timer global: at most one browser-owned activity may run at a time. Ending a task-linked Activity may offer an explicit task-completion handoff, but must never auto-complete the task; one task may require multiple sessions. Task-completion handoff in both Workspace and Today must resolve the current task state/version before offering completion so stale session or projection context cannot overwrite a newer task edit. While that handoff is pending or being resolved, a new Activity must not start or replace the unresolved decision.

Today must not become a calendar, backlog dashboard, habit tracker, kanban board, priority matrix, or productivity score. Choosing a task for Today is planning intent, not a due date. Unfinished work planned on an earlier day remains visible as carried forward until it is completed, explicitly removed from Today when workspace-owned, or deleted when standalone. Removing a workspace task from Today must not delete the underlying task.

### Workspace cards

Workspace cards retain the compact square paper-stack composition used by the library. The card background is the cobalt-blue `--accent` field, which acts as the visual accent behind the paper preview. Workspace identity and metadata sit in a translucent `--surface` panel with a restrained backdrop blur and a quiet light edge. Keep the glass treatment limited to this metadata layer so the card remains scannable and the rest of the white-mode interface stays calm.

### Category detail

A category detail page exists for scale. Prefer dense rows, search/filter/sort, bounded pagination, and predictable actions over a large collection of decorative cards.

### Workspace

The workspace is the focus surface. It does not retain the Home/library sidebar. Note, Canvas, and Split are authored views of the same workspace, not separate top-level products. Plan is a workspace-owned secondary execution surface for milestones and concrete tasks; it is not a pane, dashboard, kanban board, or replacement for authored content. Keep Plan outline-first, compact, and progressively disclosed. Focus mode may hide workspace chrome, but must remain immediately reversible.

### Border-only Workspace implementation

Workspace authoring is a **full-bleed, border-only** focus surface. The 40px vertical Workspace rail is its only application-level navigation; the active Canvas/Note/Split authoring panes occupy the adjacent content region. Do not wrap authored panes in cards, apply outside gutters, place decorative shadow behind editor panes, or change the source-of-truth editor behaviors. Preserve editor-internal reading padding and user-authored Canvas objects: they are content, not decorative cards.

- M1: Workspace Web uses a single 40px left rail from application top to bottom with 1px `--line` border-right. Top: Back to Library. True vertical center: Canvas, Note, Split, Plan. Bottom: Activity and Focus (same existing runtime and pane maximize state). No horizontal workspace view switcher, Workspace switcher, Guide, Settings, logo, or Saved text in chrome; Saved remains an accessible live status and failure toasts remain visible. M2: Desktop custom chrome places the Workspace rail in a 40px full-height left grid column, with the 38px titlebar solely in the adjacent right column. The same React-owned rail is portaled into the shell; native-decorations fallback keeps in-page rail. Focus collapses the full-height rail column. Library/Inbox/Today chrome remains unchanged. See `docs/design/workspace-rail-note-toolbar-refactor.md` for the approved full M1–M5 design freeze.
- Canvas and Note occupy contiguous panes. The split owns a 7px **interactive hit area** with a visually centered 1px `--line` divider. Preserve pane state, draggable and keyboard resizing, orientation change on compact viewports, focus/maximize, pane limit, and the persisted ratio clamp.
- Note header remains 34px. The Note title selector supports inline rename (double-click/F2), with permanent + New Note outside its dropdown; each dropdown row owns a visible Delete icon. M4 consolidates permanent Find/Outline buttons into one Navigate popover (Outline when blank, Find & Replace when querying); the permanent Code Block header action is removed, while slash and contextual Code Block actions remain. Pane Actions owns only Split right, Split down, Close pane; linked Canvas Note action remains available. Preserve Tiptap reading padding, editable content, autosave/conflict recovery, popup keyboard behavior, and focus visibility.
- Canvas keeps its existing Excalidraw tools/actions and custom Notespace chrome. Tool rail is a compact floating island centered 8px above the Canvas bottom; view controls are a floating outlined island inset 8px from the top/right. Keep both rounded, bordered, shadow-free and viewport-contained, including narrow layouts. Selection/context overlays may remain layered over Canvas where their interaction requires it, but carry no decorative shadow.
- Plan stays a full-workspace, **secondary outline surface**, not a pane in Split. Milestones, tasks and loose tasks are structured as compact rows with dividers, not tiles. Keep its API, activity, completion and deletion behaviors.
- Use existing semantic tokens (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--tint`, `--canvas`) and Open Sans. Preserve light/dark theme, 32px compact icon controls, and focus affordances. Workspace-scoped popups use borders and `shadow-none`; unrelated Home, dialogs, and the intentionally different Library workspace-card composition retain their contracts.
- Responsive and native desktop behavior are distinct projections of the same behavior. No layout changes may disable a user move, conceal recovery/status messages, or introduce another source of truth for editing state.

Acceptance: each view remains reachable, content and autosave survive switches, split ratio can be changed by pointer and keyboard, narrow widths do not clip critical controls, Canvas and editor tools remain operable, Plan milestone/task workflows remain intact, and there are no decorative cards/shadows/gutters around Workspace authored panes. Re-check web and desktop independently.

### Linked Note artifacts on Canvas

Canvas may reference Notes from the same Workspace as live linked artifacts. The Note remains the source of truth; Canvas stores only the Note identity plus presentation state such as compact versus preview mode. Do not copy Note title or document content into Canvas persistence.

A linked Note artifact must preserve spatial context:
- single click selects the Canvas object;
- double click or the artifact action opens the linked Note while keeping Canvas visible when possible;
- preview content is derived from the current Note state;
- deleting the Canvas artifact never deletes the Note;
- deleting the Note leaves an explicit unavailable reference rather than silently retargeting it;
- a Note that is linked on Canvas exposes a path back to the Canvas object.

Use the existing Canvas persistence boundary and Excalidraw element custom data for this relationship. Do not revive the legacy workspace `references` wire field for linked Note artifacts.

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
| `--tint` | `#EAF0FF` | `#23345A` | Hover background, active background, selected rows, and soft emphasis |
| `--button` | `#26262F` | `#E6E6ED` | Primary action background |
| `--button-text` | `#FFFFFF` | `#22232A` | Text and icons on the primary action |
| `--danger` | `#B13E4B` | `#FF9AA5` | Destructive actions and error state |
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
- Dark accent/focus: `#91B1FF` (`--accent`); dark active tint: `#23345A` (`--tint`).
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
- The web and Astro landing `public/brand` copies must remain byte-identical; `NotespaceLogo` owns application logo rendering. Existing Foldling files are temporary legacy assets, not active brand references.
- Preserve the real 6/8/12/18px radius hierarchy, compact icon controls, neutral-first primary buttons, border-only Workspace and user-authored Canvas colors. Do not add decorative foxes to editor or Canvas tool chrome.
- Before replacing desktop `.ico`, `.icns` and `.png` packaging assets, regenerate all resolutions from the reviewed master logo and run native desktop acceptance. The binary icon update is a separate release-sensitive step.

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
