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

## Implementation rule

Choose the smallest coherent change that satisfies the requested behavior and preserves ownership boundaries:

```text
reuse
→ extend existing owner
→ small local abstraction
→ new module/component
→ architecture change
```

Avoid unrelated refactors, speculative abstractions, dependency churn, and generic best-practice expansion.

## Keeping ownership clear

- Place new code in its existing owning capability; follow the structure and dependency rules in `.agents/engineering.md`.
- Web callers outside a feature use its public entry. Keep internal imports direct and preserve lazy editor boundaries.
- Keep SQL connections and transaction lifetime in the SQLite Store facade. Private query packages borrow SQL access.
- Move callers, colocated tests, source-contract paths, discovery, and script references together.
- Extend the existing architecture checks when a boundary changes; do not add generic catch-all folders or forwarding files for obsolete paths.

## Working loop

Inspect diff → identify owner/risk → load relevant contract sections → smallest coherent change → nearest faithful proof → review actual diff → exact-head CI → stop.

- Keep one coherent slice and one active implementation PR. A docs-only edit does not justify a local app build, full suite or manual regression dispatch.
- Start local proof at the changed boundary; expand only for actual risk. Do not rerun full CI locally after unrelated edits or dispatch duplicate verification just to obtain more green runs.
- After push, inspect exact-head check results and failing steps first. Fix the cause; rerun affected proof, never hide failure with retries or weakened assertions.
- Keep durable decisions in their existing canonical owner; task reasoning, proof links and temporary probes belong in the PR, not new repository reports.
- Report concisely: behavior, commands/results, exact CI SHA, blocker and next action. Merge is not release; publication, deployment, release-tag creation or destructive restore needs explicit authorization. CI must not invoke a model or require an AI API key.

## Verification rule

Verification is risk-proportional and evidence-driven.

Start with the narrowest deterministic test or check that proves the changed boundary. Escalate only when the behavior crosses repository-owned boundaries or the actual risk requires another automated layer.

Do not bypass a relevant automated gate merely to make CI green.

## Stop rule

Stop when the requested behavior or bounded refactor is complete and relevant automated checks are green. Do not invent unrelated cleanup or speculative polish automatically.
