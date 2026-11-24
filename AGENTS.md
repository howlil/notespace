# Notespace Agent Entry Point

This file is the thin repository entrypoint for SWE agents. Keep detailed engineering rules out of this file.

## Canonical local guidance

Start with the diff and owning code/tests, then read the relevant contract sections—not every document in full:

- `.agents/engineering.md` is the first engineering contract: responsibilities, state/structure, contracts and fitness rules for the affected owner. Expand to flows, guarantees and challenge when the change crosses those boundaries.
- For user-facing UI/interaction, also read the relevant `DESIGN.md` interaction, token and quality rules. `.agents/DESIGN.md` is a compact supplement, not an override.
- Use the relevant `docs/ARCHITECTURE.md` section when ownership, callers or dependency direction is unclear; it is an implementation map, not another policy source.
- Use the owning test section and focused commands in `docs/TESTING.md`; read CI/release sections when those boundaries change.

Reuse unchanged contracts already read in the session. Narrow reading is not permission to ignore an applicable rule; expand when evidence reveals a wider impact.

Inspect the current code and tests before implementation. Repository evidence is implementation truth unless an explicit current rule or decision supersedes it.

## Authority

When sources conflict:

1. explicit current user instruction;
2. `.agents/engineering.md` for engineering structure and implementation boundaries;
3. `DESIGN.md` for UI quality and interaction rules;
4. current code and tests for implementation detail;
5. historical PR text, old plans, stale docs, and chat history.

The user owns product behavior, scope, public/data contracts, data ownership, security boundaries, and material architecture decisions.

The agent owns repository inspection, local implementation design within those boundaries, coding, debugging, testing, evidence collection, and refactors required by the requested change.

Stop for contradictions, destructive or irreversible migrations, public contract changes, security-boundary changes, or major architecture changes without explicit authorization.

## Operating rules

Choose the smallest coherent change that satisfies the requested behavior and preserves ownership boundaries:

```text
reuse
→ extend existing owner
→ small local abstraction
→ new module/component
→ architecture change
```

- Start with the affected owner, its callers, and the nearest existing tests. Reuse context already read and widen the search when the evidence crosses a boundary.
- For a feature, establish the data shape, owner, invariants, and external input boundary before writing logic. Reuse the owning capability. Compare prototypes when a consequential design choice remains uncertain.
- For a bug, reproduce the failure, isolate the cause, fix it, and rerun the reproduction. Revisit the initial assumptions after repeated failed fixes. For performance work, measure before and after under comparable conditions.
- For a refactor, identify the behavior to preserve. Simplify in small, verifiable increments. Move callers, tests, and script references together, then delete obsolete internal APIs.
- Make reversible decisions independently within the current scope. For recurring failures, simplify the structure first, use types or lint for enforceable rules, and keep guidance for decisions that require judgment.

## Working loop

Inspect diff → identify owner/risk → load relevant contract sections → smallest coherent change → nearest faithful proof → review actual diff → exact-head CI → stop.

- Keep one coherent slice and one active implementation PR. A docs-only edit does not justify a local app build, full suite or manual regression dispatch.
- Run the affected proof locally and let the required CI gate select the wider checks.
- After push, inspect exact-head check results and failing steps first. Fix the cause; rerun affected proof, never hide failure with retries or weakened assertions.
- Keep durable decisions in their existing canonical owner; task reasoning, proof links and temporary probes belong in the PR, not new repository reports.
- Report concisely: behavior, commands/results, exact CI SHA, blocker and next action. Merge is not release; publication, deployment, release-tag creation or destructive restore needs explicit authorization. CI must not invoke a model or require an AI API key.

## Verification rule

Name the observable result or invariant at risk. Use types and lint for structure, a focused test for a rule, real dependencies for persistence or transport semantics, and the affected user journey when the outcome depends on browser or native behavior. Reuse existing proof and add a test only for a material gap. Assert on results, durable state, or public effects. Report the evidence and any unverified behavior. Required gates must pass.

## Stop rule

Stop when the requested behavior or bounded refactor is complete and relevant automated checks are green. Do not invent unrelated cleanup or speculative polish automatically.
