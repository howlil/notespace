# Notespace Desktop on Windows: terminal / PowerShell window opens with the app

## Observed defect and root cause

Users reported that launching the installed Windows Notespace beta opens an
additional console/PowerShell-looking window, and closing that window also
closes Notespace. Source audit of the public MSI's commit (19 October 2026)
found `apps/desktop/src-tauri/src/main.rs` contained **no Windows GUI
subsystem directive**. Windows therefore treats the Tauri launcher itself
as a console application. A console close can terminate the launcher and its
sidecar instead of initiating Notespace's save/flush/close handshake.

The Go executable bundled as `notespace-server` was also compiled as a
console binary. It is a background process with no standalone user UI and
should not create a Windows console. Tauri's shell plugin often already uses
`CREATE_NO_WINDOW` when spawning sidecars on Windows, but that cannot
fix the *parent* executable's missing GUI subsystem.

Reference: https://github.com/tauri-apps/tauri/blob/dev/examples/api/src-tauri/src/main.rs

## Correct platform behavior

- **Windows release `notespace-desktop.exe`:** link with
  `#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]`.
  Debug builds remain console-enabled for engineering diagnostics.
- **Windows Go desktop sidecar:** build with `-ldflags -H=windowsgui`, but
  only in `scripts/prepare-desktop-sidecar.mjs`. Do not change the
  ordinary headless/self-hosted CLI build; it still belongs in a terminal.
- **Sidecar protocol:** preserve piped stdin/stdout/stderr. Tauri still
  waits for `NOTESPACE_READY=`, handles the Go
  `NOTESPACE_SNAPSHOT=` backup response, and sends `shutdown\\n`
  before closing. Console removal must not disable these protocols.
- **Linux and other targets:** no additional GUI flag.

## Proof / gates

1. Static regression tests check the Rust cfg and the Go packaging command.
2. A portable Node script reads the built PE OptionalHeader Subsystem field:
   `2` means Windows GUI, `3` means Windows Console. All released Windows
   artifacts (Tauri launcher and Go desktop sidecar) **must be GUI**.
3. `Verify Desktop` on Windows 2022 and latest asserts that the real Go
   sidecar is GUI-subsystem; it additionally performs the existing
   startup/EOF/shutdown smoke with piped readiness and the genuine
   Windows 2022 native WebView2 close/save/reopen/SQLite persistence test.
4. The unsigned MSI and the opt-in signed release workflow both inspect
   the **actual release binaries** after build and before acceptance/publish.
5. The MSI from the older beta is immutable and **will still open a console**.
   Users must install a newly published MSI version for this fix.

## Human desktop acceptance (recommended)

On a Windows PC, launch Notespace from its Start menu shortcut, not from a
terminal. No PowerShell/cmd/console window should appear. Create a note,
create a manual SQLite backup from Settings, close Notespace using its X
button, reopen it, and verify persisted content and backup list. Repeat with
an existing installation to ensure the MSI upgrade retained user data.
Do not treat CI success as proof this human acceptance was performed.
