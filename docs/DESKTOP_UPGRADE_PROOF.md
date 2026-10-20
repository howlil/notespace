# Desktop upgrade verification — M2

M2 provides an executable release gate for **actual Windows MSI upgrades**, not
a Go test that merely reopens SQLite from the same binary.

## Proof contract

```text
Published stable Notespace N (.msi)
  -> msiexec /i N /qn
  -> find the installed Notespace executable
  -> native WebDriver creates Workspace/Note with in-flight-save close
  -> seed milestone, workspace task, inbox task, asset, activity, Trash via N's API
  -> close window AND wait for Go sidecar to relinquish loopback port
  -> record read-only SQLite inventory outside application data directory
  -> msiexec /i N+1 /qn against the same installed app
  -> assert registered MSI version changed and binary installation path is unchanged
  -> native WebDriver reopens N+1 with exactly the same library and WebView profile
  -> verify authored Note, Task, asset, Trash, activity through N+1's API
  -> validate SQLite quick_check/foreign_key_check and compare durable identities
  -> if schema advanced, assert a matching pre-upgrade M1 recovery snapshot exists
  -> only THEN allow release artifact publication
```

The inventory includes Categories, Workspaces, Notes, Canvas, milestones,
planning tasks, activity sessions, durable assets, Trash, and history when the
previous release contains those tables. Asset bytes are SHA-256 checked.
Derived FTS and operational schema metadata are intentionally not compared
as user-owned data. Application-level API assertions independently verify
authored content.

## Existing CI and scope

- `scripts/desktop-webdriver-smoke.mjs --upgrade-seed` creates the fixture in the
  actual *installed previous-version* process. `--upgrade-verify` exercises the
  installed candidate. Both require a deliberately isolated
  `NOTESPACE_DESKTOP_TEST_DATA_DIR`; neither points at developer data.
- `scripts/desktop-upgrade-inventory.py` captures and verifies original SQLite
  identities and assets using Python's built-in SQLite interface.
- `scripts/verify-desktop-msi-upgrade.ps1` installs both packages using
  Windows Installer, checks registered versions, preserves the same profile,
  and fails on exit code, missing fixture, wrong version or data mismatch.
- `.github/workflows/release-desktop.yml` chooses the latest earlier
  *published stable* version with an MSI and gates the new stable release on
  that prior release's actual installer. If **no earlier stable release exists**
  it reports the missing baseline explicitly; this is an initial-release
  exception, **not** a passed upgrade test.
- `.github/workflows/verify-desktop.yml` runs the inventory contract unit
  tests, Node syntax check, native binary smoke, and Windows PowerShell parser.

Source code and package metadata remain immutable for the published prior MSI.
Never replace the old package with a locally rebuilt binary when presenting
the test as a previous-release compatibility proof.

## Failure boundaries

- MSI failure, reboot-needed exit code, ambiguity about installed binary,
  multiple registrations, or unexpected installed path → fail.
- Previous binary cannot create durable data → fail.
- Outstanding sidecar still serving requests after window closes → fail.
- New binary cannot open old data → fail.
- Authoritative IDs disappear, binary assets change, or integrity fails → fail.
- Migration occurred without matching verified recovery snapshot → fail.
- Missing earlier released MSI when a prior stable release exists → fail.

Do not bypass the update gate to publish a version. Do not roll back a
successfully migrated library by starting an older application. M1's schema
compatibility fence protects this boundary.

## Runner requirements / known limitation

The desktop first-run listener prefers `127.0.0.1:49832`, then tries
`41371`, `41372`, and an OS-assigned loopback port if necessary. It
persistently pins the successful port to keep WebView localStorage/IndexedDB
visible across restarts. Later starts refuse to change this origin when the
pinned port is unavailable and expose a recoverable startup error.

Windows MSI acceptance must test close/reopen with the same pinned origin and
must separately exercise startup recovery when that port is temporarily
occupied. A reserved first-choice port on a fresh installation is not by
itself a SQLite migration failure.
Do not skip the native test, silently use only a debug executable, or mark
the MSI upgrade as verified in the presence of port binding failure.

This M2 proof also does not simulate a machine power cut or prove Windows
filesystem crash durability; those belong to subsequent fault-injection and
recovery acceptance. It does not claim a native macOS/Linux installer upgrade,
because Notespace currently only ships a Windows MSI.

## Local checks

```sh
python scripts/test-desktop-upgrade-inventory.py
node --check scripts/desktop-webdriver-smoke.mjs
```

To run the full native MSI proof on an appropriately configured Windows
runner, supply `NOTESPACE_UPGRADE_OLD_MSI`, `NOTESPACE_UPGRADE_NEW_MSI`,
`NOTESPACE_UPGRADE_OLD_VERSION`, and `NOTESPACE_UPGRADE_NEW_VERSION`, then
execute `pwsh ./scripts/verify-desktop-msi-upgrade.ps1` after installing
`tauri-driver` and the matching Edge WebDriver.
