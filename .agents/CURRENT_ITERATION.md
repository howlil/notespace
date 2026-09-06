# Current Iteration

## Active milestone

**M16 — Workspace Interaction Reliability**

State: **implementation complete; merge is gated by exact-head deterministic Verify**.

## Product outcome

Workspace interaction remains predictable across Note/Canvas panes, focus mode, and sidebar collapse/expand without adding new product surface area.

```text
OPEN WORKSPACE / LIBRARY
        ↓
ONE INTERACTION POLICY
        ↓
CONSISTENT ACTION AVAILABILITY
        ↓
STABLE FOCUS / SPLIT / REOPEN
        ↓
NO DOM-LIFECYCLE HACKS
```

This milestone fixes a demonstrated reliability bottleneck. It does not expand persistence, collaboration, search, study, or library product scope.

## Sprint

One sprint, three slices:

### Slice 1 — Pane interaction ownership

User-visible outcome:

- Open Note, Open Canvas, Split right/down, Close pane, and Maximize/Focus derive from one pane interaction policy;
- a single-note workspace cannot expose a usable note split action;
- Canvas cannot be opened twice;
- pane-capacity and unopened-note constraints cannot drift between menu rendering and action execution;
- focus target follows the active pane's containing split, otherwise the active pane itself.

Implementation boundary:

- `features/workspace/pane-layout.ts` owns pure pane interaction state and focus-target derivation;
- `Workspace.tsx` consumes those rules rather than recomputing availability independently.

### Slice 2 — Sidebar action ownership

User-visible outcome:

- New Category, New Workspace, Quick Capture, and Library Tools consistently return after sidebar collapse/expand;
- Library Tools remains in the sidebar action row and keeps the existing backup/restore/import/trash behavior.

Implementation boundary:

- Sidebar directly renders the Library Tools trigger;
- root-level `createPortal`, DOM query, `MutationObserver`, and route-dependent attachment logic are removed;
- no global state library or new shell abstraction is introduced.

### Slice 3 — Focused regression coverage

Verification protects only the interaction invariants that already caused regressions:

- single-note pane availability;
- unopened-note and pane-capacity rules;
- Canvas uniqueness;
- close-pane availability;
- active focus target;
- direct Sidebar ownership of Quick Capture and Library Tools;
- absence of DOM attachment hacks.

No broad browser/black-box suite is promoted to a merge gate.

## Explicit non-goals

- Workspace persistence redesign;
- per-Note versioning;
- SQLite concurrency changes;
- global client state management;
- new pane types;
- more than four panes;
- collaboration/CRDT;
- feature additions unrelated to interaction reliability.

## Exit criterion

Merge this milestone only when the exact PR head passes the repository Verify workflow. After merge, stop and reassess actual product friction rather than automatically creating another milestone.
