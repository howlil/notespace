# Notespace Agent Entry Point

This file is the thin repository entrypoint for SWE agents. Keep detailed engineering rules out of this file.

## Canonical local guidance

For implementation, refactoring, architecture, file structure, module ownership, dependency direction, or code organization:

- read `.agents/engineering.md` first;
- treat it as the canonical repository-local engineering contract.

For user-facing UI and interaction work, also read `DESIGN.md`.

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

## Verification rule

Verification is risk-proportional and evidence-driven.

Start with the narrowest deterministic test or check that proves the changed boundary. Escalate only when the behavior crosses repository-owned boundaries or the actual risk requires another automated layer.

Do not bypass a relevant automated gate merely to make CI green.

## Stop rule

Stop when the requested behavior or bounded refactor is complete and relevant automated checks are green. Do not invent unrelated cleanup or speculative polish automatically.
