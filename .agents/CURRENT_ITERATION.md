# Current Iteration

## Milestone

**Notespace Reliability & Debt Burn-down**

Ship the existing product with fewer correctness gaps, bounded resource use, cleaner compatibility boundaries, and verification that follows real user risk before adding another major feature.

## Design graph

```text
User action
  → UI boundary
  → canonical Workspace API
  → domain invariant
  → durable/external boundary
      ├── SQLite
      ├── local filesystem / Docker volume
      └── fixed Eraser icon source
  → acknowledged result
  → reload / restore / restart evidence
```

Model each change in this order:

1. **A — successful result:** what durable/user-visible state must exist after the action.
2. **E — breakpoints:** validation, conflict, partial write, timeout, stale compatibility path, or unavailable external source.
3. **R — requirements:** browser state, HTTP API, project/study service, SQLite, Docker volume, or upstream icon source.
4. Keep parsing/validation at boundaries and keep authored SQLite state authoritative.
5. Verify the cheapest test that proves the actual risk; use browser E2E only for complete critical journeys.

## Slices

### S1 — Backup / restore round-trip

**Before:** backup downloads ZIP but the Restore picker only selects JSON.

**After:** Restore accepts Notespace ZIP and legacy JSON; backend keeps format validation and transactional restore.

**Risk:** a recovery feature that cannot consume its own normal output.

### S2 — Local self-host contract

**Before:** base Compose exposes the container port only, while README implies `localhost:8080` works directly.

**After:** `compose.local.yaml` is the explicit localhost publishing override; base Compose remains suitable for MyPaaS/reverse-proxy deployment.

### S3 — Bounded backup memory

**Before:** backup/restore is assembled in memory while the HTTP boundary advertises 512 MiB.

**After:** until archive streaming is implemented, the round-trip limit is intentionally 64 MiB and request timeouts allow a realistic recovery operation. Large libraries should use volume-level SQLite backup.

**Invariant:** a successful restore remains all-or-nothing.

### S4 — Import rollback

```text
Markdown file
  → create Workspace
  → upload referenced images
  → save authored Note
       ├── success → keep Workspace
       └── failure → Trash → permanent delete compensation
```

A failed vault item should not silently leave a partial Workspace. If compensation itself fails, surface that manual cleanup is required.

### S5 — Bounded Workspace opening

Opening one Workspace must not fetch every sibling in a large Category. The route loads a bounded switcher preview; global `Ctrl/Cmd + K` remains the scale path for finding arbitrary workspaces.

### S6 — Explicit conflict recovery

Non-Canvas optimistic-version conflicts must never overwrite newer authored state. Local unsaved content stays visible and the recovery UI must make preserving/copying the local draft explicit before reload.

### S7 — Remove retired product/code paths

- remove the retired Canvas toolbar renderer while retaining the small shared action-name contract;
- remove obsolete Note↔Canvas reference E2E behavior;
- keep legacy snapshot read compatibility without keeping unreachable creation UI/helpers alive.

### S8 — Critical-journey CI

Keep unit/static/build checks, then run only high-value browser journeys:

- direct route + reload;
- global search → exact Workspace/Note context;
- Trash → restore;
- full-library ZIP backup → restore.

Do not make the full browser suite a merge gate.

### S9 — Bounded Eraser gateway

The gateway accepts only the fixed Eraser origin, validates SVG structure, rejects executable/external content, caps each payload at 1 MiB, and keeps an LRU bounded by both entry count and bytes.

### S10 — Logical study sessions

```text
Start logical session L
  → date segment L:2026-09-10
  → midnight
  → date segment L:2026-09-11
  → End L
```

Daily accounting may split persistence rows, but Recent sessions groups them as one user-visible session and deleting that session removes all of its date segments.

### S11 — Incremental search projection

A successful create/update/move attempts to refresh only that Workspace's FTS rows. Projection failure is logged but does **not** turn an already-durable authored save into a false failure; lazy search repair remains the fallback.

### S12 — Release path

Version tags publish a GHCR image. Source-build Compose remains supported; releases do not change Notespace's single-container/self-hosted ownership model.

### S13 — Workspace terminology migration

`/workspaces/:id` and `/api/workspaces/*` are canonical. Browser `/projects/:id` redirects to the Workspace route. Legacy `/api/projects/*` remains compatibility-only and advertises deprecation while consumers migrate.

## Invariants

- SQLite authored state is the source of truth; FTS and browser caches are derived.
- A save acknowledged as durable must not later be reported as failed only because derived indexing failed.
- Restore remains transactional.
- Deleting a Workspace still enters recoverable Trash first.
- Optimistic concurrency remains the guard against stale authored writes.
- Canvas-only races may merge with the existing deterministic rule; Note/title conflicts do not silently merge.
- Manual study Start/Pause/Resume/End remain user-controlled.
- No new multi-user, CRDT, microservice, generic AI-chat, database/wiki, or plugin-marketplace scope is introduced by this milestone.

## Verification gate

Before shipping this milestone:

```text
frontend typecheck + lint + unit + production build
backend format + vet + race + build
focused persistence tests
critical browser journeys
production Compose + restart persistence when durable/deploy boundaries changed
```

## Next product milestone

After this gate is green, the highest-value product candidate is **Sources / PDF inside a Workspace** so the learning loop can become:

```text
Source → Note / Canvas → Recall → Study evidence
```

Do not start that product slice until this reliability milestone is shipped.
