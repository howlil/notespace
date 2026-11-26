# User guide

## Library and navigation

Welcome and Canvas share one shell at `/` and `/workspaces/:id`. Organize workspaces in categories, toggle the Explorer with the logo, and find workspaces using Quick Open (`Ctrl/Cmd+K`). Browser and Windows desktop share the same core product behavior.

## Canvas

A workspace contains a canvas for spatial authoring. Use shapes, arrows, diagrams, images, code blocks and isolated HTML previews. Pan and zoom are local view state, not authored changes.

### Notes

Notes are authored on the canvas as cards, not separate note pages. Create a Note card, type content, and use canvas connections to relate it to other ideas. Select a card to move or resize it; use Enter or double-click to edit. A linked placement references the same note content, while Duplicate creates a separate note. Drop or paste an image into the editor to add it to the note. Removing a placement is not the same as deleting the note: use Trash for intentional note deletion and recovery. See the [product contract](../.agents/product.md) for detailed interaction semantics.

#### Writing in Markdown

A note is plain Markdown text. Headings, emphasis, lists, task lists, quotes, links, code, tables and images use the standard syntax, and a note shows its rendered form until you edit it. Clicking a task or a toggle on a card updates the text. Notespace adds a few conventions:

| Write | To get |
|---|---|
| `$x^2$` or a `$$` block | typeset math |
| `> [!tip]` first line of a quote | callout (`note`, `info`, `tip`, `warning`, `danger`) |
| `<details open>` with `<summary>Title</summary>` | toggle |
| `<mark data-tone="yellow">`, `<span data-color="blue">`, `<u>` | highlight, text colour, underline |
| `^id` at the end of a block | a name other notes can point to |
| `![label](/workspaces/<workspace>?noteId=<note>)` | embedded note |
| `[label](/workspaces/<workspace>?noteId=<note>&blockId=<id>)` | reference to a block of another note |

Other HTML, unsafe links and images from outside the library are shown as text and never run. The first readable line of a note is its label. Notes written before Markdown became the only format were converted once when you upgraded; see Compatibility below.

The former standalone note navigation, Split View and Focus Mode are retired. Current workspace links can use `noteId` or `blockId` query parameters to focus canvas content.

## Save and consistency behavior

Edits update immediately and durable Canvas saves are coalesced through the granular Canvas boundary. Canvas Note content has its own save boundary. **Saved** appears only after pending authoring writes are acknowledged by SQLite. Normal autosave does not write periodic history checkpoints.

For the same Workspace opened in multiple tabs in one browser, Canvas element changes are exchanged directly through `BroadcastChannel` and reconciled with Excalidraw element version semantics. This local path is coalesced separately from server autosave, so sibling tabs can converge quickly without sending an HTTP request for every pointer movement.

Granular durable Canvas writes carry the version of the resource they mutate and use the Excalidraw-specific reconciliation boundary. The retired full-workspace update routes are not available.

Pan and zoom are per-tab view state and are not persisted as authored Canvas changes. This prevents ordinary navigation from generating unnecessary saves or false conflicts.

This is same-browser multi-tab synchronization, not cross-device multiplayer collaboration or offline CRDT synchronization.

Moving a Workspace to Trash captures its authored state and image assets inside one SQLite transaction before removing it from the active library. Full-library backup uses a consistent SQLite read transaction; restore is all-or-nothing.

## Search behavior

SQLite authored state remains authoritative. Granular Canvas saves acknowledge after the authored transaction commits and deliberately leave FTS repair to the next search. Lower-frequency create/move operations may refresh their projection eagerly. Search compares projection metadata with authored revisions and repairs stale rows lazily, so derived indexing never turns a successfully committed Canvas save into a failed save.

## Data ownership and recovery

The Library tools surface exposes:

- **Backup** — downloads a versioned `notespace-backup.zip` containing library data and deduplicated binary blobs;
- **Restore** — transactionally replaces the current library from a Notespace ZIP backup;
- **Trash** — restores deleted Workspaces and Notes or deletes them permanently.

The library backup contains categories, workspace snapshots, image assets, Canvas Notes and note placements. Backups from earlier versions are accepted and their notes are converted to Markdown on import; a backup that cannot be converted is rejected and your library is left unchanged. FTS/search projection rows are intentionally excluded because they are derived and rebuilt from authored state.

The application backup/restore path is currently intentionally capped at **64 MiB** because the archive adapter still assembles a round trip in memory. For a larger installation, use infrastructure-level backup until archive streaming is implemented: stop the container and copy the complete SQLite volume, or use an equivalent SQLite-safe snapshot procedure. Do not copy a live database directory file-by-file as a substitute for a consistent SQLite snapshot.

Restore replaces the current library. Export a fresh backup first, keep it outside the application data directory, and verify the restored content before discarding the original copy.

## Compatibility

When a library from an earlier version opens for the first time, Notespace saves a verified recovery copy of the database, then converts each rich note to Markdown in one step. Note identities, placements, links and images are kept, and the original of every converted note stays in the library. Formatting Markdown cannot express, such as merged table cells or styling inside a toggle title, is simplified; the text is not lost. A backup exported after this change can only be restored by a version that understands it.

Historical Capture, Task, Milestone and Activity interfaces are retired. Legacy archive and migration handling does not imply those HTTP routes or screens remain available.

## API compatibility

Workspace terminology is canonical for new clients:

```text
/workspaces/:id
/api/workspaces/*
```

Legacy `/api/projects/*`, full-workspace PATCH and retired planning, capture and activity endpoints are not available. Current note content uses `/api/notes/*`, with placements managed under `/api/workspaces/{id}/note-instances`.

For deployment-specific database paths and safe volume handling, see [Self-hosting](SELF_HOSTING.md). Report ordinary issues via [Support](../SUPPORT.md).
