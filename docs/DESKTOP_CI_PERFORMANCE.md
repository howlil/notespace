# Notespace Desktop CI performance and first unsigned beta unblock

## Baseline (19 Oct 2026)

Measured from GitHub Actions `Verify Desktop` on master:
https://github.com/howlil/notespace/actions/runs/39230877075

| Job | Total |
| --- | ---: |
| Windows 2022 native/WebView2 | ~21.5 min |
| Linux native | ~13.4 min |
| Windows latest Rust | ~5.4 min |

On the critical Windows 2022 job, `cargo install tauri-cli` took 592 seconds,
`cargo tauri build --no-bundle` 294 seconds, and `cargo test` 172 seconds.
The actual WebDriver smoke took only seconds. The Windows MSI build in
https://github.com/howlil/notespace/actions/runs/39233562030 succeeded,
then release failed at `request_desktop_close not allowed by ACL`.
This was a real release blocker, not a signing failure.

## Changes made

- Use `pnpm dlx @tauri-apps/cli@2.12.3` (a fixed Tauri v2 CLI version) instead
  of compiling the CLI from source via `cargo install`. It intentionally
  does not modify the root pnpm lockfile; the CLI is a build tool obtained
  separately and pinned to an exact version. An offline build still needs an
  available package cache.
- Install pnpm via `pnpm/action-setup@v4` before `actions/setup-node@v4`,
  then enable pnpm dependency-store caching keyed by `pnpm-lock.yaml`.
- Use `Swatinem/rust-cache@v2` on Linux, Windows 2022, Windows latest,
  unsigned beta, and stable native release jobs.
- Share a Windows 2022 cache namespace between desktop verification and the
  MSI release job. A warm cache can reuse compatible Rust dependency builds,
  but does not bypass release compilation or verification.
- Windows 2022 native acceptance builds one **debug** executable for real
  WebDriver smoke. A second optimized executable is unnecessary in the same
  PR job because the real MSI release workflow builds and tests its **release**
  binary separately. Windows latest and Linux compilation remain mandatory.
- Desktop jobs build only `@notespace/web` assets, not the unrelated landing
  project. Ordinary `Verify` still validates the full application build.
- The full browser journey uses `pnpm exec playwright test` after the
  existing `pnpm build` step, avoiding the second `pnpm build` hidden
  in the developer convenience script `test:e2e`.
- Cancel superseded PR runs for `Verify` and `Verify Desktop`. Never
  auto-cancel master verification or an ongoing release job.

## Native loopback IPC fix

The Notespace web renderer loads authenticated local content from a Go sidecar
at `http://127.0.0.1:<OS-allocated-port>`, not from Tauri's bundled
origin. Tauri 2 applies its remote-origin ACL to these commands; merely
registering a command with `generate_handler!` is insufficient.

`build.rs` generates explicit native command permissions through
`AppManifest::commands`. A separate `loopback.json` capability applies
only to `main` on `http://127.0.0.1:*/*`; it allows only named Notespace
commands and the pre-existing HTTPS/mailto/tel opener scope. It does not
grant generic shell or filesystem access or allow non-loopback hosts.
Bundled startup/recovery retains a different local-only capability.
The `desktop_retry_runtime` command is intentionally excluded from remote
access.

**Security caveat:** Tauri's build-time capability can narrow the host to
127.0.0.1 but not the OS-selected port known only at runtime. Do not
navigate the main WebView to unrelated loopback services, and continue
enforcing Notespace's authenticated desktop-session bootstrap on the sidecar.
Future hardening could assert the exact active sidecar port for every
privileged native command. The static ACL regression test checks that
unrestricted public URLs and shell/fs permissions are not granted.

## Safety gates that remain required

- Linux and Windows Rust tests, Windows latest compilation
- Real Windows 2022 WebView2 + EdgeDriver native smoke
- Release MSI binary startup, close/write flush, sidecar shutdown and relaunch
- Durable Note/SQLite preservation and, when applicable, installed MSI upgrade
- No unsigned beta automatic updater or paid signing requirements
- SHA-256 checksum, GitHub provenance attestation, and public release assets

## Measure after rollout

Compare **three warm-cache** runs to the baseline:
- Verify Desktop wall-clock duration and Windows 2022 critical-path steps
- GitHub Actions cache hit/miss logs, Rust cache upload/download time
- Beta MSI build/critical smoke success and public GitHub release asset
- GitHub Actions total billable compute vs number of redundant jobs

First runs can remain slow because caches are cold or invalidated by Rust
toolchain/dependency changes. Do not quote an improvement percentage until
successful post-change runs have been measured.

Upstream references:
- https://tauri.app/reference/cli/
- https://github.com/Swatinem/rust-cache
- https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md
- https://v2.tauri.app/security/capabilities/
- https://docs.rs/tauri-build/latest/tauri_build/struct.AppManifest.html
