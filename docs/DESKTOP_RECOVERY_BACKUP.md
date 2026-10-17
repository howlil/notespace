# Notespace desktop M4 — Backup and recovery runbook

## Objective

Enable the user to recover from normal sidecar startup/runtime failure, create
independently verified SQLite backups, and inspect M1 pre-upgrade snapshots.
M4 deliberately **does not offer one-click database replacement**: swapping an
active WAL database while the sidecar runs can destroy committed changes.

The canonical SQLite data directory is never replaced by this feature.

## Recovery graph

```text
Go sidecar exits or fails startup
    -> native Tauri recovery view (not served by failed Go process)
    -> Retry startup (only while no child exists and no retry underway)
         -> Go startup -> existing M1 schema compatibility and integrity gates
         -> success: native WebView navigates back to normal Notespace
         -> failure: preserve data, show error again
    -> Show recovery points (read-only; .db.recovery)
    -> Show diagnostics (no note contents, secrets, or full path disclosure)
```

Recovery view says committed Note data survives; unsaved in-memory changes may
not survive a crashed process. Retry never restores or deletes a snapshot and
never starts a second database writer.

## Manual backup graph

```text
Desktop native Backups -> Create backup
  -> flush pending Note / Canvas saves through existing callback
      error -> cancel; original SQLite untouched
  -> Tauri asks separate notespace-server backup worker
      (NOTESPACE_SNAPSHOT_ONLY=1, NOTESPACE_DB points to app-owned library)
  -> worker opens SQLite in read-only mode, without running migrations
  -> PRAGMA foreign_key_check + quick_check + integrity_check
  -> VACUUM INTO unique hidden .partial backup inside .backups
  -> verify resulting independent SQLite database
  -> chmod user-only, fsync file, rename to completed .db
  -> native validates returned path is within the managed .backups directory
  -> list backup (never prune automatically)
```

These snapshots include committed WAL transactions. They can exceed the
existing 64 MiB portable ZIP limit because the process streams data at the
SQLite engine rather than allocating an entire ZIP in memory. They are **local
SQLite recovery copies**, not portable cross-version Notespace ZIP exports.
The preexisting portable ZIP export remains available for ordinary migration,
subject to its current limit.

Snapshots:
- `<app-data>/notespace.db.recovery/pre-migration-*.db`: M1 upgrade recovery
- `<app-data>/notespace.db.backups/manual-*.db`: M4 user-created backups

## Offline restoration (manual and non-destructive)

1. Close Notespace, check the `notespace-server` process has exited.
2. Copy the **entire** application data directory (including .db, .db-wal,
   .db-shm, .recovery, .backups) to a separate folder/disk. Do not delete it.
3. Pick a recovery point from the in-app list, verify its expected date/size,
   and preferably re-check it with `PRAGMA integrity_check`.
4. Move the existing `notespace.db`, `notespace.db-wal`, and
   `notespace.db-shm` together into a dated incident folder. Do not attach
   a WAL from one database version to another snapshot.
5. **Copy**, do not move, the selected backup `.db` to canonical
   `notespace.db`; preserve the original recovery point.
6. Open a Notespace build compatible with the selected schema. M1 may migrate
   it again and create another pre-migration recovery snapshot.
7. Verify Notes, Canvas, tasks, assets, Trash, and Activity History.

Restore may revert edits made after the chosen recovery point; it must be an
explicit offline operation. A local snapshot cannot survive physical device
loss if stored only beside the main database. Copy backups off the device.

## Diagnostics privacy

`desktop_recovery_diagnostics` exposes app version, platform, runtime state,
and count of M1 recovery snapshots, without Note contents, database query
results, private keys, full filesystem paths or network request bodies.
The list view intentionally contains local backup file paths to support manual
recovery; those paths are not included in copyable diagnostics.

## Test boundaries

- A failed save prevents the native backup worker from running.
- A malformed/corrupt database cannot produce a verified published snapshot.
- A live WAL writer remains usable while the read-only backup worker captures
  committed Notespace data.
- Consecutive manual backups never overwrite one another.
- A recovery list excludes partial files, empty files and symlinks.
- Native retry refuses to run concurrently with a live or starting sidecar.

M5 still requires installer signing, production logging/retention, Windows
file-permission review, portable backup scalability, crash-injection and actual
on-device recovery acceptance. The existing M2 fixed loopback Windows runner
blocker still applies; do not mark real installed-MSI acceptance as passed.

## Local verification

```bash
cd apps/server
go test ./internal/sqlite ./cmd/notespace
go test -race ./...
cd ../..
pnpm test
cd apps/desktop/src-tauri
cargo test --locked
```
