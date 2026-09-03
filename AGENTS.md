# Notespace Agent Entry Point

This file is the thin repository entrypoint for SWE agents. It routes to authoritative project knowledge and current repository evidence; it does not duplicate a generic agent handbook.

## Canonical repository knowledge

`.agents/` contains exactly these durable files:

- `.agents/PROJECT.md` — product purpose, user-visible model, scope, invariants, non-goals, and constraints.
- `.agents/ARCHITECTURE.md` — responsibility placement, system/data/security/deployment boundaries, major flows, and invariants.
- `.agents/CURRENT_ITERATION.md` — only the active milestone/engineering work, evidence, blocker, and single next action.
- `.agents/CODE_PATTERNS.md` — repository-specific implementation conventions.
- `.agents/QUALITY.md` — repository-specific verification strategy and commands.
- `.agents/DECISIONS.md` — durable material decisions and rationale.

Root `DESIGN.md` is the canonical UI quality/design contract.

Do not add sprint diaries, duplicate workflow documents, generic skills, temporary plans, or historical archives under `.agents/`.

## Read order

Start with `.agents/CURRENT_ITERATION.md`.

Then read only what the requested change requires:

1. `.agents/PROJECT.md` for product behavior and scope.
2. `DESIGN.md` for any user-facing UI/interaction work.
3. `.agents/ARCHITECTURE.md` for ownership, data, persistence, security, or deployment boundaries.
4. `.agents/DECISIONS.md` for durable constraints.
5. `.agents/CODE_PATTERNS.md` before implementation/refactoring.
6. `.agents/QUALITY.md` before claiming verification or release readiness.

Inspect current code/tests before implementation. Repository evidence is implementation truth; durable product/architecture constraints remain authoritative unless explicitly superseded.

## Authority

When sources conflict:

1. explicit current user instruction;
2. `.agents/PROJECT.md`, `DESIGN.md`, and accepted `.agents/DECISIONS.md`;
3. `.agents/ARCHITECTURE.md`;
4. `.agents/CURRENT_ITERATION.md`;
5. `.agents/CODE_PATTERNS.md` and `.agents/QUALITY.md`;
6. current code/tests for implementation detail;
7. historical PR text, old plans, stale docs, and chat history.

The user owns WHY, WHAT, product behavior, scope, architecture boundaries, acceptance criteria, public/data contracts, data ownership, security boundaries, and material technical decisions.

The agent owns repository inspection, local implementation design within those boundaries, coding, debugging, testing, evidence collection, and refactors strictly required by the change.

Stop for contradictions, destructive/irreversible migration, public contract change, security-boundary change, or major architecture change without explicit authorization.

## Delivery decomposition

Use this hierarchy:

`Product Purpose → Core User Journey → Capability Map → Milestone → Slice → Logical Change → Task`

Definitions:

- **Milestone:** smallest coherent scope delivering one meaningful integrated product capability/workflow end-to-end.
- **Slice:** smallest demonstrable vertical behavior/scenario that materially advances the milestone outcome.
- **Logical Change:** coherent technical modification required by a slice or by explicitly requested engineering/reliability work.
- **Task:** concrete implementation action inside a logical change.

Do not turn every bug fix, CI change, migration, reliability improvement, or infrastructure change into a fake product milestone. Classify engineering enablers as engineering enablers unless they independently create product capability.

Plan at milestone boundaries; execute ordered slices continuously. Do not create tiny milestones, PRs, or ceremony merely to count progress. Optimize for integrated user capability and short user-outcome lead time.

## Implementation rule

Choose the smallest coherent change that satisfies the requested behavior and preserves ownership boundaries:

`reuse → extend existing owner → small local abstraction → new component → architecture change`

Avoid unrelated refactors, speculative abstractions, future-proofing, dependency churn, and generic “best practice” expansion.

## Verification rule

Verification is risk-proportional, automated, and evidence-driven. Start with the narrowest deterministic test/check that proves the changed boundary; escalate only when the behavior crosses repository-owned boundaries or risk requires another automated layer.

CI uses one stable `Verify` check with conditional web, Go, and production-composition gates. Manual acceptance testing, black-box/browser testing, live-browser verification, and manual visual review are not required merge or release gates. Do not bypass a relevant automated gate to make CI green, but do not run expensive unrelated gates merely as ceremony.

For UI changes, protect stable behavior and design contracts from `DESIGN.md` through deterministic component/static/build evidence where applicable; do not create a manual screenshot-review completion gate.

## Stop rule

Stop when the bounded product criteria are satisfied and relevant automated gates are green. Record the evidence and one next action in `CURRENT_ITERATION.md`. Do not invent a new milestone or speculative polish automatically.
