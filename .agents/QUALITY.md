# Notespace — Verification and Quality Gates

## Principle

Use the smallest evidence set that proves the requested behavior and protects the changed boundary. Verification exists to reduce product/reliability risk, not to maximize test count or gate count.

Evidence priority:

1. observable user behavior;
2. boundary/invariant behavior;
3. internal correctness/static checks.

Do not claim a gate passed unless it ran on the relevant head.

## Local command surface

`Taskfile.yml` is the normal human/agent entrypoint:

```sh
task dev
task check
task check:web
task check:server
task test:web TEST=path/to/test.ts
task test:server PACKAGE=./internal/httpapi
task build
task e2e
task e2e:target SPEC=tests/example.spec.ts
task verify
task up
task down
task logs
```

Use underlying pnpm/Go/Playwright/Docker commands when a narrower diagnosis is required. Do not add another orchestration system without measured need.

## Verification ladder

Use this escalation model:

```text
changed behavior/boundary
  → focused test/check
  → owning package/surface gate
  → browser/integration gate when user-visible boundaries cross
  → production composition/restart gate when runtime or durability changes
```

Do not jump to the most expensive layer first. Do not skip a layer that is the only one capable of proving the changed behavior.

## CI model

GitHub Actions exposes one stable required check: `Verify`.

The job classifies changed files and conditionally runs these gates:

| Changed boundary | Required CI evidence |
| --- | --- |
| docs / `.agents` / non-runtime metadata | repository knowledge contract only |
| web code, UI, tests, JS/TS dependency/config | TypeScript + lint + web unit + production web build + Playwright |
| Go server code | gofmt + vet + race tests + Go build |
| HTTP API boundary | Go gates + Playwright against the real Go server |
| persistence/migrations/Compose/runtime smoke | relevant Go gates + production Compose + restart-persistence smoke |
| workflow definition itself | full web + Go + browser + production-composition gate |

Outdated PR runs are cancelled through workflow concurrency so CI capacity follows the newest head.

This matrix is a default risk classifier, not permission to ignore a material risk that path classification cannot see. If a logical change crosses boundaries unexpectedly, run the broader gate explicitly.

## Web and design verification

For user-facing changes, verify stable behavior rather than implementation trivia or exact pixels.

Applicable contracts include:

- Home remains resume/search-first and progressively discloses category contents;
- the Home sidebar remains collapsible and does not become duplicate application chrome;
- global search remains keyboard reachable (`Cmd/Ctrl+K`);
- category detail supports scalable browsing rather than expanding Home into a file explorer;
- workspace does not retain the library sidebar;
- focus mode is reversible;
- Note/Canvas/Split remain views of one workspace;
- inline create/rename/actions remain keyboard reachable where applicable;
- light/dark and narrow layouts remain coherent when affected;
- destructive/error states remain understandable.

`DESIGN.md` is the canonical design quality contract. Automated design checks should protect hierarchy, interaction, accessibility, and state transitions. Do not add brittle screenshot-diff gates for subjective polish. Playwright screenshots/traces are diagnostic/review evidence.

### Playwright failure rule

When browser CI fails:

1. inspect the failing assertion and trace/report/screenshot;
2. determine whether product behavior, test setup, or an invalid interaction caused the state;
3. fix the owning boundary;
4. rerun the focused spec before the full suite.

Do not weaken a valid product assertion merely to green CI. Do not change product behavior to satisfy a brittle test.

## Backend verification

For Go changes, start with the affected package where possible, then run the repository server gate before integration:

```sh
task test:server PACKAGE=./internal/httpapi
task check:server
```

The repository gate includes gofmt, `go vet`, `go test -race ./...`, and a production Go build in CI.

Changes to HTTP mapping used by the web app also require browser verification because static/package tests cannot prove the integrated user journey.

## Persistence and migration verification

A durability claim must prove the relevant form of:

```text
write → durable store → reload/restart → equivalent acknowledged user-visible state
```

Persistence/migration changes require focused database tests plus production-composition restart smoke. Test failure/conflict/malformed or legacy data paths when the change affects them.

Destructive or irreversible migration is a stop condition pending explicit user approval and recovery evidence.

## Deployment/runtime verification

Run Compose build/health/restart smoke only when deployment/runtime/persistence composition changes or when explicitly preparing a release candidate that needs production-composition evidence.

Verify:

- Compose configuration resolves;
- image/container starts and becomes healthy;
- acknowledged authored state survives restart;
- verification does not delete persisted user data;
- `docker compose down -v` is never used as a normal verification step.

Do not run Docker merely because a CSS, copy, isolated component, or documentation file changed.

## Dependency changes

Add/upgrade dependencies only for a concrete requirement. Evaluate necessity, maintenance/security/license state, bundle/runtime impact, transitive infrastructure, and replacement difficulty.

A dependency change that can alter browser/runtime behavior must execute the relevant browser or server gate even when the source diff itself is small.

## Release-ready evidence

Before marking a slice or engineering change complete, record in `CURRENT_ITERATION.md`:

- observable behavior/capability changed;
- focused checks actually run;
- broader CI/browser/Docker evidence when required;
- skipped gate and residual risk, if any;
- single next action or `STOP`.

## Stop rule

Stop when the bounded acceptance criteria are met and relevant risk-proportional gates pass. Do not add verification layers, speculative tests, unrelated refactors, or polish solely to create more evidence.
