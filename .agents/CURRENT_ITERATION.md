# Current Iteration

## Active milestone

**M11 — Durability, Retrieval & Recovery Constraint Remediation**

State: **implementation complete; legacy relationship export assertion removed; final verification running**.

## Product outcome

Notespace keeps its simple single-user self-hosted architecture while removing prototype-era constraints that threatened data durability, retrieval scale, recovery clarity, and Workspace maintainability.

```text
AUTHORED WORK
  ├── Notes
  ├── Canvas
  └── Images
       ↓ durable
SQLite / stable volume

GLOBAL SEARCH
  authored snapshots
       ↓ derived projection
  SQLite FTS
       ↓
  exact Workspace / Note / Block context

SAVE
  ├── retryable transport failure → Retry
  └── version conflict → Stop + explicit reload
```

## Slices

### Slice 1 — Remove cross-surface Send/Link semantics
- Removed `Send to Canvas`, `Send to Note`, Link, linked-navigation, semantic-card creation, and Canvas↔Note relationship actions from Workspace UI/behavior.
- Existing legacy references normalize to an empty compatibility field on Workspace load/save and history restore.
- Stable block IDs remain solely for exact-context retrieval/deep links.

### Slice 2 — Durable server-owned image assets
- Added workspace-scoped SQLite asset persistence with 8 MiB normalized image limit.
- Added same-origin GET/PUT/DELETE asset API.
- Browser IndexedDB is now cache + migration fallback, not durable ownership.
- Legacy browser-only images are uploaded to the server when read.
- Workspace ZIP export includes durable image binaries while preserving the legacy `canvas/files.json` export artifact for compatibility.
- `relationships.json` is no longer part of the export contract because cross-surface relationship semantics were removed from the product.

### Slice 3 — Indexed global retrieval
- Added SQLite FTS5 `workspace_search` projection and version/category/title metadata.
- Search lazily rebuilds only stale/new workspace projection rows instead of decoding every workspace on every query.
- Search still returns exact Category / Workspace / Note / Block context.
- No external search service or second deployable process was introduced.

### Slice 4 — Deterministic optimistic-conflict recovery
- Lost-acknowledgement detection remains idempotent.
- A genuine HTTP 409 becomes `WorkspaceConflictError` and an Autosave `conflict` state.
- Automatic retry stops after a true conflict; UI offers explicit reload rather than a misleading retry loop.

### Slice 5 — Workspace invariant ownership
- Extracted pane-tree operations/invariants to `features/workspace/pane-layout.ts`.
- Extracted authored content normalization/helpers to `features/workspace/workspace-content.ts`.
- Workspace remains local React orchestration; no Redux/global store was added.
- Max four panes and max one Canvas remain explicit product constraints.

## Verification contract

Required before merge:

- `task check:web`
- `task check:server`
- `task build`
- targeted persistence tests for asset restart durability and exact block FTS retrieval
- existing risk-based GitHub Verify workflow green

## Integration rule

Merge this milestone to `master` only after the PR verification gate is green. After merge, update this file to record the verified commit and stop; do not promote new feature scope automatically.
