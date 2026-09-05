# Current Iteration

## Active milestone

**M12 — Capture, Long-Note Navigation & Markdown Portability**

State: **implementation complete; automated verification pending**.

## Product outcome

Notespace closes the remaining core knowledge-loop gaps without adding a new top-level object, database system, plugin system, AI surface, or backend service.

```text
CAPTURE
  library surface
      ↓ Ctrl/Cmd + Shift + N
  choose Workspace
      ↓
  durable Note

WORK
  long Note
      ↓ headings
  Outline → exact heading

PORTABILITY
  Markdown file → Note
  Note → Markdown file
```

The milestone deliberately reuses the existing `Category → Workspace → Notes / Canvas` model and full-snapshot optimistic save contract.

## Slices

### Slice 1 — Library Quick Capture

User outcome:

- From Home or Category surfaces, `Ctrl/Cmd + Shift + N` opens Quick Capture.
- A compact persistent Quick Capture action provides pointer discoverability.
- User chooses an existing Workspace and writes without opening the Workspace first.
- The most recently used capture Workspace is remembered locally.
- Capture creates one durable Note inside the selected Workspace; it does not create an Inbox, independent Note aggregate, or new persistence model.
- Capture uses the existing Workspace fetch + optimistic snapshot save contract; version conflicts remain explicit rather than silently overwriting another tab.

Acceptance:

- empty capture cannot be submitted;
- no Workspace means capture remains disabled;
- successful capture closes the dialog and reports the destination Workspace;
- library navigation remains unchanged;
- Quick Capture is not injected over the full-screen Workspace surface.

### Slice 2 — Long-Note Outline

User outcome:

- Every Note editor exposes a small Outline action.
- Outline is derived directly from current Tiptap heading nodes.
- Heading hierarchy is reflected by indentation.
- Selecting an Outline item moves the editor to the exact stable heading block and restores editing focus.
- Notes without headings show an explanatory empty state rather than an empty menu.

Acceptance:

- no separate outline persistence/index is introduced;
- outline updates from authored editor state;
- heading navigation uses existing stable `blockId` identity;
- popup behavior remains dismissible and does not coexist with the slash-command popup.

### Slice 3 — Markdown Portability

User outcome:

- Quick Capture can load `.md` / `.markdown` files before saving them as Notes.
- Imported Markdown preserves the core structures Notespace already authors: headings, paragraphs, bullet/ordered lists, blockquotes, code blocks, horizontal rules, links, bold, italic, strike, and inline code where representable.
- Every Note editor can download its current authored content as a human-readable `.md` file.

Acceptance:

- no Markdown parser dependency is added;
- conversion remains a small deterministic adapter around the existing Tiptap snapshot contract;
- imported blocks receive stable block IDs so search/deep-link normalization does not depend on a later edit;
- JSON/ZIP recovery contracts remain unchanged; Markdown is interoperability, not a replacement persistence format.

### Slice 4 — Verification & Product Contract

Required gates before merge:

- root unit tests including Markdown adapter coverage;
- frontend TypeScript check;
- frontend lint with zero warnings;
- production frontend build;
- existing repository design-contract tests;
- risk-based GitHub Verify workflow green.

No browser/manual/black-box acceptance gate is introduced.

## Explicitly out of scope

- backlinks / graph view;
- independent top-level Notes;
- generic properties/databases;
- template/plugin marketplace;
- AI assistant or semantic search;
- collaboration/CRDT;
- Markdown as the canonical persistence format;
- reopening cross-surface Send/Link semantics removed by M11.

## Integration rule

Merge this milestone to `master` only after the automated PR verification gate is green. After merge, stop feature expansion and reassess the real capture → work → find → resume loop before promoting another feature milestone.
