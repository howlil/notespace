# Notespace — Verification and Quality Gates

## Principle

Use the smallest automated evidence set that proves the requested behavior and protects the changed boundary. Verification exists to reduce product/reliability risk, not to maximize test count or gate count.

Evidence priority:

1. observable behavior covered by deterministic automated checks;
2. boundary/invariant behavior;
3. internal correctness/static checks.

Do not claim a gate passed unless it ran on the relevant head.

Manual testing, manual acceptance, live-browser review, and black-box browser testing are not required merge or release gates in this repository. If an environment-specific behavior cannot be reproduced deterministically, document the residual risk instead of introducing a human acceptance gate.

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
task verify
task up
task down
task logs
```

Use underlying pnpm, Go, and Docker commands when a narrower diagnosis is required. Do not add another orchestration system without measured need.

## Verification selection

Use this escalation model:

```text
changed behavior/boundary
  → focused deterministic test/check
  → owning package/surface gate
  → repository-owned integration check when boundaries cross
  → production composition/restart gate when runtime or durability changes
```

Do not jump to the most expensive layer first. A higher-cost layer is justified only when it observes a material failure that cheaper automated evidence cannot.

## CI model

GitHub Actions exposes one stable required check: `Verify`.

The job classifies changed files and conditionally runs these automated gates:

| Changed boundary | Required CI evidence |
| --- | --- |
| docs / `.agents` / non-runtime metadata | repository knowledge contract only |
| web code, UI, tests, JS/TS dependency/config | TypeScript + lint + web unit tests |
| Go server code | gofmt + vet + race tests + Go build |
| persistence/migrations/Compose/runtime smoke | relevant Go gates + production Compose + restart-persistence smoke |
| workflow definition itself | web + Go + production-composition gates |

Outdated runs are cancelled through workflow concurrency so CI capacity follows the newest head.

## Web and design verification

For user-facing changes, protect stable semantics through deterministic component/unit tests, static checks, accessibility semantics, and build integration where applicable. `DESIGN.md` remains the canonical design contract.

Do not require manual screenshot review, live-browser acceptance, black-box testing, or brittle screenshot-diff gates as completion criteria. Screenshots or traces may be used for optional debugging, but they are not verification gates.

## Backend verification

For Go changes, start with the affected package where possible, then run the repository server gate before integration:

```sh
task test:server PACKAGE=./internal/httpapi
task check:server
```

The server gate includes gofmt, `go vet`, `go test -race ./...`, and a production Go build in CI.

For HTTP/API mapping changes, use focused server tests and repository-owned contract/integration checks. Do not require a browser journey to establish completion.

## Persistence and migration verification

A durability claim should be proven automatically at the persistence/runtime boundary, for example:

```text
write → durable store → reload/restart → equivalent acknowledged state
```

Persistence/migration changes require focused database tests plus production-composition restart smoke when that boundary changes. Test failure/conflict/malformed or legacy data paths when relevant.

Destructive or irreversible migration remains a stop condition pending explicit user approval and recovery evidence.

## Deployment/runtime verification

Run Compose build/health/restart smoke only when deployment/runtime/persistence composition changes or when release qualification specifically needs that automated evidence.

Verify:

- Compose configuration resolves;
- image/container starts and becomes healthy;
- acknowledged authored state survives restart;
- verification does not delete persisted user data;
- `docker compose down -v` is never used as a normal verification step.

Do not run Docker merely because CSS, copy, isolated component, or documentation changed.

## Dependency changes

Add or upgrade dependencies only for a concrete requirement. Evaluate necessity, maintenance/security/license state, bundle/runtime impact, transitive infrastructure, and replacement difficulty.

Select deterministic checks that observe the dependency's affected boundary; dependency churn does not automatically require a higher verification layer.

## Release-ready evidence

Before marking a slice or engineering change complete, record only decision-useful evidence in `CURRENT_ITERATION.md`:

- observable behavior/capability changed;
- focused automated checks actually run;
- broader CI/Docker evidence when relevant;
- skipped automated gate and residual risk, if any;
- single next action or `STOP`.

## Stop rule

Stop when the requested behavior is satisfied and relevant automated risk-proportional gates pass. Do not add manual acceptance, black-box testing, verification layers, speculative tests, unrelated refactors, or polish solely to create more evidence.
