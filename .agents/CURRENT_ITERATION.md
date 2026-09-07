# Current Iteration

## Status

**Milestone: Data Durability & Scale Foundation — integration gate.**

This milestone hardens the existing single-instance SQLite architecture. It does not replace SQLite, split the workspace aggregate, or normalize Notes without evidence.

## Product outcome

Notespace data remains recoverable and internally consistent as workspaces accumulate notes, canvas images, history, trash, and study records. Image deletion has an explicit storage invariant: once an authored workspace save removes the final reference to an image, the corresponding durable SQLite BLOB is deleted and the same asset ID cannot be resurrected by a delayed upload or browser cache.

## Slices

### S1 — Backup round-trip safety

**Capability:** a full Notespace library can be exported and restored without Base64-amplifying binary assets.

- introduce backup archive v2 as ZIP;
- keep authored metadata in `manifest.json` and binary assets as raw `blobs/<sha256>` entries;
- deduplicate identical blobs by SHA-256;
- record blob size/hash and validate both before restore;
- reject duplicate/unsafe ZIP entries and checksum mismatch before replacing library data;
- retain legacy JSON v1 restore compatibility;
- export v2 as `notespace-backup.zip` and allow the web restore flow to accept ZIP or legacy JSON;
- prove export → destructive replacement → restore returns workspace identity/content, assets, categories, trash/history, and study data.

**Acceptance:** exported v2 manifest contains no Base64 asset payload; tampered archives fail without changing the current library; a valid v2 archive round-trips through the supported restore path.

### S2 — Migration immutability and schema drift detection

**Capability:** a running database can prove that released migrations and the physical schema still match repository expectations.

- extend `schema_migrations` metadata with SHA-256 checksum and applied timestamp while remaining compatible with existing name-only ledgers;
- backfill checksum metadata for already-applied migrations;
- reject startup when an applied migration checksum differs from the embedded migration;
- maintain a physical SQLite schema fingerprint after successful migration/integrity validation;
- reject unexpected schema drift before applying later migrations;
- add CI enforcement that released `apps/server/migrations/*.sql` files are append-only.

**Acceptance:** migration mutation or unexpected physical schema drift produces a deterministic startup/test failure; new migrations remain append-only.

### S3 — Integrity gates and restore validation

**Capability:** Notespace detects structural database corruption/constraint violations at safe boundaries rather than treating a successful `Ping` as sufficient integrity evidence.

- run `PRAGMA foreign_key_check` and `PRAGMA quick_check` after migrations before serving;
- expose the same validation over a transaction so a replacement library can be checked before commit;
- run integrity validation during full-library restore after replacement rows are staged and before commit;
- keep HTTP health lightweight; do not run database-wide checks for each health request.

**Acceptance:** FK violations or failed quick-check prevent startup/restore completion; a failed restore rolls back instead of leaving a partially replaced library.

### S4 — Image asset lifecycle and irreversible authored deletion

**Capability:** durable image ownership follows authored workspace references instead of accumulating orphan BLOBs.

- add `staged` lifecycle state to `workspace_assets` so upload-before-save remains safe;
- derive live asset references from workspace Document, Notes, Canvas, and compatibility reference snapshots (`assetId`, `fileId`, and `notespace-asset://` sources);
- promote a staged asset to live when an authored save references it;
- when a later authored save removes the final reference, tombstone the asset ID and hard-delete its row from `workspace_assets` in the same database update boundary;
- reject later PUT/read-through migration attempts for a tombstoned `(workspace_id, asset_id)` so delayed uploads cannot resurrect deleted data;
- prune the browser memory/IndexedDB compatibility cache after an acknowledged save using the server-authored reference set;
- garbage-collect abandoned staged uploads after a grace period;
- migrate existing referenced assets to live and remove pre-existing unreferenced legacy orphans.

**Acceptance:** deterministic persistence tests cover both Tiptap image `assetId` and Excalidraw `fileId`: after final authored reference removal, `GetAsset` returns not-found and a late upload with the same ID remains rejected.

### S5 — Trash/storage amplification removal

**Capability:** deleting a workspace to Trash does not duplicate binary images as Base64 JSON.

- replace new trash payload encoding with a binary compressed envelope;
- preserve workspace identity, authored snapshots, bounded history, and raw asset bytes;
- keep legacy JSON trash decoding for existing installations;
- keep Trash → Restore atomic and category fallback behavior unchanged.

**Acceptance:** newly trashed workspace payload is not JSON/Base64; restore returns the original workspace/history/assets; permanent trash deletion removes the stored trash payload.

### S6 — Workspace scale evidence, not speculative normalization

**Capability:** future normalization decisions are based on repository-owned measurements rather than architecture preference.

- add deterministic persistence evidence for database bytes, WAL bytes, backup bytes, representative workspace JSON size, update/autosave operation latency, and FTS sync latency;
- report p50/p95 for repeated update and FTS synchronization samples;
- publish the evidence as a short-lived CI artifact for persistence-affecting changes;
- keep the current workspace aggregate/schema unchanged in this milestone.

**Decision rule:** Notes/Canvas normalization is not authorized by this milestone. Consider a schema boundary change only if measured workspace payload, autosave p95, WAL amplification, or FTS p95 demonstrates a material bottleneck.

## Architecture boundaries

- SQLite remains the durable single-instance store.
- Existing optimistic workspace versioning remains the write-conflict policy.
- Backup v2 changes portability encoding, not authored domain ownership; JSON v1 import remains supported for compatibility.
- FTS remains a derived projection.
- Study sessions continue to survive workspace deletion intentionally.
- No PostgreSQL migration, service split, CRDT, or Note normalization is included.

## Verification required

Before merge:

1. frontend typecheck, lint, unit tests, and production build pass;
2. Go format/static checks, tests including race gate, and server build pass;
3. migration append-only enforcement passes;
4. backup round-trip/tamper tests, migration integrity tests, and asset hard-delete/no-resurrection tests pass;
5. production composition + restart persistence smoke test passes;
6. persistence scale-evidence test completes and its artifact is produced;
7. exact-head PR `Verify` is green and PR remains mergeable at that verified head.
