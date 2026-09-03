# Current Iteration

## Product milestone

**M9 — Scalable Knowledge Navigation & Discovery**

State: **implemented on `master`; final browser acceptance is being closed by the current verification run.**

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

### Why

The previous `Verify` workflow ran frontend, Go race tests, full Playwright, Docker build, and restart-persistence smoke for every PR regardless of changed boundary. That produced unnecessary verification latency for docs/UI-only/backend-only changes and did not encode the repository's current design-quality contract explicitly.

The `.agents` state also retained historical execution records and legacy “Project-centric” wording that could mislead future agents after the product moved to Category → Workspace.

### Acceptance criteria

- Keep one stable GitHub `Verify` check.
- Cancel obsolete runs for the same PR/ref.
- Classify changed boundaries and run only relevant web, Go, browser, and production-composition gates.
- A workflow-definition change must exercise the full gate once.
- UI changes continue to run browser verification against the real Go server.
- Persistence/migration/runtime changes continue to run restart-durability smoke.
- Design verification protects stable hierarchy/interaction/accessibility contracts, not exact pixels.
- Root `DESIGN.md` becomes the canonical UI design contract.
- `.agents` remains the six-file canonical knowledge set, with concise current state and no sprint diary/history dump.
- User-facing terminology is Category → Workspace → Notes / Canvas; `Project` is documented as internal compatibility naming only.

### Logical changes

1. Make `.github/workflows/verify.yml` risk-proportional while preserving its stable check identity.
2. Add browser design-contract coverage for Home progressive disclosure/keyboard navigation and Workspace focus separation.
3. Add root `DESIGN.md` from the canonical Notespace design direction.
4. Align `AGENTS.md` and `.agents` with the current milestone/slice/logical-change/task hierarchy, risk-based verification, product naming, and concise state rule.

## Evidence before CI

Repository inspection confirmed:

- previous CI was one unconditional monolithic job;
- Playwright already runs against the built web app served by the real Go server;
- existing browser tests capture trace/screenshot evidence and protect workspace lifecycle behavior;
- Compose restart smoke already proves durable acknowledged state when the deployment boundary is affected;
- current UI tokens already use the restrained steel-blue accent family required by the design direction.

## Next action

Run the pull request `Verify` workflow. Because the workflow file itself changes, this run must execute the complete web + Go + Playwright + Compose/restart gate. Fix only evidence-backed failures. When green, mark this engineering enabler complete and merge; do not invent a new milestone.
