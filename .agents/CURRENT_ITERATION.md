# Current Iteration

## Status

**Milestone: Editor Completeness — integration gate.**

PR #25 implements the current user-facing editor milestone and is awaiting exact-head verification before merge.

## Product outcome

Notespace Note authoring now covers the highest-frequency document operations without requiring Markdown knowledge or paste-only workarounds:

- viewport-aware slash-command and selection-popup placement with flip + clamp behavior;
- selection formatting for bold, italic, strike, inline code, highlight, and links;
- proper link create/edit/remove/open/copy interactions;
- local Find & Replace;
- interactive checklist creation and toggling;
- table insertion plus row/column/table editing controls;
- syntax-highlighted code blocks with language, copy, and wrapping controls;
- inline and block mathematics via Tiptap Mathematics + KaTeX;
- image insertion plus alt-text and removal controls;
- Motion React on meaningful contextual surfaces with user reduced-motion respected.

## Regression fixed

Slash-command popup positioning is no longer hard-coded below the caret. When the caret is near the bottom of the viewport, the popup flips above; horizontal and vertical placement is clamped to remain visible.

## Architecture / scope

- Tiptap snapshot persistence remains canonical authored state.
- Markdown remains an interoperability adapter, now preserving the newly authored editor structures where applicable.
- No backend API, SQLite schema, workspace ownership, autosave, or deployment contract changes.
- Motion is limited to contextual UI/state transitions; typing, caret movement, pane resizing, canvas interaction, and scrolling remain unanimated.

## Verification required

Before merge:

1. exact-head PR `Verify` must complete successfully;
2. frontend typecheck, lint, unit tests, and production build must pass;
3. PR must remain mergeable at the verified head;
4. merge must use that exact head SHA.

## Next meaningful action

Merge PR #25 after the exact-head verification gate is green, then update this file on `master` only if material shipped-state evidence differs from the PR result.
