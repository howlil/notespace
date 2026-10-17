# Notespace desktop — signed updates (M3)

## Authority and safety

The Go SQLite application-data directory remains the only durable library.
Updating application binaries must never replace, delete, or roll back that
directory. Database compatibility and pre-migration snapshots belong to M1;
real Windows installed MSI N → N+1 data preservation belongs to M2.

M3 adds an **opt-in Windows updater**, not background forced installation.

## Runtime graph

```text
User checks for updates
  -> Native Tauri updater checks HTTPS GitHub Releases latest.json
  -> Updater downloads MSI and verifies signature against embedded public key
       network error / invalid signature -> error; no install capability stored
       no update -> display current
       verified -> memory-backed pending package (version + signed bytes)
  -> User accepts "Save and install"
  -> block editor interactions
  -> flush existing granular Note/Canvas editor writes
       failure -> keep app open and refuse installation
       success -> native install command
  -> gracefully shut down Go sidecar (SQLite)
  -> updater verifies bytes again, launches Windows installer
       success -> updater handles app process termination/relaunch
       failure -> attempt to restart existing Go runtime, show error
  -> app restarts
  -> M1 validates/migrates the same SQLite library
```

The native update command only accepts a prepared update object already fetched
from the pinned feed and verified by the updater. The browser cannot pass its
own installer URL, signature, or file path. No unauthenticated or unsigned
package may be installed through this flow.

The updater is registered only when **Windows** is built with
`NOTESPACE_UPDATER_ENABLED=1` and the configured release overlay. Ordinary
web usage, development, and unsigned desktop test builds have the updater
disabled.

### Implementation boundaries

- `apps/desktop/src-tauri/src/desktop_updates.rs`: official updater I/O,
  verification, prepared bytes, native installation/sidecar handoff.
- `apps/web/src/features/desktop-updates/`: small native-only UI;
  no new storage; uses established desktop flush callback.
- `scripts/create-desktop-update-manifest.mjs`: strict stable release manifest
  generation from the MSI and its actual `.msi.sig` file.
- `scripts/prepare-desktop-updater-config.mjs`: release-only configuration from
  external GitHub Actions credentials; fails closed when missing.
- `.github/workflows/release-desktop.yml`: builds and publishes the manifest
  only after the release native checks and MSI upgrade test.

## One-time signing credential setup — required before release

Tauri's updater requires an offline signing keypair; this is **not** a Windows
Authenticode certificate. Never add the signing private key to git, a PR,
workflow log, or committed config.

1. On a trusted workstation, install Tauri CLI and run
   `cargo tauri signer generate -w ~/.tauri/notespace.key`
   (or use the equivalent official npm/pnpm signer command).
2. Store `~/.tauri/notespace.key` in a secure encrypted vault with an
   independently held backup. Keep its password separately.
3. In repository **Settings → Secrets and variables → Actions**:
   - Secret `TAURI_SIGNING_PRIVATE_KEY`: exact private-key contents.
   - Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: associated passphrase.
   - Variable `NOTESPACE_UPDATER_PUBLIC_KEY`: single-line public key generated
     by Tauri signer (inline content, not a filesystem path).
4. Verify the public/private pair with the official Tauri signing tool and a
   disposable MSI before distributing Notespace to users. Keep the private key
   stable for future releases; changing it would invalidate update trust for
   existing installations.

`NOTESPACE_UPDATER_PUBLIC_KEY` is public information; only the private key is
secret. CI never generates a fresh production signing key or bypasses missing
credentials.

## Release contract

A stable release (vX.Y.Z) must:

- pass M1 migration safety and M2 actual installed Windows MSI upgrade checks;
- verify signing credential presence before invoking `cargo tauri build`;
- create signed Windows MSI and its detached `.msi.sig`;
- generate `latest.json` containing `version`,
  `platforms["windows-x86_64"].url`, and
  `platforms["windows-x86_64"].signature`;
- upload MSI, signature, manifest and SHA256 sums to the **same** GitHub Release;
- update via the pinned HTTPS endpoint
  `https://github.com/howlil/notespace/releases/latest/download/latest.json`.

The built-in Tauri updater rejects a package whose signature does not match
the embedded public key. Checksums alone are not a substitute for signatures.

Initial stable releases without an earlier MSI lack N→N+1 compatibility
evidence and are explicitly marked as such by M2; they still require manual
installation/reopen acceptance.

## Failure behavior

| Failure | Result |
|---|---|
| No network | Check fails; current Notespace and library remain open |
| Invalid/missing signature | Download refuses; install action is unavailable |
| Save conflict, disk full, autosave rejection | Installation never called |
| Installer failure after sidecar stop | Runtime restart attempted; error shown |
| Migration failure after install | M1 recovery snapshot preserved; app stops |
| Newer schema under old binary | M1 refuses writable database startup |

Installation cannot guarantee OS power-loss atomicity or that the Windows
runner will always allow the current fixed localhost port. Those are
independent production acceptance gates.

## Verification

```sh
node --test scripts/create-desktop-update-manifest.test.mjs
node --check scripts/prepare-desktop-updater-config.mjs
pnpm test
cd apps/desktop/src-tauri && cargo test --locked
```

Execute actual signed MSI N→N+1 native acceptance in a Windows environment
that allows `127.0.0.1:49832`. Do **not** merge/ship M3 solely on static checks.
