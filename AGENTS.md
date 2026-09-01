# Notespace Agent Entry Point

This file is the thin, agent-agnostic gateway for repository work. It routes agents to authoritative project knowledge; it does not duplicate global SWE workflow rules.

## Canonical project knowledge

`.agents/` contains exactly these canonical files:

- `.agents/PROJECT.md` — product intent, scope, behavior, contracts, non-goals, and project constraints.
- `.agents/ARCHITECTURE.md` — responsibility placement, system/data/security/infrastructure boundaries, major flows, and invariants.
- `.agents/CURRENT_ITERATION.md` — the single source of truth for the active milestone and slice, evidence, blockers, and next action.
- `.agents/CODE_PATTERNS.md` — repository-specific implementation conventions and ownership patterns.
- `.agents/QUALITY.md` — repository-specific verification commands and quality gates.
- `.agents/DECISIONS.md` — durable material project/architecture decisions and rationale.

Do not add workflow mirrors, sprint diaries, generic skills, temporary plans, or duplicate sources of truth under `.agents/`.

## Normal read order

Always read `.agents/CURRENT_ITERATION.md` before changing the repository.

Then read only what the task requires:

1. `.agents/PROJECT.md` for product behavior, scope, contracts, or user-visible semantics.
2. `.agents/ARCHITECTURE.md` for ownership, data flow, persistence, security, deployment, or boundary changes.
3. `.agents/DECISIONS.md` for material decisions that constrain the implementation.
4. `.agents/CODE_PATTERNS.md` before implementation or refactoring.
5. `.agents/QUALITY.md` before claiming verification, release readiness, or completion.

Inspect the current code and tests for implementation truth. Do not assume documentation overrides newer observable repository evidence unless it states an intentional product/architecture constraint.

## Authority order

When sources conflict, use this order:

1. explicit current user instruction;
2. `.agents/PROJECT.md` and approved durable entries in `.agents/DECISIONS.md`;
3. `.agents/ARCHITECTURE.md`;
4. `.agents/CURRENT_ITERATION.md`;
5. `.agents/CODE_PATTERNS.md` and `.agents/QUALITY.md`;
6. current code and tests for implementation details;
7. historical plans, old PR descriptions, stale docs, and chat history.

## Operating boundary

The user owns WHY, WHAT, product behavior, scope, architecture boundaries, acceptance criteria, public contracts, data ownership, security boundaries, and material technical decisions.

The agent owns repository inspection, implementation design within approved boundaries, coding, testing, debugging, implementation-level decisions, local refactoring required by the change, and evidence collection.

Stop and surface the decision instead of proceeding through a contradiction, destructive/irreversible migration, public contract change, security-boundary change, or major architecture change that lacks explicit authorization.

## Delivery model

Use the repository state in `.agents/CURRENT_ITERATION.md` as the resumable execution context.

Work hierarchy:

`Milestone → Slice → Logical Change → Commit`

Plan at milestone boundaries. Execute ordered slices continuously. Integrate at logical-change boundaries. Do not create a new sprint/branch/plan merely because a small implementation step exists.

When the active milestone is complete, mark the milestone gate with evidence and stop. Do not invent the next milestone.
