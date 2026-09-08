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
5. secondary learning activity.

Home may use a collapsible library sidebar. It must not duplicate the same navigation/action hierarchy in several competing surfaces.

### Category detail

A category detail page exists for scale. Prefer dense rows, search/filter/sort, bounded pagination, and predictable actions over a large collection of decorative cards.

### Workspace

The workspace is the focus surface. It does not retain the Home/library sidebar. Note, Canvas, and Split are views of the same workspace, not separate top-level products. Focus mode may hide workspace chrome, but must remain immediately reversible.

## Visual direction

Default direction:

- clean, compact, minimalist, restrained, intentional;
- content-forward and editor/tool-like;
- low elevation and disciplined surface count;
- controlled spacing rather than oversized whitespace;
- clear alignment and grouping before borders/shadows;
- subtle motion only when it explains state or continuity;
- light and dark modes must remain coherent.

Glassmorphism or bento composition is allowed only when it has a clear semantic or structural job. Neither is a default styling recipe.

## Design tokens

These tokens describe the current Notespace implementation. The semantic CSS variables in `apps/web/src/styles/globals.css` are the runtime source of truth; this section is the design-system reference for choosing them consistently. When a new token is needed, update this document and the runtime token definition in the same change.

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
| `--sidebar` | `#F1F2F6` | `#1C1D22` | Secondary navigation and low-emphasis workspace regions |
| `--canvas` | `#F8F9FC` | `#1D1E24` | Drawing surface behind Excalidraw content |
| `--ink` | `#252630` | `#E8E8EF` | Primary text, icons, and high-emphasis content |
| `--muted` | `#787B8A` | `#999BA9` | Supporting text, metadata, inactive icons, and hints |
| `--line` | `#E4E5EC` | `#34353E` | Dividers, input borders, panel borders, and quiet outlines |
| `--accent` | `#4F7396` | `#7FA6C9` | Focus, selected controls, links, active icons, and primary emphasis |
| `--tint` | `#E8EEF6` | `#1B2636` | Hover background, active background, selected rows, and soft emphasis |
| `--button` | `#26262F` | `#E6E6ED` | Primary action background |
| `--button-text` | `#FFFFFF` | `#22232A` | Text and icons on the primary action |
| `--danger` | `#B13E4B` | `#FF9AA5` | Destructive actions and error state |
| `--success` | `#6F947D` | `#6F947D` | Saved, completed, or healthy state |

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

Notespace uses Geist throughout the application. The available local weights are 400, 500, and 600.

| Token / usage | Value | Guidance |
| --- | --- | --- |
| `--font-sans` | `Geist, system-ui, sans-serif` | Default for body, controls, editor chrome, and Excalidraw UI |
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
| Keyboard focus | `2px solid var(--accent)` with `3px` offset | Application buttons, links, and inputs |
| Canvas focus | `2px solid var(--accent)` with `2px` offset | Excalidraw adapter controls and Canvas-owned tools |
| Active ring | Accent at low opacity | Additional clarity for an active tool without increasing saturation |

Focus is stateful feedback, not decoration. Do not render a persistent focus ring for every pointer interaction, and do not remove the keyboard path to make a component look cleaner.

### Elevation and overlay tokens

Notespace is intentionally low-elevation. The Canvas rail and Canvas popups use `shadow-none` so the drawing surface remains calm and the hierarchy comes from placement, borders, and tint.

| Layer | Current value | Use |
| --- | --- | --- |
| Flat surface | `none` | Canvas chrome, Excalidraw islands, main content surfaces |
| Lightweight popup | `0 12px 32px #0002` | Shared `PopupSurface` outside the Canvas |
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

Use neutral surfaces for most of the interface. The canonical secondary/accent family is restrained steel blue:

- dark accent/focus: `#7FA6C9`;
- dark active tint: `#1B2636`;
- light accent/focus: `#4F7396`;
- light active tint: `#E8EEF6`.

Do not introduce electric blue, purple-blue gradients, blue glow, neon accents, or decorative color noise without a product reason.

Emphasis should come primarily from hierarchy, density, typography, spacing, and state—not saturation.

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
- narrow layout remains usable when affected;
- workspace focus is not diluted by library/dashboard chrome;
- destructive and error states remain understandable;
- no redundant surface was introduced merely to host a control.

Automated browser tests should protect stable interaction/design contracts, not exact pixels. Screenshots/traces are diagnostic evidence, not a substitute for product judgment.

## Change rule

When a requested visual change conflicts with this file, prefer the explicit current user instruction. Otherwise preserve this contract and make the smallest coherent design change that improves the requested user outcome.
