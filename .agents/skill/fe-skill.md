# Notespace Frontend Skill

**Status:** CANONICAL FRONTEND IMPLEMENTATION RULE

**Scope:** Web application implementation for Notespace. The Web client is the current primary implementation target. The future Windows client uses Tauri as a thin desktop shell around the same Web application and must not create a second frontend architecture.

This skill complements:

- `.agents/README.md`
- `.agents/PROJECT.md`
- `.agents/ARCHITECTURE.md`
- `.agents/DESIGN.md`
- `.agents/MILESTONE.md` and `.agents/STATE.md`
- `.agents/QUALITY.md`

If this file conflicts with explicit user direction, stop and surface the conflict. Do not silently change the approved frontend stack.

---

# 1. Approved frontend stack

The Notespace Web frontend stack is committed as:

```text
TanStack Start
    ↓
React + TanStack Router
    ↓
Vite toolchain
    ↓
Tailwind CSS
    ↓
Radix UI primitives
    ↓
Zustand for justified client state
```

Approved technologies:

- **TanStack Start** — application framework and routing/runtime boundary for the Web client.
- **Vite** — build/dev toolchain used through the TanStack Start application setup. Do not create a second independent Vite app beside TanStack Start.
- **Tailwind CSS** — styling implementation.
- **Radix UI** — accessible low-level interactive primitives.
- **Zustand** — client-side shared state only where local React state, route/search state, editor ownership, or server/loader state is not the correct owner.
- **React + TypeScript** — application/UI implementation language and component model implied by TanStack Start.

Do not replace these with Next.js, Remix, React Router framework mode, Vue, Svelte, Angular, CSS-in-JS, Redux, MobX, Jotai, shadcn/ui as a framework layer, Material UI, Chakra UI, Ant Design, or another application/UI stack unless explicitly approved.

Using an isolated dependency for a concrete feature is not the same as replacing the stack, but every material dependency still follows `.agents/README.md` dependency rules.

---

# 2. Frontend objective

Build the smallest clear frontend that preserves the Notespace product model:

```text
Dashboard
   ↓
Project
   ↓
Unified Workspace
   ├── Document surface
   └── Canvas surface
```

The frontend must reinforce one user-facing content model:

```text
Notespace
└── Project
    ├── Document interaction
    └── Canvas interaction
```

Do not create separate top-level application concepts such as `Note`, `Canvas`, and `Project` as parallel resources.

The frontend is not merely a collection of pages. It is the interaction layer for the Project domain.

---

# 3. Monorepo placement

Current Web-first repository direction:

```text
notespace/
├── .agents/
│   └── skill/
│       └── fe-skill.md
│
├── apps/
│   └── web/
│       ├── src/
│       ├── public/
│       └── package.json
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

Do not create packages merely to make the repository look like a monorepo.

Use this extraction rule:

```text
one real consumer
      ↓
keep implementation local

second consumer OR hard dependency boundary
      ↓
consider package extraction
```

Do not pre-create:

- `packages/ui`
- `packages/domain`
- `packages/utils`
- `packages/hooks`
- `packages/config`
- `packages/platform`

unless a real ownership or reuse pressure exists.

Logical modularity comes before physical package isolation.

---

# 4. Preferred Web source organization

Organize around responsibility and product ownership, not file type symmetry.

Preferred conceptual shape:

```text
apps/web/src/
├── routes/                 # TanStack Start route entry points
│
├── app/                    # application shell / providers / composition
│
├── domain/
│   └── project/            # product-owned project concepts and rules
│
├── features/
│   ├── dashboard/
│   └── workspace/
│
├── integrations/
│   ├── canvas/             # Excalidraw adapter
│   └── document/           # selected editor adapter
│
├── platform/
│   ├── platform.ts
│   └── browser.ts
│
└── shared/
    ├── components/         # genuinely reused presentation pieces
    └── lib/                # small shared implementation helpers only
```

This is a responsibility model, not a requirement to create every directory before it has code.

Create directories when the first owned implementation exists.

Avoid generic dumping grounds such as:

```text
components/
hooks/
utils/
services/
stores/
```

at repository-wide scope when ownership can be more precise.

---

# 5. Dependency direction

Preferred direction:

```text
routes / app composition
          ↓
       features
       ↙      ↘
   domain    integrations
                ↓
        third-party editors
```

Platform capabilities remain separate:

```text
feature/application code
          ↓
     platform port
      ↙         ↘
 browser      Tauri later
```

Rules:

- domain code must not import TanStack Start route modules;
- domain code must not import Excalidraw;
- domain code must not import Radix UI;
- domain code must not import Tailwind concerns;
- feature components must not directly import Tauri APIs;
- persistence implementation must not leak ORM/database-specific objects into ordinary UI code;
- route modules should compose feature/application behavior, not become giant business-logic files.

---

# 6. TanStack Start rules

TanStack Start is the approved Web application framework.

Use its routing/data/runtime capabilities intentionally rather than reproducing another framework architecture inside it.

## Routes

Route modules own URL-level navigation and route composition.

They may:

- define route boundaries;
- validate route/search parameters;
- initiate route-level data loading where appropriate;
- compose feature screens;
- define route-level pending/error/not-found behavior.

They should not become the main location for:

- Project domain rules;
- editor adapter logic;
- large UI component implementations;
- unrelated shared state;
- direct database logic spread through routes.

Keep route files thin when behavior belongs to an owned feature or domain module.

## Route/search state

If state affects navigation, shareable URLs, or browser history, prefer route/search parameters over Zustand.

Examples that may belong in URL/search state when product behavior requires it:

- selected Project route identity;
- dashboard filters/search where URL persistence is useful;
- explicit view mode if navigation semantics require it.

Do not put every visual state in the URL.

## Server capabilities

TanStack Start can execute server-side code, but framework capability is not automatic architecture approval.

Until Notespace persistence/backend architecture is explicitly resolved:

- do not let ad-hoc server functions become an accidental permanent backend contract;
- do not mix database calls directly throughout route/UI code;
- preserve the persistence/application boundary defined in `.agents/ARCHITECTURE.md`;
- treat public API contracts, authentication, and deployment boundaries as material decisions.

Use TanStack Start server capabilities only when they satisfy the approved implementation slice and remain inside approved architecture boundaries.

## SSR / server rendering

Do not add SSR complexity merely because the framework supports it.

Notespace is an application workspace, not an SEO-first marketing site.

Use rendering modes based on actual product/runtime needs. Preserve browser correctness and avoid hydration-only architecture tricks that make the future Tauri WebView target fragile.

---

# 7. Vite rules

Vite is the approved build/dev toolchain through TanStack Start.

Do:

- keep one Web application build;
- keep browser development fast;
- use explicit environment boundaries;
- keep build configuration minimal;
- prefer standard Vite/TanStack patterns before custom plugins.

Do not:

- create a second standalone Vite SPA beside TanStack Start;
- introduce custom build pipelines without evidence;
- depend on Node-only globals in browser code;
- hide environment assumptions in arbitrary modules;
- make the build aware of Tauri unless the desktop integration actually requires it.

The future desktop shell should consume the Web application, not fork its build architecture.

---

# 8. Tailwind CSS rules

Tailwind is the styling implementation, not the design system itself.

The product design source of truth is `.agents/DESIGN.md`.

## Use semantic visual tokens

Prefer reusable CSS variables/theme values for product-level visual semantics such as:

- application background;
- primary surface;
- elevated surface;
- subtle border;
- primary text;
- secondary text;
- muted text;
- accent;
- danger;
- focus ring;
- spacing/radius values when they have repeated product meaning.

Tailwind classes should consume those semantics rather than scatter unrelated arbitrary colors across screens.

Prefer:

```text
product token
    ↓
Tailwind utility
    ↓
component
```

Avoid large amounts of one-off arbitrary values unless the design genuinely requires them.

## Class discipline

Do not abstract a component solely because its Tailwind class string is long.

Extract components when there is:

- repeated behavior;
- repeated product semantics;
- meaningful ownership;
- accessibility behavior worth centralizing;
- a clear reusable visual primitive.

Use a class composition helper only when it reduces real conditional-class complexity. Do not build a styling abstraction framework around Tailwind.

## Responsive behavior

Notespace is desktop-workspace oriented, but browser resizing must remain robust.

Test at least:

- normal desktop width;
- narrower desktop/laptop widths;
- split-pane minimum usable widths;
- overflow behavior for editor and canvas surfaces.

Do not silently collapse the product into a mobile UX unless mobile scope is explicitly added.

---

# 9. Radix UI rules

Radix UI is the approved primitive layer for accessible interactive controls.

Use Radix when its behavior matches the requirement, especially for primitives such as:

- Dialog;
- Dropdown Menu;
- Context Menu;
- Popover;
- Tooltip;
- Tabs when product behavior requires them;
- Toggle / Toggle Group when appropriate;
- Scroll Area only when native overflow is insufficient for the specific requirement;
- accessible focus-managed overlays.

Style Radix primitives with Tailwind according to `.agents/DESIGN.md`.

Do not treat Radix as a full visual design system.

Do not automatically add shadcn/ui. If a generated/shadcn-style component is proposed, evaluate it as source code owned by Notespace and add it only if it is the smallest correct implementation.

## Wrapper rule

Do not wrap every Radix primitive preemptively.

Create a Notespace wrapper when at least one is true:

- the same visual/behavioral contract is repeated;
- Notespace requires a product-specific accessibility/default behavior;
- the primitive requires repeated integration glue;
- the abstraction removes meaningful duplication without hiding useful Radix semantics.

Avoid an early giant `ui/` component library built before screens exist.

---

# 10. Zustand state rule

Zustand is approved, but it is **not** the default owner of all state.

Before creating or expanding a store, classify the state.

Use this decision order:

```text
Does one component own it?
        ↓ yes
local React state

Does navigation/history own it?
        ↓ yes
TanStack Router route/search state

Does editor/canvas library own transient interaction state?
        ↓ yes
keep it in the integration boundary

Is it server/loader/persistence data?
        ↓ yes
keep it in the data/application boundary

Is it cross-component client state with no better owner?
        ↓ yes
Zustand
```

Good potential Zustand use cases:

- cross-component workspace presentation state;
- temporary command-palette/UI coordination;
- application-level ephemeral state used by distant components;
- client-only state that genuinely requires shared ownership.

Potentially persisted presentation state such as split ratio may use Zustand only if it is the clearest ownership model and the persistence boundary remains explicit.

Do **not** use Zustand as:

- a database cache by default;
- a replacement for route loaders;
- a mirror of every server response;
- the canonical Project persistence model;
- a second full copy of Excalidraw scene state updated on every pointer movement;
- a second full copy of rich editor internals;
- a generic event bus.

## Store design

Prefer small stores by cohesive ownership rather than one global mega-store.

Avoid arbitrary slices merely to imitate Redux architecture.

Store actions should express meaningful state transitions, not expose unrestricted setter access everywhere.

Prefer selectors so components subscribe only to the state they need.

Measure before optimizing selector micro-performance.

---

# 11. React component rule

Components should reflect ownership.

Preferred hierarchy:

```text
route
  ↓
feature screen
  ↓
feature components
  ↓
shared primitives only when truly shared
```

Keep behavior near its owner.

Avoid:

- giant page components containing routing, persistence, editor integration, and presentation logic together;
- tiny one-line components created only for file-count symmetry;
- prop drilling solved prematurely with global Zustand state;
- context providers for every concern;
- effects used to synchronize state that can be derived directly;
- duplicated derived state;
- uncontrolled side effects during render.

Prefer derived values over duplicated synchronized state.

Use effects for external synchronization, not ordinary data derivation.

---

# 12. Project domain and UI boundary

The UI may consume product-owned Project types/use cases, but renderer/editor details must remain behind integration modules.

Conceptually:

```text
Project feature
    │
    ├── Document adapter
    │      ↓
    │   editor library
    │
    └── Canvas adapter
           ↓
       Excalidraw
```

For Excalidraw specifically:

- keep initialization/snapshot/change integration in `integrations/canvas` or equivalent ownership boundary;
- do not import Excalidraw types throughout dashboard/project/domain modules;
- do not make Excalidraw JSON equal to the entire Project domain;
- do not mirror high-frequency scene state through global React/Zustand state unless evidence proves necessary;
- preserve upstream upgradeability; do not fork during the current iteration.

Apply the same principles to the selected document editor once approved.

---

# 13. Browser-first, Tauri-safe rule

Current implementation focus is the Web client.

Every frontend feature in the current iteration should work in a normal supported browser without a Tauri runtime.

Do not write feature components like:

```text
component
  ↓
direct Tauri invoke/plugin API
```

Use:

```text
feature
  ↓
platform capability interface
       ├── browser implementation
       └── Tauri implementation later
```

Do not build platform abstractions before a real platform-specific capability exists.

When Tauri is introduced, likely platform-specific capabilities include:

- native file dialogs;
- filesystem integration;
- window behavior;
- notifications;
- updater;
- OS integration.

The ordinary Notespace Project UI should remain shared.

---

# 14. Design implementation rule

Follow `.agents/DESIGN.md`.

The frontend should feel:

- calm;
- precise;
- tool-like;
- content-forward;
- local-first;
- low-noise;
- dark-mode capable.

Preserve the established design direction:

- Geist typography direction;
- restrained violet accent;
- off-white/light application background;
- white primary content surfaces;
- subtle cool-gray borders;
- low elevation;
- approximately 10–14px radii where appropriate;
- deliberate density suitable for a productivity/editor tool.

Avoid generic AI/SaaS styling patterns:

- giant gradients;
- neon glow;
- decorative glass everywhere;
- random bento cards without information hierarchy;
- sparkle/AI iconography as decoration;
- excessive pill controls;
- marketing-style hero UI inside the application;
- arbitrary animations that slow work.

Use elevation, blur, or glass only when it communicates layering such as dialogs, menus, floating toolbars, or focus.

---

# 15. Accessibility rule

Accessibility is part of correctness.

At minimum:

- use semantic HTML before div-based simulations;
- preserve keyboard navigation;
- use visible focus states;
- ensure dialogs/menus/popovers have correct focus behavior;
- label icon-only controls;
- preserve usable contrast in light and dark mode;
- avoid pointer-only interactions when keyboard alternatives are expected;
- test splitter controls for keyboard accessibility where feasible;
- do not break browser zoom;
- do not rely on color alone to communicate save/error/destructive state.

Prefer Radix primitives for interaction patterns that require complex focus/ARIA behavior rather than recreating them casually.

---

# 16. Performance rule

Optimize high-frequency editor/canvas paths deliberately.

Potential frontend hot paths:

- Excalidraw scene updates;
- rich document editor updates;
- split-pane resize;
- project loading;
- serialization/autosave;
- large image rendering;
- dashboard preview generation.

Do not respond to these potential risks by adding memoization everywhere.

Use this sequence:

```text
representative workload
       ↓
measure
       ↓
identify bottleneck
       ↓
small targeted optimization
       ↓
measure again
```

Avoid pushing high-frequency canvas/editor data through global Zustand stores merely for architectural consistency.

Lazy-load large editor/canvas dependencies when doing so materially improves startup without harming interaction quality, but verify with bundle/runtime evidence before adding complexity.

---

# 17. Error and loading states

Every asynchronous user-visible operation must have intentional behavior.

For critical Project flows, define:

- pending/loading state;
- empty state;
- recoverable error state;
- retry where appropriate;
- durable save failure behavior;
- not-found Project behavior.

Do not swallow persistence errors and show a successful saved state.

Avoid full-screen spinners for small local operations when the current screen can remain usable.

Use route-level pending/error boundaries where ownership is route-level; use feature-level feedback where the operation belongs to a feature.

---

# 18. Forms and mutations

Keep forms small and product-focused.

For the current Project creation flow:

```text
New Project
  ↓
title
  ↓
create
  ↓
workspace
```

Do not introduce a generic form framework unless form complexity provides evidence that it is needed.

Validate at the correct boundary:

- immediate UX validation in the client where useful;
- authoritative validation at the server/persistence boundary when applicable.

Do not trust client validation as a security/data-integrity boundary.

---

# 19. Testing and verification

Frontend work is not complete because components render in isolation.

For user-visible changes, verify the actual interaction.

Critical current journey:

```text
Dashboard
   ↓
Create Project
   ↓
Workspace
   ↓
Edit Document + Canvas
   ↓
resize split
   ↓
persist
   ↓
reload
   ↓
reopen
   ↓
same state
```

Frontend verification should include, as applicable:

- TypeScript/typecheck;
- lint/static checks configured by the repository;
- build success;
- focused unit tests for meaningful pure logic;
- integration tests for state/persistence boundaries;
- browser-level/e2e verification for the critical journey;
- screenshot/visual inspection against `.agents/DESIGN.md`;
- keyboard/accessibility checks for changed interactive primitives.

Do not introduce a test solely to increase coverage percentage.

Protect observable behavior and high-risk boundaries.

---

# 20. Dependency policy for this stack

Already approved frontend foundations do not require re-approval each time they are used within their intended scope:

- TanStack Start;
- Vite;
- React/TypeScript;
- Tailwind CSS;
- Radix UI;
- Zustand;
- Excalidraw as the approved canvas direction.

However, package selection inside a family still requires judgment.

Examples:

- add only Radix primitives actually required;
- do not install broad UI bundles when one primitive is needed;
- do not add TanStack Query merely because TanStack Start is used;
- do not add TanStack Form merely because a form exists;
- do not add TanStack Table unless a table feature needs its capabilities;
- do not add an animation library without an interaction requirement;
- do not add a utility dependency for a trivial local function.

Every additional dependency follows the project dependency rule.

---

# 21. Frontend implementation workflow

For meaningful frontend work:

```text
1. Read MILESTONE.md and STATE.md
2. Read PROJECT.md for behavior/domain
3. Read DESIGN.md for visual/interaction intent
4. Read this frontend skill
5. Inspect existing route/feature patterns
6. Bound the user-visible change
7. Identify state ownership before choosing Zustand/local/route state
8. Reuse Radix/Tailwind patterns already present
9. Implement the smallest vertical slice
10. Verify in a real browser
11. Run relevant quality gates
12. Update STATE.md with evidence
13. STOP when acceptance criteria pass
```

Do not perform a frontend-wide refactor while implementing a bounded product feature unless the refactor is required for correctness.

---

# 22. Anti-pattern checklist

Do not:

- create a giant global Zustand store;
- mirror all server data into Zustand;
- mirror Excalidraw scene changes through React global state on every pointer event;
- put business logic in route files because routes are convenient;
- call Tauri APIs directly from ordinary feature components;
- create `packages/ui` before there is a real second UI consumer or hard boundary;
- create wrappers around every Radix primitive;
- install shadcn/ui as an automatic default layer;
- create a bespoke design-system framework before product screens exist;
- use Tailwind arbitrary values everywhere instead of stable product semantics;
- introduce CSS-in-JS alongside Tailwind without explicit need;
- add TanStack libraries merely because they share a brand;
- use effects to keep duplicated state synchronized when values can be derived;
- over-componentize trivial markup;
- keep giant page components with mixed routing/domain/editor/persistence concerns;
- use browser-only assumptions that prevent future WebView2 execution without reason;
- optimize hypothetical scale before profiling;
- expand the current slice into templates, AI, collaboration, CRDT, structured diagrams, or other deferred features.

---

# 23. Definition of frontend done

Frontend work reaches release-ready state only when:

1. requested product behavior matches `PROJECT.md`, `MILESTONE.md` and `STATE.md`;
2. ownership is clear;
3. state lives in the correct layer;
4. TanStack Start routing/runtime patterns are used without turning routes into the entire architecture;
5. Tailwind implementation matches `DESIGN.md`;
6. Radix interactive primitives preserve accessibility;
7. Zustand is used only where justified;
8. the Web target runs independently from Tauri;
9. editor/canvas dependencies remain behind Notespace-owned boundaries;
10. type/build/test gates relevant to the change pass;
11. user-visible interactions have been verified in a real browser;
12. visual changes have been inspected, not inferred from tests alone;
13. no unrelated scope was added;
14. `STATE.md` contains concise evidence and the next meaningful move.

Then stop.
