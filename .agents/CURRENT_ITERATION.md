# Current Iteration

## Status

**No active milestone.**

Latest completed milestone: **M16 — Workspace Interaction Reliability**.

- PR: #19
- exact-head Verify: #161 — success
- merged commit: `f35438b6f805fb607fe5d33a76b2729642760e02`

## Product outcome shipped

Workspace and library interaction ownership is now explicit enough that the demonstrated pane/sidebar regressions have one deterministic source of behavior instead of UI-local guesses.

```text
OPEN WORKSPACE / LIBRARY
        ↓
ONE INTERACTION POLICY
        ↓
CONSISTENT ACTION AVAILABILITY
        ↓
STABLE FOCUS / SPLIT / REOPEN
        ↓
DIRECT SIDEBAR OWNERSHIP
```

### Slice 1 — Pane interaction ownership

Completed:

- `pane-layout.ts` owns pane capacity, Canvas uniqueness, unopened-note availability, split/open/close availability, and active focus-target derivation;
- `Workspace.tsx` consumes that policy for both rendered menu state and action execution;
- single-note workspaces cannot expose usable note split actions;
- focus follows the active pane's containing split, otherwise the active pane.

### Slice 2 — Sidebar action ownership

Completed:

- Sidebar directly renders New Category, New Workspace, Quick Capture, and Library Tools;
- Library Tools no longer discovers Sidebar through `querySelector`, `MutationObserver`, route inspection, or a root `createPortal`;
- collapse/expand recreates the complete action row through normal React ownership.

### Slice 3 — Focused regression coverage

Completed deterministic coverage for:

- single-note pane availability;
- unopened-note and pane-capacity rules;
- Canvas uniqueness;
- close-pane availability;
- active focus target;
- direct Sidebar ownership of Quick Capture and Library Tools;
- absence of the removed DOM attachment mechanism.

No broad browser/black-box suite was promoted to a merge gate.

## Explicitly unchanged

- Workspace persistence and optimistic versioning;
- SQLite connection model;
- max four panes / one Canvas;
- authored Note/Canvas semantics;
- study behavior;
- search and library data contracts;
- collaboration remains out of scope.

## Next meaningful action

Use the product and identify the next demonstrated user-facing bottleneck. Do not promote another milestone from architectural possibility or feature inventory alone.
