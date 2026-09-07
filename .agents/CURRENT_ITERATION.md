# Current Iteration

## Status

**No active milestone.**

Latest completed user-facing change: **Markdown rich paste + editor select-all reliability**.

- PR: #20
- exact-head Verify: #164 — success
- merged commit: `349eeebbed20aab444b0f9387fc367e7b1a78056`

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

Supported authored Markdown includes headings through H6, fenced code blocks, blockquotes, bullet and ordered lists, dividers, links, inline code, strike, bold, italic, and combined bold+italic. Plain prose continues through native plain-text paste; existing rich-HTML paste remains native; image paste keeps the durable workspace-asset path.

`Ctrl/Cmd + A` is no longer shadowed by a local editor handler. StarterKit/ProseMirror owns the standard Mod-A whole-document selection behavior.

## Evidence

- focused Markdown parser/paste-detection tests: 6/6 passed locally;
- PR #20 exact-head `Verify` #164: success;
- frontend static/type, lint, unit, and production build gates passed;
- backend and production-composition gates were correctly skipped because no server, persistence, migration, or runtime boundary changed.

## Explicitly unchanged

- Tiptap snapshot persistence remains canonical authored state;
- Markdown remains an interoperability adapter rather than a second persistence format;
- image durability and workspace asset ownership are unchanged;
- optimistic versioning/autosave behavior is unchanged;
- backend API, SQLite schema, deployment composition, and study behavior are unchanged.

## Next meaningful action

STOP. Use the product and identify the next demonstrated user-facing bottleneck; do not promote follow-up work from feature inventory alone.
