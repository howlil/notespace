# Sprint 1 — Core Project Workspace

Status: IMPLEMENTED AND LOCALLY VERIFIED; REMOTE CI/DOCKER GATE PENDING
Branch: `feat/sprint-1-core-workspace`

## Feature Compass
- Shape: dashboard → create Project → structured Document + Excalidraw Canvas → autosave → reload/reopen.
- Position: local implementation and verification complete. Explicit publication and merge authorization received. Remote CI/Docker verification is pending.
- Delta: repository started with `.agents` only. It now contains the Web/Go monorepo, SQLite migrations, unified API, editors, Docker packaging and verification scripts.
- Next: publish the branch and PR, verify CI including Docker startup/restart persistence, then merge the verified head.

## Authorized scope
The user's Sprint 1 execution request authorizes structured editor selection, dashboard recent/all/title search, create/open/delete, light/dark foundation, note + canvas persistence, and Docker self-host packaging. This extends the earlier minimal bootstrap scope for search/delete and resolves the editor decision for this slice.

Repository naming stays Project-centric: a Project owns both Document and Canvas. User's conceptual document in the sprint plan maps to this aggregate; no independently managed Note or Canvas resource is introduced.

## Implementation decisions
- Preserve TanStack Start + React + Vite + Tailwind + Radix, Go stdlib HTTP and database/sql + SQLite, native embedded migrations.
- Tiptap StarterKit for paragraphs, headings, lists, code; versioned snapshot behind document adapter. Excalidraw behind canvas adapter.
- React 18.3 aligns with Excalidraw's transitive Radix peer ranges.
- Pure-Go modernc SQLite keeps the binary CGO-free. One connection, WAL, FULL synchronous. No performance claim beyond test evidence.
- TanStack Start SPA shell + assets served by Go: one runtime process/container, same-origin API. Excalidraw/Geist fonts served locally.
- 650ms debounced serialized saves, optimistic version guard, visible retry, flush before app navigation, browser unload warning for unsaved content.
- Resizable desktop split (25–70% document); narrow screens stack the same two surfaces. Theme stored locally; Project content remains server-owned.
- Permanent deletion requires a UI confirmation; no Trash subsystem.

## Out of scope
AI, collaboration/CRDT, authentication/team permissions, templates, favorites, trash/restore, export, semantic references, structured diagrams/icons, desktop shell and extra infrastructure.

## Acceptance and evidence
- [x] Project CRUD API; owned note/canvas/layout snapshots; validation and safe HTTP errors.
- [x] SQLite migration, persistence round trip, close/reopen and stale-writer coverage.
- [x] Autosave queue ordering, failed save retry, project isolation unit tests.
- [x] Dashboard and workspace implementation; note formatting; canvas; split; themes.
- [x] Initial production build and TypeScript check pass.
- [x] Browser journey including structured note, drawing, switching, reload, search/delete and themes; zero page errors in the core journey.
- [x] Browser failure handling/retry, blocked navigation on save failure, narrow layout and canvas select/move/delete/pan/zoom persistence.
- [x] Final lint/typecheck, production build, 3 autosave tests, Go vet/race tests and CGO-free server build. Production process SIGTERM/restart preserves the complete Project. Production dependency audit: zero vulnerabilities after documented transitive overrides.
- [ ] Docker startup/restart gate: Docker is not installed in this runtime. Dockerfile/Compose/workflow provided and YAML parsed; do not claim container execution passed.
- [ ] Remote branch/PR/merge: publication and merge explicitly authorized; delivery in progress.

## Known limits
No auth; host binds loopback by default. Acknowledged saves survive restart; forced close before acknowledgement can lose unsaved edits. Concurrent tabs receive a conflict, not automatic merging. Canvas adapter stores complete scene snapshots; large upstream editor chunks remain lazy-loaded.

## Verification evidence
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`: pass.
- `go test -race ./...`, `go vet ./...`, `CGO_ENABLED=0 go build ...`: pass.
- `pnpm test:e2e`: 4 tests passed in 27.4s against production assets + real Go/SQLite backend. Local Chromium 143 used because standard browser CDN downloads failed; standard Playwright Chromium remains the default CI path.
- `pnpm audit --prod --json`: 0 critical/high/moderate/low findings.
- Production smoke: real HTTP CRUD + SPA/deep-link serving pass; independent SIGTERM/restart round trip passes. Development startup and same-origin POST through Vite proxy pass (explicit `changeOrigin: false`).
- Visual QA: dashboard empty/populated, workspace light/dark, 390px narrow viewport inspected. Screenshots: `docs/evidence/sprint-1/`.
- Fixed findings: API/SPA mux startup conflict, differing SPA pending text causing deep-link hydration errors; tests retain coverage.

## Delivery boundary
The user explicitly authorized publication of all Sprint 1 changes to public `howlil/notespace`, PR creation and merge after CI passes. Release readiness requires the Docker/CI gate; deployment is outside this task.

## Retrospective
- Evidence: isolated handler tests passed before the production mux conflict was detected; direct workspace reload exposed differing prerendered pending text.
- Bottleneck/root cause: component boundaries did not exercise final production composition early enough.
- Applied improvement: retain the production route assembly regression test and run browser tests against the built app served by Go.
- Verification: route assembly, deep-link hydration and persistence failures now fail the local/CI gates.
