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
