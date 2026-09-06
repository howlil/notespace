# Current Iteration

## Active milestone

**M13 — Quality & Correctness Remediation**

State: **implemented and verified; ready for integration after the final exact-head Verify gate**.

## Product outcome

Notespace keeps the existing product and architecture while making the core loop safer under storage failure, long-running study sessions, unusual search input, large libraries, and Markdown export.

```text
AUTHOR / CAPTURE
      ↓
SAVE / DELETE ── storage failure → controlled error, never panic
      ↓
FIND ─────────── punctuation / Unicode → deterministic retrieval
      ↓
STUDY ────────── persisted baseline + current session → correct totals
      ↓
EXPORT ───────── Note images → self-contained Markdown
```

This is a remediation milestone, not a feature-expansion milestone. It deliberately avoids schema migration, a new persistence model, global state, new infrastructure, or a new product surface.

## Sprint — Core Correctness Before New Features

Execution order:

1. **Slice 1 — Persistence & Retrieval Safety**
2. **Slice 2 — Study Accounting Correctness**
3. **Slice 3 — Bounded Capture & Portable Export**
4. **Slice 4 — Behavioral Invariants & Verification**

Sprint exit criterion: all changed web/server/persistence boundaries pass deterministic automated gates on the final PR head, including production-composition restart verification because persistence code changed.

## Slices

### Slice 1 — Persistence & Retrieval Safety

User outcome:

- Workspace deletion returns a controlled error if SQLite rejects the delete; a storage error cannot trigger a nil `sql.Result` panic.
- Failed deletion remains transactional: Workspace and checkpoint history are preserved when the delete transaction aborts.
- Search punctuation such as quotes is treated as user text rather than FTS5 query syntax.
- Unicode search terms and long Unicode excerpts remain valid UTF-8 and preserve exact block context.
- Rapid autosaves inside the five-minute history checkpoint window avoid hashing the full authored aggregate when a checkpoint cannot yet be created.

Acceptance:

- regression test forces SQLite to reject project deletion and proves error + rollback rather than panic;
- quoted and Unicode FTS queries execute without syntax failure and resolve the expected block;
- excerpt truncation is rune-safe and bounded;
- history checkpoint semantics remain unchanged: identical authored state does not create a checkpoint, changed authored state creates one only after the interval.

### Slice 2 — Study Accounting Correctness

User outcome:

- `Today` and `Total` show persisted study time plus the active local session instead of `max(persisted, current)`.
- A new browser session reads its durable baseline before registering the new zero-second session, preventing active-session double counting.
- Midnight rollover finalizes the old session, moves those seconds into total baseline, resets today's baseline, and starts a new session at zero.

Acceptance:

- 60m persisted today + 10m active displays 70m today;
- persisted total + current session is additive;
- rollover resets today's display while preserving completed time in total;
- negative/invalid local counters cannot produce negative displayed totals.

### Slice 3 — Bounded Capture & Portable Export

User outcome:

- Opening Quick Capture loads at most the 20 most recent Workspaces plus the remembered destination instead of loading the complete Workspace library.
- Typing in the Workspace field queries the existing paginated Workspace endpoint by title with a 20-result bound; choosing a capture destination does not invoke global Note/Block retrieval.
- Empty search results cannot silently capture into a hidden previous Workspace.
- Note Markdown export embeds durable Notespace images as data URLs so exported Markdown no longer contains unusable `notespace-asset://` links.
- If an image cannot be loaded, export remains usable and emits explicit fallback text plus a user-visible warning.
- New checklist creation is removed from the slash menu until checked-state interaction has a complete persistence contract; legacy task-list schema remains readable.

Acceptance:

- Quick Capture no longer calls the unbounded `listProjects()` path;
- remembered Workspace fallback still works when it is outside the recent set;
- typed destination search returns a bounded title-scoped Workspace page;
- Markdown adapter extracts unique asset IDs and substitutes supplied portable sources;
- proprietary asset URLs never leak into exported Markdown without a portable replacement.

### Slice 4 — Behavioral Invariants & Verification

Engineering outcome:

- Added focused unit coverage for study totals/rollover, capture option mapping, pane-tree invariants, authored-content normalization, Markdown image portability, delete failure rollback, FTS punctuation, and Unicode excerpts.
- Reduced static design-contract assertions that pinned exact dependency versions, internal function names, or exact Tailwind implementation fragments when behavioral/unit coverage owns the invariant better.
- Kept the existing TypeScript strict mode, React Hooks linting, Go vet/race checks, build gates, and persistence restart smoke.

Verification evidence on implementation head (`Verify` #130):

- `pnpm typecheck` — pass;
- `pnpm lint` — pass;
- `pnpm test` — pass;
- `pnpm build` — pass;
- Go formatting check — pass;
- `go vet ./...` — pass;
- `go test -race ./...` — pass;
- production Go build — pass;
- Compose config/build/health — pass;
- restart-persistence smoke — pass.

No manual/browser/black-box acceptance gate was required.

## Explicitly deferred / out of scope

These audit findings are real but are not safe local-remediation work:

- **Authentication/access control**: changing the public security boundary requires an explicit deployment/product decision about trusted reverse proxy vs application-owned authentication.
- **Note-scoped persistence**: replacing full Workspace snapshot writes changes the API/persistence concurrency contract and requires measured save-size/latency evidence first.
- **Top-level legacy `document` retirement**: removing the compatibility field requires a backward-compatible data/API migration plan.
- **Asset reachability GC**: deleting unreferenced binaries requires an explicit retention rule covering current snapshots and retained history before destructive cleanup is safe.
- **Large `Workspace.tsx` decomposition**: extract further orchestration only when a concrete change requires it; do not refactor solely for file size.
- Existing optional Playwright files are not promoted back into merge gates; black-box coverage remains outside the repository's required verification model.

## Integration rule

Merge PR #16 to `master` only after the final risk-based `Verify` run is green on this documentation-complete head. After merge, stop and reassess before promoting a new feature milestone.
