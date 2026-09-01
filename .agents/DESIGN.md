# Notespace — Product Design and Interaction Rules

This document defines the current design intent for Notespace.

Reference Figma exploration:

`https://www.figma.com/design/qS29iOvAMP0MDeS8YJpTIY`

The Figma file is a product-shape and visual reference. Repository behavior and explicit user decisions remain authoritative when they diverge.

---

# 1. Design thesis

Notespace should feel like a **calm local-first thinking workspace**.

The interface exists to keep the user close to project content. It should not resemble:

- a SaaS analytics dashboard;
- a generic AI productivity app;
- an enterprise admin portal;
- a decorative glassmorphism showcase;
- two unrelated editors placed side-by-side.

The dominant product idea is:

```text
one Project
   ↓
write linearly + think spatially
```

The UI must continually reinforce that relationship.

---

# 2. Visual character

Preferred characteristics:

- quiet;
- precise;
- editor/tool-like;
- content-forward;
- modern without trend-chasing;
- strong hierarchy with restrained decoration;
- white/light and dark mode capable;
- subtle material depth where it clarifies floating controls or modal hierarchy.

Avoid “AI slop” patterns:

- giant gradient blobs;
- neon purple glow everywhere;
- gratuitous shine;
- excessive blurred glass cards;
- oversized rounded cards without information hierarchy;
- random pastel gradients;
- decorative sparkles;
- overly friendly marketing copy inside the product;
- unnecessary dashboards/widgets.

Use visual effects only when they communicate layer, focus, selection, or hierarchy.

---

# 3. Current visual foundation

The current design exploration uses:

## Typography

Primary direction: **Geist**.

Typography should feel technical, neutral, and compact enough for an editor.

Use hierarchy through weight, size, spacing, and contrast before adding decorative treatment.

## Surfaces

Light mode direction:

```text
Application background   → off-white / very light cool gray
Primary content surface  → white
Canvas surface           → subtly differentiated cool surface
Floating utilities       → white/elevated surface
Primary action           → near-black
Accent                   → restrained violet
Success/health           → restrained green
Danger                   → restrained red
```

Do not hardcode these descriptions as arbitrary one-off colors throughout the codebase. Establish design tokens when implementation begins.

## Radius

Current direction: approximately 10–14px for cards/modals/floating controls, with smaller radii for compact controls where appropriate.

Use radius consistently by component category.

## Elevation

Use low elevation.

Good candidates:

- floating canvas toolbar;
- contextual text toolbar;
- modal/dialog;
- command palette/project switcher;
- project card hover where useful.

Avoid shadows on every container.

---

# 4. Information architecture

The user-facing hierarchy should remain shallow.

```text
Notespace
├── Project library/dashboard
├── Project workspace
└── Settings
```

Current dashboard navigation exploration includes:

- Home;
- Projects;
- Templates;
- Favorites;
- Trash;
- Settings.

However, `Home` and `Projects` overlap conceptually. Treat their final separation as an open product decision. Do not build complex independent navigation architecture until their roles are defined.

Do not introduce separate global navigation items for `Notes` and `Canvases`.

---

# 5. Dashboard design

## Purpose

The dashboard exists to help the user resume or begin work quickly.

Priority order:

1. find recent Project;
2. search Project;
3. create Project;
4. browse all Projects;
5. secondary organization such as favorites/trash/templates.

## Layout

Current desktop direction:

```text
┌───────────────┬──────────────────────────────────────────────┐
│ notespace     │ Search                         + New Project │
│               ├──────────────────────────────────────────────┤
│ + New Project │                                              │
│               │ Your projects                                │
│ Home          │ Write, sketch, and connect ideas...           │
│ Projects      │                                              │
│ Templates     │ Recent                                      │
│ Favorites     │ [Project] [Project] [Project] [+]            │
│ Trash         │                                              │
│               │ All projects                                 │
│               │ [project table/list]                         │
│ self-hosted   │                                              │
│ status        │                                              │
│               │                                              │
│ Settings      │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

## Project cards

A project card should communicate the whole Project, not one editor type.

Use a compact preview that can show hints of document and canvas content together.

Current exploration uses subtle per-card surface differentiation rather than loud category colors.

Project cards should contain only useful metadata, for example:

- project title;
- last modified;
- optional favorite state;
- overflow menu.

Avoid large tag clouds or status badges unless they serve an actual workflow.

## Empty dashboard

The first-run state should explain the core product model in minimal language:

> Create a project to write and draw in one workspace.

Do not overwhelm first-run users with templates, onboarding tours, upgrade prompts, or setup checklists unless proven necessary.

---

# 6. Project workspace design

The workspace is the primary product experience.

## Shell

```text
┌─────────────────────────────────────────────────────────────┐
│ ‹  Project Title  ›                         ◷ timer      ⋯  │
├───────────────────────┬─────────────────────────────────────┤
│                       │                                     │
│ document surface      │ canvas surface                      │
│                       │                                     │
│                       │      floating canvas tools          │
│                       │                                     │
│                       │                                     │
│                       │                                     │
│ text tools            │                                     │
└───────────────────────┴─────────────────────────────────────┘
                        ↑
                   draggable splitter
```

The shell belongs to Project, not either editor.

Project-level controls include:

- previous/next Project where supported;
- title/project switcher;
- timer;
- overflow/project actions.

## Split pane

The center splitter must feel directly manipulable without dominating the screen.

Expected behavior:

- drag horizontally to resize;
- allow practical minimum widths;
- support document-focus and canvas-focus states;
- persist split preference when product behavior requires it.

Use one layout model rather than separate screen implementations.

## Document surface

The document side should prioritize readable line length and writing focus.

Avoid surrounding every paragraph/block with cards.

Callouts such as `Key idea` may use a subtle accent surface because they carry semantic emphasis.

Text formatting controls should remain secondary to writing.

A floating/contextual text toolbar is preferable when it reduces cursor travel and visual noise, but the exact behavior remains open until the document editor is selected.

## Canvas surface

The canvas should feel spatially open and visually lighter than the document pane.

The Excalidraw toolbar should read as a floating utility layer, not as a page header.

Use elevation/border subtly to distinguish it from canvas content.

Do not wrap the entire Excalidraw area in decorative containers that reduce usable canvas space.

## Surface relationship

Differentiate document and canvas enough that users understand the interaction mode, but keep them visually related.

A useful pattern is:

```text
Document → white reading/editing surface
Canvas   → slightly cooler neutral spatial surface
```

The difference should be functional, not branding-heavy.

---

# 7. Focus modes

Document-focus and Canvas-focus are states of the same Project workspace.

Do not make them separate routes or separate content documents unless the product requires shareable/deep-linked modes later.

Expected design behavior:

- transition should preserve project state;
- returning to split mode should not lose editor/canvas state;
- focus mode should reduce chrome rather than add new controls.

---

# 8. Modal and overlay system

Current state designs include:

- New Project;
- Project Switcher;
- Command Search;
- Focus Timer;
- Import Project.

Use a consistent layering model:

```text
workspace
   ↓
soft scrim
   ↓
floating surface
   ↓
clear title/content/actions
```

## Modal rules

- one clear primary action;
- secondary cancel/back action is visually quieter;
- avoid multiple equally prominent buttons;
- title explains the task, not marketing value;
- helper copy should be brief and operational;
- destructive confirmation must explain consequence.

## Command/search palette

Search and command interaction should optimize keyboard use.

Potential sections:

- recent Projects;
- matching Projects;
- actions such as Create Project, Import, Settings.

Do not turn the palette into a second navigation architecture.

---

# 9. Focus timer design

The timer is intentionally lightweight.

Header representation should be compact:

```text
◷ 24:32
```

Expanded state may show:

- current Project;
- remaining/elapsed time;
- Pause/Resume;
- Finish.

Do not add streaks, productivity scoring, charts, badges, or gamification without a separate product requirement.

---

# 10. Settings design

Settings should feel like local application/instance configuration, not account administration.

Current structure:

```text
General
Storage & Backup
Import / Export
Instance
```

Avoid duplicated `Settings` labels in both sidebar hierarchy and main content when they provide no orientation benefit.

## General

Examples:

- Theme;
- Default split;
- Restore last Project on launch.

## Storage & Backup

Examples:

- storage backend/status;
- data directory where useful;
- backup schedule;
- Backup now.

## Import / Export

Keep portability visible and understandable.

## Instance

Present operational facts compactly:

```text
● Healthy
Version
Database
Storage
Last backup
Data size
```

Instance status should be informative, not dashboard-like.

## Danger zone

Dangerous instance actions should be visually isolated.

Use red as semantic danger, not as a decorative accent.

Reset/clear operations require explicit confirmation.

---

# 11. Self-hosted status

A small instance-health indicator may appear near the bottom of dashboard navigation.

It must remain secondary to Projects.

Good:

```text
SELF-HOSTED
● Instance healthy
v0.1.0 · local storage
```

Bad:

- giant server metrics widget;
- persistent storage graphs;
- upgrade status occupying primary content area.

Detailed runtime information belongs in Settings/Instance.

---

# 12. Dark mode

Dark mode is part of the design direction.

Do not implement it by simply inverting colors.

Preserve hierarchy:

- application background;
- primary content surface;
- canvas surface;
- border/elevation;
- primary/secondary text;
- semantic accent;
- selection/focus states.

Test Excalidraw/editor integration explicitly in dark mode because embedded editors may have their own theme systems.

---

# 13. Interaction hierarchy

Use this priority model:

```text
content
  ↓
current task controls
  ↓
navigation
  ↓
settings/secondary utilities
```

Do not allow secondary actions to compete visually with editing content.

## Primary action

Near-black/strong button treatment is currently preferred for actions such as:

- New Project;
- Create Project;
- Import confirmation;
- Backup now where action emphasis is appropriate.

Avoid using the primary treatment for every button.

---

# 14. Accessibility

Accessibility is a product quality requirement, not polish.

At minimum:

- keyboard-accessible navigation and commands;
- visible focus states;
- semantic controls instead of clickable generic containers where possible;
- sufficient text/background contrast;
- minimum practical target size for interactive controls;
- tooltips/labels for icon-only actions;
- no color-only communication of critical state;
- screen-reader-friendly modal focus management;
- respect reduced-motion preferences if transitions/animations are added.

Excalidraw and the chosen document editor have their own accessibility characteristics; integration must not regress them.

---

# 15. Responsive behavior

No complete mobile product specification is committed yet.

Do not invent a complex mobile navigation model from desktop mocks.

For narrower web viewports, preserve the product invariant rather than forcing an unusable tiny split.

Possible responsive behavior may include switching between document and canvas surfaces while preserving one Project context, but exact behavior requires explicit design/acceptance criteria.

Desktop is the currently defined primary visual surface.

---

# 16. Motion

Use motion only to explain state changes.

Potential appropriate uses:

- modal/palette entrance;
- pane collapse/expand;
- project switch transition;
- subtle hover/focus feedback.

Avoid decorative continuous animation.

Motion should be fast enough to keep the tool feeling responsive.

---

# 17. Design implementation rules

When translating Figma to code:

1. Identify reusable tokens for color, typography, spacing, radius, elevation.
2. Reuse existing repository components before creating new ones.
3. Do not create a component abstraction solely because two elements look similar once.
4. Keep editor/canvas integration boundaries distinct from generic app shell components.
5. Verify at representative desktop sizes.
6. Compare implementation screenshots against the intended visual hierarchy, not just pixel values.
7. Test empty, loading, error, hover, focus, and disabled states where relevant.
8. Check dark mode when the touched component supports it.
9. Avoid visual scope expansion while implementing a functional feature.

---

# 18. Open design decisions

Require product evidence before hardening these:

- exact distinction between Home and Projects;
- whether Templates belongs in early scope;
- exact document formatting toolbar behavior;
- mobile/narrow viewport workspace behavior;
- whether project card previews are generated snapshots or lightweight composed previews;
- whether the focus timer is countdown-only or supports other modes;
- exact import UX for multiple formats.

Do not treat placeholders in exploratory mocks as committed functionality.
