# Notespace Windows native WebView2 acceptance — implementation graph

## Evidence / scope

PR #116 inherited a passing Go/frontend and Linux desktop check, but a Windows
WebDriver failure at Selenium session creation:

```text
SessionNotCreatedError: session not created:
DevToolsActivePort file doesn't exist
```

**Source:** GitHub runner-images issue
https://github.com/actions/runner-images/issues/14738 (September–October 2026).
The maintainers identify a WebView2+EdgeDriver regression reproducible on
Windows Server 2025; identical test suites can pass on Windows Server 2022.
The underlying upstream issue is
https://github.com/MicrosoftEdge/WebView2Feedback/issues/5415.

This is **not proof that the Notespace application is correct**; only the
WebDriver launch failed before any Notespace UI assertions could execute.

Microsoft requires EdgeDriver to match the **WebView2 Runtime**, not merely
the full Edge browser:
https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver

## Design-thinking implementation graph

### §1 Shapes

```text
NativePlatform {windowsRunner, webView2Version, edgeDriverVersion}
TauriSession {nativeExecutable, isolatedWebViewProfile, privateSQLiteDir}
DriverInstallFailure = MissingRuntime | DownloadFailure | InvalidSignature | VersionMismatch
NativeAcceptance = SessionCreated → AuthBootstrap → TauriIPC → NoteSave
                 → WindowClose → SidecarExit → Relaunch → DurableState
ReleaseAcceptance = NativeAcceptance + MSI Upgrade(N,N+1) + Signing
```

### §2 Successful path (A)

```text
PR / release candidate
   ├─ Windows-latest: Go/Node build + cargo test + desktop binary compile
   │     [does not claim WebView2 automation]
   └─ Windows-2022: Go/Node build + cargo test + desktop binary compile
        ↓
      WebView2 registry version discovery
        ↓
      download matching driver from msedgedriver.microsoft.com
        ↓
      Authenticode verification + browser/driver version check
        ↓
      tauri-driver process starts
        ↓
      Selenium creates a real Tauri/WebView2 session
        ↓
      Notespace authenticated loopback bootstrap
        ↓
      Tauri IPC available, real SPA loaded
        ↓
      write/close/relaunch/read Note and WebView profile
        ↓
      test passes; only then native acceptance succeeds
```

Release adds: signed MSI, real installed old version -> new version, SQLite
identity + content digest verification. Neither PR nor release workflow
bypasses the native test. No automatic `continue-on-error`.

### §3 Ordering and concurrency

- The driver installation MUST precede tauri-driver/Selenium session startup.
- The native acceptance MUST use the actual Tauri executable, not a browser
  pointed at a mock HTTP site.
- Windows 2022 native E2E and Windows latest compilation are independent jobs.
- Both jobs block PR merge, subject to GitHub branch protection configuration.
- Release candidate native acceptance occurs BEFORE publishing MSI.

### §4 E / expected failure ownership

| Failure | Action | Owner |
|---|---|---|
| WebView2 missing | Stop and explain | CI environment setup |
| EdgeDriver version mismatch | Stop rather than test wrong runtime | Driver installer |
| Invalid driver Authenticode signature | Stop, never execute | Driver installer |
| DevToolsActivePort | Report upstream diagnosis, **fail CI** | WebDriver native test |
| Tauri IPC unavailable | Fail native product acceptance | Native test |
| Note save/close/relaunch fails | Fail native product acceptance | Notespace |
| MSI changes previously authored content | Block stable release | Release test |

### §5 Capabilities

- Runner may fetch Microsoft-signed EdgeDriver from official HTTPS endpoint.
- Installer accesses WebView2 runtime version in Windows registry.
- Developer/CI does not receive or store user library data.
- The temporary WebView2 user profile is isolated, write-tested and disposable.

### §6–§8 Trust boundary / policy / lifetime

- Never disable signature verification, product assertions or release gates to
  get a green check.
- Do not silently replace native automation with a browser-only smoke.
- The installer downloads only a version string validated from Windows
  registry and verifies publisher signature.
- Diagnostic preflight writes only OS, runtime and driver version metadata; no
  auth tokens, SQLite content, or WebView cookies.
- Windows-2022 is a **temporary compatibility baseline**, not a promise of a
  permanently pinned Evergreen runtime. Microsoft may update that runtime,
  so it must be monitored and re-evaluated when upstream fixes land.
- Installation happens in temporary CI space; no user data migration happens
  in PR CI.

### §9 Verification / exit criteria

1. `Verify` Go/frontend: green.
2. `Verify Desktop` Linux: green.
3. `Verify Desktop` latest Windows unit/build: green.
4. `Verify Desktop` Windows-2022 native WebDriver session + Note persistence:
   green. No ignored, timed-out or skipped product checks.
5. Release: MSI N→N+1 tested, verified data content, signed publisher and
   updater artifacts, provenance, manual acceptance.

## Developer commands

On Windows with Rust, Go, Node/pnpm and a compatible WebView2 runtime:

```powershell
pnpm install --frozen-lockfile
pnpm build
node scripts/prepare-desktop-sidecar.mjs
cd apps/desktop/src-tauri
cargo test --locked
cargo tauri build --debug --no-bundle -- --locked
cd ../../..
cargo install tauri-driver --locked
./scripts/install-webview2-edgedriver.ps1
./scripts/diagnose-desktop-webdriver.ps1
pnpm test:desktop:native
```

If the launcher fails only on a newer Evergreen runtime, retain independent
compile tests for the latest OS/runtime and verify actual GUI behavior on
supported Windows physical devices or controlled VMs. Do not claim that
the WebView2 regression is fixed inside Notespace.
