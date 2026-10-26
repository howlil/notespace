# Notespace Desktop — next beta release

Release intent: ship the next **Windows desktop beta** from verified `master`, including changes merged after `v0.1.0-beta.7`. The publish workflow selects the next available `v0.1.0-beta.N` tag; do **not** reserve, rewrite, or manually create a tag.

## Changes since v0.1.0-beta.7

- **Activity reliability (M1–M3, PRs #166–#169).** Preserve the highest active duration when delayed heartbeats arrive; keep completed-session recency stable under replay; order metadata updates by durable per-day-segment revisions even at equal duration.
- **Activity recovery.** Preserve the last assigned revision through reload, midnight rollover, Pause, and End. Keep finalization retries immutable and prevent an older acknowledgment from removing a newer context revision or prematurely showing a Task handoff.
- **Workspace, Planning, and Capture core.** Strengthen validation, concurrency and ownership boundaries; improve pagination, retry/idempotent task creation, and recovery integration.
- **Storage compatibility.** Apply additive SQLite migrations while retaining historical Activity sessions, deletion tombstones, workspace/task attribution, and full-library backup/restore.
- **Verification.** Expanded real-SQLite, HTTP, browser, persistence, and native desktop regression coverage.

## Distribution policy

- This is a **prerelease**, not a stable release.
- Windows MSI publisher signature remains **unsigned** (no paid Authenticode certificate); SmartScreen may warn.
- The updater artifact is signed with the configured **Tauri** key. Do not publish if updater signing or native WebView2 acceptance fails.
- Required GitHub release assets: the MSI, detached `.msi.sig`, `notespace-beta-latest.json`, and `SHA256SUMS.txt`.
- In-app updates for supported installed beta versions use the dedicated beta feed only after a verified GitHub release is published.

## Release gate

The existing `.github/workflows/auto-desktop-beta.yml` dispatches `publish-desktop-beta.yml` only after both current `master` `Verify` and `Verify Desktop` runs succeed, with an explicit `[desktop-beta]` marker in the **master merge commit subject**. The publish workflow independently rechecks current HEAD, versions, signing, native acceptance, and artifact provenance before creating an immutable GitHub prerelease.

This document is release intent, **not evidence that a binary was published**. Verify the actual GitHub Release page, four assets, and workflow completion before announcing availability.
