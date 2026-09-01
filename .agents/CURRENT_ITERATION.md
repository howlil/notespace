# Sprint 1 — Core Project Workspace

Status: RELEASE READY — SPRINT 1 ACCEPTANCE COMPLETE
Branch: `feat/sprint-1-core-workspace`

## Feature Compass
- Shape: dashboard → create Project → structured Document + Excalidraw Canvas → autosave → reload/reopen.
- Position: implementation, local verification and remote CI/Docker verification complete. Release delivery is tracked in PR #1; merge is explicitly authorized after the final head passes CI.
- Delta: repository started with `.agents` only. It now contains the Web/Go monorepo, SQLite migrations, unified API, editors, Docker packaging and verification scripts.
- Next: Sprint 1 scope is complete. Use [PR #1](https://github.com/howlil/notespace/pull/1) for delivery status; subsequent product work needs a separately bounded iteration.

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
- [x] Docker build/startup, healthy non-root container and restart-persistence smoke passed in GitHub Actions. Preview binds explicitly to IPv4 loopback to avoid Docker localhost address-family mismatches.
- [x] Remote branch and [PR #1](https://github.com/howlil/notespace/pull/1) published with a tree identical to the local implementation. Merge explicitly authorized after CI passes.

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
- [Remote CI run 33524907104](https://github.com/howlil/notespace/actions/runs/33524907104): all steps passed on `be4cfa4e81629674a381f4636495d44de299d490`. Standard Chromium: four E2E tests passed in 22.7s. Docker Compose built and started a healthy container; smoke confirmed create/edit of both surfaces, reopen, direct workspace URL and container restart with intact state.

## Delivery boundary
The user explicitly authorized publication of all Sprint 1 changes to public `howlil/notespace`, PR creation and merge after CI passes. Release readiness requires the Docker/CI gate; deployment is outside this task.

## Retrospective
- Evidence: isolated handler tests missed a production mux conflict; direct workspace reload exposed differing prerendered pending text; Docker CI exposed a localhost address-family mismatch in prerender.
- Bottleneck/root cause: component boundaries did not exercise final production composition early enough.
- Applied improvement: retain production route assembly regression coverage, browser tests against the built app served by Go, and Docker startup/restart smoke as required gates. Pin the preview listener to IPv4 loopback.
- Verification: the full remote workflow passes; route assembly, deep-link hydration, container build/startup and restart persistence failures fail the delivery gate.
