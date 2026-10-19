# Unsigned desktop MSI beta: native close/relaunch release RCA (2026-10-19)

## Observed release failures

| Run | Where it stopped | Proven failure |
| --- | --- | --- |
| [39170254838](https://github.com/howlil/notespace/actions/runs/39170254838) | Native close | Synthetic Alt+F4 did not deliver reliable Tauri close event |
| [39233562030](https://github.com/howlil/notespace/actions/runs/39233562030) | Native close | `request_desktop_close` rejected by Tauri remote-origin ACL |
| [39242422617](https://github.com/howlil/notespace/actions/runs/39242422617) | Native close | EdgeDriver disconnected from DevTools after Tauri window exit; sidecar shutdown also timed out |

In all three, the MSI build itself was not the blocker. **No GitHub
Release can be claimed until the native product gate, provenance, and public
asset publishing actually succeed.** Do not disable the gate.

## Root causes and changes

### 1. Sidecar exit was never acknowledged for invalidated generations

The process supervisor increments `RuntimeProcess.generation` before it
sends `shutdown\\n` to Go. The receiver in `start_runtime` previously
returned on **any** event of that invalidated generation, discarding the
child's `CommandEvent::Terminated` and failing to wake the condvar that
`stop_runtime_expected` was waiting on. The 12-second timer could expire
even when Go was terminating normally.

The receiver now drains events of that invalidated child until
`Terminated`, marks its own `sidecar_exited` signal, and never updates
newer-generation state. When the channel ends without an explicit terminal
event, it also signals the waiter. The Rust close handler runs the blocking
shutdown wait outside Tauri's WebView event loop, then exits the app.

### 2. Native WebView2 disconnect is not an unconditional test failure

When the **last** native Tauri window closes, EdgeDriver may disconnect
from DevTools rather than return an empty handle array (observed on
Windows Server 2022, WebView2 131.0.2903.86).

The native close test only recognizes specific last-window errors
(`no such window`, `invalid session id`, or the precise
`disconnected ... failed to check if window was closed` signature).
On this expected transport outcome, it must still verify the local server
port has actually stopped, relaunch the **real** Tauri binary, and verify
the newly authored Note survived in SQLite. Other driver, ACL, timeout, and
durability failures remain fatal.

### 3. Catch release blockers in PR CI

Windows 2022 PR CI now runs both normal WebDriver parity and isolated
**critical** close/flush/shutdown/relaunch persistence against a real
debug Tauri binary. The release job repeats the critical test with the
actual optimized MSI release binary. The two are complementary, not
substitutes.

When critical release acceptance fails, GitHub Actions retains the
**UNVERIFIED** MSI as a three-day diagnostic artifact. It cannot be mistaken
for a published prerelease: signing/provenance/tag/release steps are gated
behind acceptance. No Azure, paid signing, or updater is introduced.

## Required evidence before declaring release complete

1. `Verify` and `Verify Desktop` pass on the exact `master` commit.
2. The free MSI workflow uses that same commit and passes real native
   close/reopen and SQLite persistence; sidecar ideally reports
   `exited gracefully` rather than forced kill.
3. GitHub attestation verification, unsigned signature policy, SHA256 sums,
   release tag and public upload succeed.
4. GitHub Releases contains a direct downloadable `.msi` asset.
5. An actual install on a normal user's Windows machine remains recommended
   as a separate human acceptance check; CI proof does not replace it.

References:
- https://www.selenium.dev/documentation/webdriver/browser/windows/
- https://github.com/SeleniumHQ/selenium/issues/13851
- https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/
