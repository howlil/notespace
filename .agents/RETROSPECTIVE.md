# Notespace — Retrospective Rule

Retrospective exists to improve the delivery system from evidence. It is not a ceremony, status report, brainstorming ritual, or documentation quota.

Use the loop:

`Evidence → Bottleneck → Root Cause → Small Improvement → Verify`

---

# 1. When to run a retrospective

Run one when:

- a meaningful sprint/iteration finishes;
- a release finishes;
- delivery was materially slower than expected;
- significant rework occurred;
- a production failure occurred;
- the same defect or engineering friction repeats;
- the user explicitly requests one.

Do not run a retrospective after every trivial change.

---

# 2. Evidence first

Start with observable evidence, for example:

- requirement changes;
- `MILESTONE.md` and `STATE.md` history;
- git commits/diff size;
- files changed;
- PR/review cycles;
- failed tests;
- CI/build/deploy failures;
- repeated debugging loops;
- production incidents;
- migration failures;
- unnecessary abstractions/files/dependencies;
- waiting/blocking time;
- repeated agent/tool calls;
- duplicated work;
- user corrections;
- acceptance criteria missed on first attempt;
- visual regressions found only after screenshot validation;
- implementation that drifted from Project/domain boundaries.

Do not begin with opinions such as “communication could improve” unless evidence identifies what failed.

---

# 3. Find the bottleneck

A retrospective should identify the **single most material bottleneck** first.

Examples:

- requirement ambiguity caused three implementations;
- no persistent iteration state caused repeated repository discovery;
- editor boundary was unclear, causing Excalidraw internals to leak into domain code;
- missing integration test allowed persistence regression;
- UI was declared done before screenshot verification;
- build/deploy feedback took too long;
- agent spent time implementing deferred scope.

Do not create ten equal “lessons learned.” Prioritize.

---

# 4. Root cause

Ask why the bottleneck existed in the delivery system.

Useful categories:

## Requirement/system boundary

- behavior was not explicit;
- source of truth was unclear;
- domain ownership was ambiguous;
- acceptance criteria were missing.

## Engineering design

- wrong ownership boundary;
- abstraction introduced too early;
- dependency chosen before requirements;
- change surface was too large.

## Verification

- wrong tests;
- missing boundary test;
- no failure-path verification;
- no representative visual/performance check.

## Tooling/process

- slow feedback loop;
- missing script/automation;
- repeated manual setup;
- CI/deploy issue;
- agent state not externalized.

Stop at a cause that can be acted on. Do not over-analyze into vague cultural explanations.

---

# 5. Choose one small improvement

The improvement should target the root cause and have low process cost.

Good examples:

- add one integration test for Project persistence round trip;
- add exact quality command to `QUALITY.md` after stack is known;
- clarify one architecture invariant in `ARCHITECTURE.md`;
- add a script for a repeated local verification step;
- update `STATE.md` before context switches;
- add screenshot verification to UI acceptance criteria;
- remove an unused abstraction/dependency.

Bad examples:

- create a new planning framework;
- add multiple standing meetings/ceremonies;
- write a large generic checklist unrelated to the failure;
- rewrite architecture because one function was awkward.

---

# 6. Verify the improvement

Every retrospective improvement needs a future signal.

Examples:

```text
Improvement:
Add Project persistence round-trip integration test.

Verification:
The next persistence change fails locally/CI if document or canvas state no longer reloads correctly.
```

or:

```text
Improvement:
Keep STATE.md updated at each meaningful slice boundary.

Verification:
A new agent can identify done/current/next work without reading chat or reconstructing git history.
```

If the improvement cannot be verified, it is probably too vague.

---

# 7. Retrospective output format

Keep the output compact:

```markdown
# Retrospective — <iteration/release>

## Evidence
- ...

## Primary bottleneck
...

## Root cause
...

## Improvement
...

## Verification
...
```

Optional secondary finding only if it materially matters.

Do not turn retrospectives into complete iteration summaries; git history, `MILESTONE.md` and `STATE.md` already carry state/evidence.

---

# 8. Notespace-specific watch items

As the project develops, pay particular attention to recurring friction in these areas:

- keeping Project as the domain owner rather than splitting Note/Canvas product models;
- integration complexity between document editor and Excalidraw;
- editor focus/keyboard conflicts;
- persistence/autosave reliability;
- large scene/document performance;
- self-hosted backup/restore quality;
- import/export compatibility;
- dependency upgrades around embedded editors;
- UI drift from the calm tool-like design direction;
- over-expansion into AI, collaboration, structured diagrams, or other deferred features before the core loop is strong.

These are watch areas, not predetermined problems. Evidence must still drive conclusions.

---

# 9. Rule for changing `.agents`

A retrospective may improve `.agents` when evidence shows a durable operating rule is missing or wrong.

Do not change `.agents` after every inconvenience.

A rule belongs here only when:

- the problem is likely to recur;
- repository/code conventions alone do not solve it;
- the rule is specific enough to change behavior;
- the process cost is lower than the repeated failure cost.

Prefer editing an existing canonical rule over adding duplicate documentation.
