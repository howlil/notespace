# Notespace Agent Operating Guide

This directory is the canonical operating context for software-engineering agents working on Notespace.

It exists so an agent can understand the product, current iteration, architecture boundaries, design intent, quality expectations, and implementation-specific skills without relying on chat history, model memory, or a vendor-specific planning feature.

## Read order

Before making a meaningful change, read in this order:

1. `CURRENT_ITERATION.md` — what is active now, why, scope, progress, evidence, next move.
2. `PROJECT.md` — what Notespace is, who it is for, product/domain model, behavior, constraints, non-goals.
3. `ARCHITECTURE.md` — system boundaries, state ownership, data flow, technical invariants, open decisions.
4. `DESIGN.md` — product shape, UI hierarchy, interaction and visual rules.
5. Relevant implementation skill under `skill/` for the area being changed.
   - Frontend/Web work: `skill/fe-skill.md`.
6. `QUALITY.md` — verification expectations and release gates.
7. `RETROSPECTIVE.md` — how to improve the delivery system after meaningful work.

Implementation skills specialize the canonical project rules; they do not replace them.

For frontend work, `skill/fe-skill.md` contains the approved frontend stack and frontend-specific implementation rules. Its explicit frontend technology decisions supersede older baseline statements that left the frontend framework/runtime open.

If repository code or explicit user instruction conflicts with these documents, stop and surface the contradiction. Do not silently reinterpret product behavior or architecture.

---

# Canonical engineering lifecycle

Use this lifecycle as the default:

`USER INTENT → UNDERSTAND → BOUND → SPECIFY → DESIGN → IMPLEMENT → VERIFY → QUALITY GATES → RELEASE READY → STOP`

Stages may be fused for small, unambiguous work. The lifecycle is a reasoning model, not mandatory ceremony.

## Ownership

### User owns

- WHY the product or change exists.
- WHAT behavior is desired.
- Product scope.
- Architecture boundaries.
- Acceptance criteria.
- Public contracts.
- Data ownership.
- Security boundaries.
- Material technical decisions.

### Engineering agent owns

Within approved boundaries, the agent owns:

- repository inspection;
- implementation design;
- coding;
- tests;
- debugging;
- verification;
- local implementation decisions;
- local refactoring required by the change;
- quality gates.

Do not convert implementation autonomy into product or architecture autonomy.

---

# Core operating principles

## 1. Problem first

Understand the user-visible problem before choosing framework, abstraction, library, data model, or infrastructure.

Ask internally:

- What observable behavior changes?
- Which component owns that behavior?
- What existing pattern already solves most of it?
- What is the smallest coherent vertical slice?

## 2. Minimum coherent change

Prefer:

`reuse → extend → small local abstraction → new component → architecture change`

Modify only what is required for the requested behavior.

Avoid unless necessary:

- unrelated refactors;
- broad renames;
- directory reorganizations;
- speculative abstractions;
- future-proofing without a current requirement;
- dependency upgrades unrelated to the task;
- behavior changes outside acceptance criteria.

## 3. Stop conditions

Stop and request explicit user direction when a change requires or implies:

- contradictory requirements;
- destructive migration;
- public contract change;
- security boundary change;
- material architecture boundary change;
- a new source of truth for domain state;
- a major dependency or infrastructure decision that materially changes maintenance, cost, or deployment.

## 4. Evidence over confidence

“Done” means evidence exists.

Evidence may include:

- passing tests;
- type-check/build success;
- lint/static analysis;
- screenshots or interaction validation for UI behavior;
- migration verification;
- performance measurement where performance is relevant;
- logs/traces for runtime behavior;
- exact changed files and behavior verified.

Do not declare success based only on code inspection.

---

# Feature Compass

At any meaningful point in an iteration, an agent should be able to answer four questions without replaying chat history:

1. **Feature Shape** — what will the feature look like and how will it behave?
2. **Current Position** — where are we in the lifecycle/iteration?
3. **Delta** — what has changed from the previous working state?
4. **Next Move** — what is the single next meaningful action?

Keep this orientation compact. Do not repeat the entire specification unless needed.

`CURRENT_ITERATION.md` is the canonical source of truth for active iteration state.

---

# Code quality rule

The target is the smallest correct, clear, maintainable change.

Preserve these invariants:

- existing behavior outside scope remains stable;
- ownership is clear;
- dependencies are intentional;
- repository conventions are followed;
- the simplest adequate design is preferred;
- dead code introduced or exposed by the change is removed when safe;
- change surface is proportional to the requirement.

Organize code around responsibility and ownership, not arbitrary directory symmetry.

Avoid generic `utils` dumping grounds and abstraction-by-default.

---

# Documentation rule

Prefer self-explanatory code.

Document WHY, constraints, invariants, non-obvious behavior, public APIs, concurrency/consistency assumptions, security-sensitive behavior, compatibility constraints, and unusual workarounds.

Keep documentation near the code or decision it describes. Update documentation with behavior changes and remove stale documentation.

---

# Dependency rule

Treat every dependency as code the project now owns operationally.

Before adding one, establish:

- the actual problem it solves;
- why existing capabilities are insufficient;
- maintenance and security surface;
- runtime/bundle/deployment impact;
- replacement difficulty;
- whether the dependency is product-critical or merely an implementation detail.

For Notespace specifically, keep domain state independent from renderer/editor internals so core dependencies can be replaced without rewriting the product model.

---

# Working protocol

For a non-trivial task:

1. Inspect `CURRENT_ITERATION.md`.
2. Inspect relevant code/tests/configuration before proposing implementation.
3. Read the relevant implementation skill for the area being changed.
4. Restate the bounded behavior change if ambiguity exists.
5. Identify ownership and blast radius.
6. Implement the smallest vertical slice.
7. Verify observable behavior.
8. Run relevant quality gates.
9. Update `CURRENT_ITERATION.md` with completed work, evidence, and next move.
10. Stop when acceptance criteria are satisfied.

Do not continue adding “nice to have” work after the requested change is complete.
