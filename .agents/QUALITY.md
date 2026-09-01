# Notespace — Verification and Quality Gates

## Principle

Use the smallest evidence set that proves the requested behavior and protects the changed boundary. Do not treat compilation, a plausible implementation, or an open PR as completion.

Prefer evidence in this order:

1. observable user behavior;
2. boundary/invariant behavior;
3. internal correctness/static checks.

## Canonical task entrypoint

`Taskfile.yml` is the preferred repository-level command surface for humans and agents.

Primary commands:

```sh
task dev      # web + Go development servers
task check    # frontend typecheck/lint/unit + Go vet/race tests
task build    # production web + Go binary
task e2e      # built web + browser tests against real Go server
task verify   # build + check + browser E2E
task up       # build/start Docker Compose stack
task down     # stop stack without deleting persisted data
task logs     # follow compose logs
```

Underlying commands may be used for targeted diagnosis, but do not duplicate a second orchestration layer unless the repository requires it.

## Baseline gates

For a meaningful cross-stack/release candidate change, the current repository supports:

```sh
pnpm install --frozen-lockfile
task verify
docker compose up --build -d --wait
python3 scripts/smoke-persistence.py --compose-restart
```

CI source: `.github/workflows/verify.yml`.

Do not claim a gate passed unless it was actually executed for the relevant code/head. If a required gate cannot run, record the reason and residual risk in `CURRENT_ITERATION.md`.

## Risk-proportional verification

### Low risk

Examples: copy, isolated styling, documentation, non-behavioral local refactor.

Use targeted static/test/build evidence appropriate to the changed surface.

### Medium risk

Examples: dashboard/workspace interaction, editor integration, autosave behavior, persistence mapping, Project API behavior.

Normally require:

- targeted automated tests;
- relevant static checks;
- production build when runtime composition may change;
- browser/integration verification for observable behavior.

### High risk

Examples: schema/data migration, destructive operations, backup/restore, security boundary, editor replacement, persistence technology change, public/data contract change.

Require explicit acceptance criteria plus failure-path/recovery evidence. Material architecture, security, contract, or destructive changes also require user approval before implementation.

## Core regression journey

Protect this user journey when affected:

```text
Dashboard
  → create/open Project
  → edit document
  → edit canvas
  → save
  → navigate/reload
  → reopen Project
  → authored state remains correct
```

For Milestone 2, extend the applicable journey with stable block identity/reference creation/navigation and restart durability as each slice enters scope.

## Frontend/editor checks

For changes touching the web workspace, verify applicable behavior:

- correct Project identity after navigation/switching;
- Tiptap content serialization and reload;
- Excalidraw scene load/edit/save/reload;
- split/layout interactions do not corrupt editor state;
- keyboard/pointer behavior remains usable;
- save failure/retry/conflict states remain observable;
- narrow layout and light/dark mode remain coherent when affected;
- user-facing controls remain keyboard reachable and labelled where needed.

Editor dependency upgrades require interaction regression testing, not only TypeScript compatibility.

## Persistence checks

A persistence change must prove the relevant form of:

```text
write → durable store → reload/restart → equivalent user-visible state
```

Test conflict/failure/malformed data paths when affected. Do not report autosave correctness from in-memory behavior alone.

For migrations, test existing representative data plus empty/fresh state. Destructive or irreversible migration is a stop condition pending explicit approval.

## Security checks

For changes touching untrusted content, storage paths, import/upload/embed behavior, HTML/SVG rendering, authentication, or external URLs, explicitly review applicable risks:

- schema/input validation;
- XSS/output sanitization;
- unsafe URL/file handling;
- path traversal;
- size/resource abuse;
- authorization/ownership when auth exists;
- secret exposure;
- dependency advisories.

## Docker/self-host checks

When deployment/runtime/persistence composition changes, verify:

- image builds;
- container becomes healthy;
- app runs as intended under Compose;
- acknowledged Project state survives process/container restart;
- verification does not delete/reset user data.

## Dependency gate

Add or upgrade a dependency only when it solves a concrete requirement. For material dependencies, evaluate:

- necessity and scope;
- maintenance/security/license state;
- bundle/runtime/self-host impact;
- transitive infrastructure requirements;
- replacement difficulty.

Prefer existing repository capabilities over introducing a new library for trivial code.

## Release-ready evidence

Before marking a slice or milestone release-ready, record in `CURRENT_ITERATION.md`:

- what observable behavior changed;
- tests/checks actually run and their result;
- CI/Docker evidence when required;
- known limitation or skipped gate;
- the single next action, or `STOP` when the milestone gate is complete.

## Stop rule

Stop when the bounded acceptance criteria are satisfied and the relevant gates pass. Do not continue with speculative polish, future abstractions, unrelated refactors, or an automatically invented next milestone.
