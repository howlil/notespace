# Current Iteration

## Product milestone

**M9 — Scalable Knowledge Navigation & Discovery**

State: **implemented on `master`; repository verification is automated and risk-proportional.**

Delivered product outcome:

```text
Home
  → resume recent workspace or global search
  → browse category summaries progressively
  → open category detail for large collections
  → search/filter/sort bounded workspace results
  → open exact workspace/note/block context
  → work in a full-screen Workspace
```

M9 implementation is integrated as `66207d6c3f01e95483c608ebc7d272d740fb183d`.

## Active engineering enabler

**Risk-based CI + repository agent/design alignment**

Classification: engineering/reliability work, **not a new product milestone or slice**.

### Current verification contract

- Keep one stable GitHub `Verify` check.
- Cancel obsolete runs for the same PR/ref.
- Classify changed boundaries and run only relevant web, Go, and production-composition gates.
- A workflow-definition change exercises the automated repository gates because the verification mechanism itself changed.
- Persistence/migration/runtime changes continue to run restart-durability smoke.
- UI behavior uses deterministic component/static/build evidence where applicable.
- Manual acceptance testing, black-box/browser testing, live-browser verification, and manual visual-review gates are not required.
- Root `DESIGN.md` remains the canonical UI design contract.
- `.agents` remains the six-file canonical knowledge set, with concise current state and no sprint diary/history dump.
- User-facing terminology is Category → Workspace → Notes / Canvas; `Project` is documented as internal compatibility naming only.

## Evidence

Current repository verification includes frontend static/unit checks, Go formatting/vet/race/build checks, and production Compose/restart persistence smoke when the changed boundary requires it.

Environment-specific behavior that cannot be reproduced deterministically is treated as explicit residual risk rather than a manual acceptance gate.

## Next action

Use the current `Verify` workflow result as the integration evidence for subsequent changes. Fix only evidence-backed failures; do not reintroduce browser/manual acceptance ceremony.
