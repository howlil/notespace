# Development

## Prerequisites and setup

Requires Node.js 24, bun 1.3.14, Go 1.25+ and Task 3.x. Windows PowerShell is supported.

```sh
npm install --global bun@1.3.14
go install github.com/go-task/task/v3/cmd/task@latest
bun install --frozen-lockfile
task dev
```

Open `http://localhost:3000`. Task orchestrates the Go API and Vite development server; bun owns frontend package commands and the lockfile, Go owns backend build/test commands, and Docker Compose owns the self-hosted runtime.

Useful commands:

```sh
task --list
task check
task build
task verify
task up
task down
```

See [self-hosting](SELF_HOSTING.md#data-locations) for runtime data paths. Do not develop against your production database.

## Windows native development

The desktop shell requires the additional Rust/Tauri development prerequisites for Windows, including WebView2 and the MSVC toolchain. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). With the desktop CLI installed, the repository provides:

```sh
task desktop:dev
task desktop:check
task desktop:build
```

A native build does not publish an installer. Read [desktop distribution](DESKTOP_FIRST_RELEASE.md) before working on release behavior.

## Verification

`task check` runs local static and unit/integration checks; `task verify` adds production builds and the PR browser smoke set (the same set the `ci` gate runs).

The browser suite is WebdriverIO standalone plus `node:test`; there is no Playwright dependency. The single `ci` workflow selects lanes from the changed paths. Pull requests run web checks, Go tests, the browser journeys affected by the change plus the P0 smoke set, the landing lane when landing changes, and the native Windows lane when native paths change. Recognized docs-only changes select no app lanes; unfamiliar paths may conservatively select all lanes. App changes pushed to `master` run every lane, including the critical browser set, Docker persistence restart smoke, and the Windows Server 2022 native WebView2 journey, which covers UI routing and close/relaunch durability. See `TESTING.md` for the lane rules. Target-device visual acceptance is separate and is not inferred from CI.

For ownership and focused commands, read [testing and CI](TESTING.md).

## Implementation boundaries

- TanStack Start SPA, React, TypeScript, Vite, Tailwind utilities/tokens, Radix primitives.
- Excalidraw is an adapter behind Notespace-owned Canvas snapshots; legacy DTO fields stay at the compatibility boundary.
- Same-browser Canvas tab synchronization uses `BroadcastChannel`; durable persistence remains server-owned.
- Go `net/http`, `database/sql`, pure-Go `modernc.org/sqlite`, explicit SQL and embedded transactional migrations.
- SQLite uses WAL + FULL synchronous with one pooled connection.
- Search, activity telemetry, durable assets, Trash, authored state, and legacy history compatibility data remain in the same self-hosted SQLite ownership boundary.
- No hosted service is required for core editing.

For a current implementation map, read [`ARCHITECTURE.md`](ARCHITECTURE.md). For testing and CI ownership, read [`TESTING.md`](TESTING.md). Repository-local implementation rules start at [`AGENTS.md`](../AGENTS.md).

## Maintainer publication

Windows desktop downloads are distributed through [GitHub Releases](https://github.com/howlil/notespace/releases). A green PR or CI debug executable is **not** a published installer.

Maintainers use [Release](https://github.com/howlil/notespace/actions/workflows/release.yml) on `master`: the default **preflight** is read-only; explicitly selecting **desktop-beta** or **desktop-stable** requests the corresponding publication after exact-master CI and native persistence verification. Existing per-lane workflows remain manual fallbacks until publication acceptance. Beta publication is manual only; ordinary pushes, tags, and `[desktop-beta]` commit markers never dispatch releases. The former auto-beta entry is now a read-only manual release preflight. Unsigned MSI assets may display **Unknown Publisher**; check the release-specific signing status.

Starting with `v0.1.0-beta.3`, the beta channel supports **Tauri-signature-verified in-app updates**. This requires the existing Tauri updater signing configuration; it does not require paid Windows publisher signing. Earlier betas require a one-time manual upgrade. Stable publisher-signed releases have a separate workflow and credential requirements.

See [desktop distribution and signing](DESKTOP_FIRST_RELEASE.md) for the exact publication and upgrade contract. Never assume a local debug build proves installed MSI behavior.
See [Contributing](../CONTRIBUTING.md) for the review workflow.
