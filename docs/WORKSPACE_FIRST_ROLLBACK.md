# Workspace-first M7 — acceptance and rollback runbook

Status: acceptance contract for PR #141. This is **not** evidence that a production migration, a native desktop upgrade, or rollback has been executed.

## Scope and invariants

Target: M0–M6 Workspace-first behavior, including SQLite migration 0020 and the new Capture persistence contract. Do not remove or silently reassign historical standalone Tasks or unowned Activity records.

- An unorganized Capture stays pending until explicitly converted to a Workspace-owned Note or Task.
- A converted Capture receipt keeps its target identity so a repeated organize command is idempotent.
- Today is a projection of the authoritative planning Task store, not a second store.
- New Activity starts require a Workspace in the browser runtime. Historic Workspace-less Activity/recovery records must continue to work.
- The Note/Canvas document, Workspace Plan, Capture Queue, Trash, Activity history, asset blobs and history checkpoints must survive restore and restart as supported by their owning stores.
- The current browser session's unsent Activity outbox and uncommitted editor drafts are **not** guaranteed by a server-side SQLite/ZIP backup. Resolve pending sync before planned downgrade.

## Acceptance graph

```text
Preflight
  → inspect schema + read-only baseline of existing database
  → isolated SQLite migration and legacy backup tests
  → frontend, Go, browser and native desktop checks
  → launch disposable Compose instance with persistent volume
  → write Note/Canvas + Workspace Task + pending Capture + Activity heartbeat
  → restart actual server/container
  → verify authoritative Workspace/Plan/Today/Queue/Activity identities
  → clean up only disposable records
  → capture latest-head evidence
  → go/no-go; no automatic destructive restore
```

### Required proof and owners

| Risk | Proof owner | Gate |
| --- | --- | --- |
| Existing database migration and read-only ownership inventory | `apps/server/migrations` tests; `scripts/test_workspace_first_baseline.py` | Existing Task/Activity classes preserved |
| Capture transaction and duplicate organize | `apps/server/internal/httpapi/capture_http_test.go`; SQLite capture concurrency tests | Exactly one Note/Task per receipt |
| ZIP schema v15, pending Capture, converted receipts | `TestCaptureToNoteAndBackupRestore`; SQLite archive/backup tests | Both pending and receipts restored without duplication |
| Legacy JSON v1 and older ZIP imports | `TestOldJSONBackupWithNoCapturesCanStillRestore`; SQLite restore/compatibility tests | Old data readable; captures absent from old format |
| Invalid backup cannot replace data | `TestCaptureBackupRejectsInvalidReceiptWithoutReplacingLibrary`; SQLite restore rollback tests | Restore fails atomically |
| Workspace Trash/history/asset preservation | SQLite Trash/archive tests; existing browser tests | Original Workspace identity and content recover |
| Task/Today source-of-truth and version races | `tests/today-projection.spec.ts`, `tests/today.spec.ts`, SQLite planning tests | No duplicate or lost scheduled Task |
| Activity end/restart and response-loss recovery | `tests/activity.spec.ts`, Activity/SQLite tests | No false completion or lost finalized session |
| Search and keyboard/mobile navigation | `tests/search.spec.ts`, `tests/workspace-first-nav.spec.ts`, `tests/capture.spec.ts` | Search and actions remain accessible |
| Real server/SQLite durability | `scripts/smoke-persistence.py --compose-restart` in `Verify` | Workspace/Note/Canvas/Task/Today/Capture/Activity survive restart |
| Native desktop startup, restart and recovery | `Verify Desktop`, native Windows WebDriver workflow | Linux, Windows and Windows-native gates green |

For the current commit, use the **latest-head** GitHub Actions runs. A green run from an earlier commit or a cancelled run is not an acceptance pass. M7 is complete only after all required gates succeed and the diff has been reviewed. No test in this matrix proves real-user backup safety in place of rehearsing restoration on a copy.

## Pre-upgrade backup — self-hosted Docker Compose

**Stop writes first.** Do not copy only `notespace.db` from a running SQLite WAL database. Capture the entire data directory/volume while the Notespace process is stopped.

On a POSIX shell (use WSL/Git Bash for equivalent Windows execution):

```sh
# Run from the deployed Compose directory.
mkdir -p rollback
export NOTESPACE_DATA_VOLUME="${NOTESPACE_DATA_VOLUME:-notespace-data}"
docker compose stop notespace
docker volume inspect "$NOTESPACE_DATA_VOLUME" >/dev/null
docker run --rm \
  -v "$NOTESPACE_DATA_VOLUME:/data:ro" \
  -v "$PWD/rollback:/backup" \
  alpine:3.20 sh -c 'cd /data && tar -czf /backup/notespace-pre-workspace-first.tgz .'
tar -tzf rollback/notespace-pre-workspace-first.tgz >/dev/null
```

Keep the snapshot private (it contains user content); also retain the exact known-good pre-upgrade deployment tag/image. Never check the SQLite database or archive into Git.

The application `GET /api/backup` exports a ZIP logical backup, with archive schema 15 and a 64 MiB HTTP round-trip limit. That is useful for migration into a compatible **new** build, but is **not** a downgrade file: an older build may reject the newer archive and cannot be assumed to understand its Capture data.

## Upgrade verification

After a verified pre-upgrade snapshot, start the candidate deployment and run the acceptance checks against an **isolated cloned volume** before production. Do not invoke the destructive `POST /api/backup/restore` against live user data as a smoke test. Use an isolated SQLite test database for JSON/ZIP restore fault injection.

If the candidate cannot read the migrated database, preserve its files and logs without retrying destructive restoration. Do not run an older binary on an already-migrated data volume.

## Rollback — restore the pre-upgrade snapshot into a *new* volume

Rollback has a known data-loss window: all edits, Captures, converted receipts, Tasks and Activity updates created **after** the snapshot are absent from the old state. Do not attempt rollback until that loss is acknowledged and post-upgrade drafts/pending Activity finalizations are reviewed. Prefer forward-fixing if that data must be preserved.

```sh
# Stop the candidate; "down" does not delete named volumes without -v.
docker compose down
docker volume create notespace-workspace-first-rollback
docker run --rm \
  -v "notespace-workspace-first-rollback:/data" \
  -v "$PWD/rollback:/backup:ro" \
  alpine:3.20 sh -c 'cd /data && tar -xzf /backup/notespace-pre-workspace-first.tgz'
# From the checked-out, known-good PRE-upgrade version/configuration:
export NOTESPACE_DATA_VOLUME=notespace-workspace-first-rollback
docker compose up -d --build
docker compose ps
```

Confirm the old build uses the restored, pre-upgrade volume and passes health plus representative Workspace, historical Task and Activity reads. Leave the upgraded volume untouched for forensic recovery; do not use `docker compose down -v`, erase WAL files individually, or import a schema-15 archive into the old build.

## Native desktop rollback

Desktop owns a local SQLite database under the platform's Tauri `app_data_dir`; the installed binary launches the local sidecar. Exit the desktop application and ensure its sidecar has stopped before backing up the whole application data directory (database and auxiliary files). Record the prior installer and its version. Restore a matching **pre-upgrade** directory copy alongside the known-good installer; do not run an old binary against a newly migrated desktop database. Use the platform-specific recovery steps in `docs/DESKTOP_RECOVERY_BACKUP.md` and `docs/DESKTOP_DATA_SAFETY.md`. Browser-only pending Activity sync or editor drafts are outside a raw SQLite snapshot.

## Explicit stop / no-go

Stop rollout or merge if any latest-head required check fails; if pending Captures or converted receipts disappear on ZIP round-trip; if a legacy Task/Activity is silently reassigned; if the real restart changes Task/Today/Activity identity; if an archive restores partially after validation fails; if desktop recovery loses user content; or if an operator cannot demonstrate a recoverable pre-upgrade snapshot. Record evidence and corrective follow-up in PR #141.
