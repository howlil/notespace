# Current Iteration

## Status

**No active milestone.**

Latest completed user-facing change: **Markdown rich paste + editor select-all reliability**.

- PR #20 — core Markdown rich paste + native Mod-A select-all
  - exact-head Verify #164 — success
  - merged commit: `349eeebbed20aab444b0f9387fc367e7b1a78056`
- PR #21 — GFM tables, nested lists, and task state
  - exact-head Verify #167 — success
  - merged commit: `795693e9887eb6a40d0bea1d37a2795858e4e442`

## Product outcome shipped

A copied Markdown response can now be pasted directly into a Note and becomes editable native Tiptap content at the current selection instead of remaining Markdown source text.

```text
COPY MARKDOWN RESPONSE
        ↓
PASTE INTO NOTE
        ↓
DETECT AUTHORED MARKDOWN
        ↓
PARSE TO TIPTAP NODES
        ↓
EDIT AS RICH CONTENT
```

Supported common AI-response Markdown includes:

- headings H1-H6;
- bold, italic, combined emphasis, strike, inline code, and links;
- fenced code blocks;
- blockquotes and dividers;
- bullet and ordered lists, including nested list structure and non-1 ordered starts;
- task lists with checked/unchecked state preserved;
- GFM pipe tables, with or without outer pipes.

Plain prose continues through native plain-text paste; existing rich-HTML paste remains native; pasted image files keep the durable workspace-asset path. The editor now has local Tiptap schema/rendering support for pasted tables and task checked state without introducing a second persistence format.

`Ctrl/Cmd + A` is no longer shadowed by a local editor handler. StarterKit/ProseMirror owns the standard Mod-A whole-document selection behavior.

## Evidence

- focused Markdown adapter tests: 8/8 passed locally, including nested lists, task state, table detection, and table round-trip;
- PR #20 exact-head `Verify` #164: success;
- PR #21 exact-head `Verify` #167: success;
- frontend static/type, lint, unit, and production build gates passed on both exact heads;
- backend and production-composition gates were correctly skipped because no server, persistence, migration, or runtime boundary changed.

## Explicitly unchanged

- Tiptap snapshot persistence remains canonical authored state;
- Markdown remains an interoperability adapter rather than a second persistence format;
- image durability and workspace asset ownership are unchanged;
- optimistic versioning/autosave behavior is unchanged;
- backend API, SQLite schema, deployment composition, and study behavior are unchanged;
- task-list authoring/toggling remains outside this change; pasted checked state is preserved and rendered.

## Next meaningful action

STOP. Use the product and identify the next demonstrated user-facing bottleneck; do not promote follow-up work from feature inventory alone.
