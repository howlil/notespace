# Notespace — Verification and Quality Gates

This document defines what “done” means for engineering changes in Notespace.

The goal is not maximum ceremony. The goal is reliable evidence that the requested behavior works and that the change does not create disproportionate risk.

---

# 1. Quality principle

Use the smallest verification set that proves the change.

`IMPLEMENT → VERIFY → QUALITY GATES → RELEASE READY`

Do not equate:

- code compiles;
- tests exist;
- PR is open;
- implementation looks plausible;

with completed behavior.

A meaningful change is done when the relevant observable behavior is verified and required quality gates pass.

---

# 2. Verification hierarchy

Prefer evidence in this order:

## 2.1 Observable behavior

Can a user perform the intended action and get the intended result?

Examples:

- create a Project;
- open it from dashboard;
- edit document content;
- edit canvas content;
- reload and see durable state;
- resize/focus panes;
- import/export data;
- restore a backup.

## 2.2 Boundary behavior

Do system boundaries preserve invariants?

Examples:

- Project owns document/canvas state;
- Excalidraw-specific state does not leak into unrelated domain code;
- invalid import is rejected safely;
- persistence errors do not silently report success.

## 2.3 Internal correctness

Use unit/static checks for logic where they provide fast evidence.

Examples:

- validation;
- serialization;
- migrations;
- state transitions;
- timer logic.

Do not optimize testing for internal method coverage at the expense of observable behavior.

---

# 3. Baseline quality gates

Implemented Sprint 1 commands (repository root unless noted):

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
cd apps/server
go vet ./...
go test -race ./...
go build ./cmd/notespace
cd ../..
pnpm exec playwright install chromium
pnpm test:e2e
docker compose up --build -d --wait
python3 scripts/smoke-persistence.py --compose-restart
```

The browser suite uses a fresh database in the OS temporary directory, outside the Playwright output directory. The Docker smoke script removes only its newly created test project. Do not delete or reset user projects to prepare verification. CI runs these gates in `.github/workflows/verify.yml`.

Run only gates supported by the actual repository. Once stack is known, update this file with exact commands.

Typical gates:

1. formatting/lint;
2. type-check/static analysis;
3. unit tests;
4. integration tests relevant to changed boundaries;
5. production build;
6. end-to-end/UI verification where behavior is user-facing.

A gate that does not exist in the repository is not evidence. Do not invent successful commands.

---

# 4. Change-risk matrix

## Low risk

Examples:

- copy change;
- visual spacing;
- isolated non-behavioral refactor;
- internal helper with existing tests.

Evidence may be:

- targeted test/static check;
- screenshot for UI change;
- build if relevant.

## Medium risk

Examples:

- Project dashboard behavior;
- workspace resizing;
- editor integration;
- persistence path;
- import/export transformation.

Evidence should usually include:

- targeted automated tests;
- integration/interaction verification;
- build/type-check;
- regression check for adjacent behavior.

## High risk

Examples:

- migration;
- destructive operation;
- backup/restore;
- authentication/security boundary;
- replacing editor/canvas engine;
- persistence technology change;
- large Project data transformation.

Evidence should include:

- explicit acceptance criteria;
- automated boundary/integration tests;
- failure-path testing;
- recovery/rollback reasoning;
- representative data verification;
- user approval for material architecture or destructive behavior.

---

# 5. Core Project journey

As implementation matures, protect this journey with integration or end-to-end coverage:

```text
Open Dashboard
      ↓
Create Project
      ↓
Workspace opens
      ↓
Edit document
      ↓
Edit canvas
      ↓
Change split/focus state
      ↓
Navigate away / reload
      ↓
Reopen Project
      ↓
Authored state remains correct
```

This is more valuable than a large number of shallow component tests.

---

# 6. Dashboard verification

When dashboard behavior changes, verify applicable cases:

- recent Projects render correctly;
- all Projects render correctly;
- Project open action targets the correct Project;
- New Project creates exactly one Project;
- search returns correct Projects;
- favorite state persists when implemented;
- trash behavior does not destroy data prematurely;
- empty state is coherent;
- no Note/Canvas top-level content model leaks into navigation.

UI changes should be visually checked at a representative desktop viewport.

---

# 7. Workspace verification

For document/canvas workspace changes, verify applicable cases:

- both surfaces load the same Project identity;
- split drag does not corrupt editor state;
- focus/collapse transitions preserve state;
- returning from focus mode restores a valid layout;
- Project switching does not leak previous Project content;
- timer state remains project-level;
- editor keyboard input is not stolen by global shortcuts incorrectly;
- canvas pointer/keyboard interactions are not broken by shell overlays;
- resize does not create unusable zero-width panes unless collapse is intentional.

Because embedded editors often manage their own focus/keyboard systems, interaction testing is mandatory for changes touching global shortcuts, focus, modal overlays, or split-pane behavior.

---

# 8. Document-editor verification

When document behavior changes, test:

- serialization round trip;
- common formatting;
- copy/paste where relevant;
- keyboard input;
- large enough content to expose obvious performance/layout issues;
- reload persistence;
- malformed stored state behavior;
- dark-mode rendering if applicable.

If Markdown import/export exists, test semantic round trips for supported constructs rather than comparing incidental internal JSON.

---

# 9. Excalidraw/canvas verification

For canvas integration changes, verify:

- load existing scene;
- edit shapes/text/arrows;
- save snapshot;
- reload snapshot;
- images/files if supported;
- zoom/pan/selection;
- keyboard shortcuts;
- theme integration;
- resizing container after split-pane changes;
- Project switching does not reuse stale scene state.

When upgrading Excalidraw, review release/security notes and regression-test the integration boundary.

Do not rely only on TypeScript compatibility for an editor dependency upgrade.

---

# 10. Persistence verification

A persistence change should prove:

```text
write → durable store → reload → equivalent user-visible state
```

Test relevant failure conditions:

- failed write;
- malformed record;
- missing owned sub-state;
- duplicate create request if applicable;
- delete/restore behavior;
- schema/version mismatch when migrations exist.

Do not report an autosave implementation as correct without testing refresh/restart behavior.

---

# 11. Import verification

Treat import as an untrusted-input boundary.

Test:

- valid supported input;
- invalid syntax;
- unsupported version/type;
- oversized/hostile input where practical;
- duplicate naming/identity behavior;
- no unintended overwrite;
- rollback/cleanup after failure;
- sanitization for rendered rich content.

Import success means the resulting Project can actually be opened and used.

---

# 12. Export verification

Test:

- exported data is structurally valid;
- expected content is present;
- binary/assets are handled correctly where supported;
- exported archive can be imported/restored when round-trip is a product promise;
- no instance secrets or unintended local paths leak into portable exports.

---

# 13. Backup and restore verification

A backup feature is not complete when a file is merely produced.

The important property is recoverability.

At minimum establish evidence that:

```text
working instance
      ↓
backup
      ↓
clean/controlled restore target
      ↓
restore
      ↓
Projects open with expected content
```

This may initially be automated integration coverage rather than manual testing for every change.

---

# 14. Migration quality gate

For schema/data migrations:

- identify source version;
- identify target version;
- test representative existing data;
- test empty database/state;
- define failure behavior;
- avoid partial success;
- ensure backup/recovery expectations are documented;
- verify restart after migration.

Destructive or irreversible migrations require explicit review.

---

# 15. Security quality gate

For changes touching untrusted content, authentication, storage paths, uploads, imports, embeds, or HTML/SVG rendering, explicitly review:

- input validation;
- output encoding/sanitization;
- XSS;
- path traversal;
- unsafe file type handling;
- size/resource limits;
- authorization/ownership if auth exists;
- secret exposure;
- unsafe redirects/URLs;
- dependency advisories.

Security-sensitive behavior should have tests at the boundary when practical.

---

# 16. Performance quality gate

Do not optimize without evidence, but do not ignore obvious regression risks.

Measure when a change affects:

- editor render loop;
- Excalidraw scene updates;
- autosave frequency;
- Project list/search with growing data;
- thumbnail generation;
- image processing;
- startup/load path;
- serialization of large content.

Use representative workloads. Microbenchmarks without production relevance are not sufficient evidence.

---

# 17. Accessibility quality gate

For user-facing controls:

- keyboard reachability;
- visible focus;
- labels for icon-only buttons;
- modal focus trapping/restoration;
- semantic element choice;
- adequate contrast;
- no critical color-only state;
- reasonable hit targets.

For changes around editor focus or global shortcuts, manually verify keyboard behavior even if component tests pass.

---

# 18. Visual quality gate

For meaningful UI work:

1. compare against the Figma/product intent;
2. verify hierarchy before pixel polish;
3. check common desktop viewport(s);
4. inspect empty/loading/error states affected by the change;
5. inspect light/dark mode when supported;
6. check text overflow and localization-resistant layout where practical;
7. ensure floating controls do not cover essential content;
8. confirm spacing/elevation are consistent with existing tokens/components.

Screenshots are useful evidence for visual changes.

---

# 19. Dependency gate

When adding/upgrading a dependency, record or verify as appropriate:

- reason;
- license;
- maintenance status;
- known security issues;
- bundle/runtime impact;
- self-hosting impact;
- transitive infrastructure requirements;
- replacement difficulty.

Do not add a library solely to save a few lines of straightforward code.

---

# 20. Release-ready report

For a meaningful completed change, report compactly:

```text
What changed
- ...

Verified
- ...

Quality gates
- ...

Known limitations / not in scope
- ...

Next move
- ...
```

Do not bury failed or skipped gates.

If a relevant gate could not run, state why and what risk remains.

---

# 21. Stop rule

Stop implementation when:

- acceptance criteria are satisfied;
- relevant verification passes;
- required quality gates pass;
- no known blocker remains inside scope.

Do not continue adding speculative polish, abstractions, refactors, or future features merely because context remains available.
