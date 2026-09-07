# Current Iteration

## Milestone — Structured Technical Diagrams

**Outcome:** Canvas can create technical diagrams without leaving Notespace or depending on Eraser as an external runtime.

### Slice 1 — Diagram entrypoint and palette

- Add a first-class `Diagram` control inside Canvas.
- Open a compact searchable palette instead of adding more permanent canvas chrome.
- Group reusable components into General, Tech, and Cloud categories.
- Reuse Notespace design tokens and existing Lucide dependency.

**Acceptance:** user can open/close the palette, search components, filter categories, and insert a component without leaving Canvas.

### Slice 2 — Native diagram components

- Convert selected palette components into native Excalidraw elements.
- Keep generated IDs under a Notespace-owned namespace.
- Preserve normal Excalidraw editing after insertion: move, resize, restyle, delete, and connect.
- Append new components next to existing authored content rather than replacing the scene.

**Acceptance:** inserted diagram components persist through the existing Excalidraw snapshot/autosave path and remain editable with native canvas tools.

### Slice 3 — High-value diagram templates

- Add Architecture template: Frontend → API → PostgreSQL / Redis.
- Add Flowchart template: Start → Process → Decision → Done.
- Create bound native arrows so template relationships survive normal shape movement.
- Use deterministic layout at insertion time; do not add a new layout/runtime dependency in this milestone.

**Acceptance:** one action inserts a coherent connected diagram that can immediately be edited as native canvas content.

### Slice 4 — Verification and product boundary

- Unit-test catalog search/filter behavior.
- Unit-test template node identity and arrow bindings.
- Add the diagram tests to the repository test gate.
- Keep backend API, SQLite schema, workspace ownership, deployment model, and Excalidraw snapshot contract unchanged.

**Acceptance:** typecheck, lint, unit tests, production build, and repository Verify are green at the exact PR head.

## Scope boundary

This milestone intentionally ships an Eraser-like **native diagram insertion workflow**, not an Eraser service integration and not a second canvas engine. Excalidraw remains the rendering/editing adapter. Diagram-as-code, ERD, sequence diagrams, large vendor-logo libraries, and AI-generated diagrams are follow-up milestones after this interaction proves useful.

## Current state

Implementation complete on `feat/structured-diagrams`; awaiting repository verification and merge.
