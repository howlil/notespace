# User guide

## Library and navigation

Welcome and Canvas share one shell at `/` and `/workspaces/:id`. Organize workspaces in categories, toggle the Explorer with the logo, and find workspaces using Quick Open (`Ctrl/Cmd+K`). Browser and Windows desktop share the same core product behavior.

## Canvas

A workspace contains a canvas for spatial authoring. Use shapes, arrows, diagrams, images, code blocks and isolated HTML previews. Pan and zoom are local view state, not authored changes.

### Notes

Notes are authored on the canvas as cards, not separate note pages. Create a Note card, type content, and use canvas connections to relate it to other ideas. Select a card to move or resize it; use Enter or double-click to edit. A linked placement references the same note content, while Duplicate creates a separate note. Removing a placement is not the same as deleting the note: use Trash for intentional note deletion and recovery. See the [product contract](../.agents/product.md) for detailed interaction semantics.

The former standalone note navigation, Split View and Focus Mode are retired. Legacy browser links with `?note=...` or `?block=...` still open the workspace canvas. This does not mean current Canvas Note cards are retired.

## Save and consistency behavior

Edits update immediately and durable Canvas saves are coalesced through the granular Canvas boundary. Canvas Note content has its own save boundary; legacy compatibility fields remain separate. **Saved** appears only after pending authoring writes are acknowledged by SQLite. Normal autosave does not write periodic history checkpoints.

For the same Workspace opened in multiple tabs in one browser, Canvas element changes are exchanged directly through `BroadcastChannel` and reconciled with Excalidraw element version semantics. This local path is coalesced separately from server autosave, so sibling tabs can converge quickly without sending an HTTP request for every pointer movement.

Granular durable Canvas writes carry the version of the resource they mutate and use the Excalidraw-specific reconciliation boundary. Legacy whole-workspace update routes remain compatibility surfaces, not the primary authoring path.

Pan and zoom are per-tab view state and are not persisted as authored Canvas changes. This prevents ordinary navigation from generating unnecessary saves or false conflicts.

This is same-browser multi-tab synchronization, not cross-device multiplayer collaboration or offline CRDT synchronization.

Moving a Workspace to Trash captures its authored state and image assets inside one SQLite transaction before removing it from the active library. Full-library backup uses a consistent SQLite read transaction; restore is all-or-nothing.

## Search behavior

SQLite authored state remains authoritative. Granular Canvas saves acknowledge after the authored transaction commits and deliberately leave FTS repair to the next search. Lower-frequency create/move operations may refresh their projection eagerly. Search compares projection metadata with authored revisions and repairs stale rows lazily, so derived indexing never turns a successfully committed Canvas save into a failed save.

## Data ownership and recovery

The Library tools surface exposes:

- **Backup** — downloads a versioned `notespace-backup.zip` containing library data and deduplicated binary blobs;
- **Restore** — transactionally replaces the current library from a compatible Notespace ZIP backup or legacy JSON backup;
- **Trash** — restores accidentally deleted Workspaces or deletes them permanently;
- **Import Markdown vault** — selects a Markdown directory/vault and imports files into a chosen Category.

The library backup contains authored library data and compatibility records as supported by the archive version. FTS/search projection rows are intentionally excluded because they are derived and rebuilt from authored state.

The application backup/restore path is currently intentionally capped at **64 MiB** because the archive adapter still assembles a round trip in memory. For a larger installation, use infrastructure-level backup until archive streaming is implemented: stop the container and copy the complete SQLite volume, or use an equivalent SQLite-safe snapshot procedure. Include SQLite WAL files when copying a live data directory.

Restore replaces the current library. Export a fresh backup first, keep it outside the application data directory, and verify the restored content before discarding the original copy.

## Compatibility

Historical Capture, Task, Milestone and Activity records and HTTP contracts remain for compatibility, not as promises of active navigation features. Historical activity accounting uses explicit start/pause/end events; a logical session spanning midnight may be stored as multiple daily segments.

## API compatibility

Workspace terminology is canonical for new clients:

```text
/workspaces/:id
/api/workspaces/*
```

Legacy browser `/projects/:id` URLs redirect to `/workspaces/:id`. Legacy `/api/projects/*` routes remain temporarily available for compatibility and advertise deprecation; new application code should not introduce new Project-named HTTP consumers.

For deployment-specific database paths and safe volume handling, see [Self-hosting](SELF_HOSTING.md). Report ordinary issues via [Support](../SUPPORT.md).
