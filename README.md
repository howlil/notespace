# Notespace

A free, self-hosted Canvas workspace for diagrams, sketches, images, and code.

The current navigation model is:

```text
Notespace
├── Welcome / Workspace library
│   └── Optional Explorer (Categories → Workspaces)
└── Workspace Canvas
    ├── Shapes, diagrams, connections, images and code blocks
    └── Quick Open, Settings, backup and recovery
```

Welcome and Canvas share one shell at `/` and `/workspaces/:id`. The logo toggles the Explorer; the titlebar shows the current Workspace and Search. Browser and Windows desktop share the same product behavior.

## Core capability

- Category-organized Workspace library with server-backed pagination.
- Excalidraw Canvas with diagrams, images, code execution and isolated HTML previews.
- Versioned Canvas autosave, conflict recovery, and save barriers before navigation or desktop close.
- Workspace/category search and keyboard-operated Quick Open (`Ctrl/Cmd+K`).
- Recoverable Trash, full-library ZIP export, and transactional backup restore.
- One Go application and SQLite database, optionally wrapped by the Windows Tauri shell.

Notes, Tiptap editors, Note artifacts, Markdown-to-Note import, Split View and Focus Mode are retired. Legacy `?note=...` and `?block=...` links still open the Workspace Canvas.

Historical Capture, Task, Milestone and Activity records and HTTP contracts remain for compatibility. Their absence from navigation does not authorize deleting their data, migrations or recovery paths.

## Windows Desktop

Windows desktop downloads are distributed through [GitHub Releases](https://github.com/howlil/notespace/releases). A green PR or CI debug executable is **not** a published installer.

Maintainers use [Release](https://github.com/howlil/notespace/actions/workflows/release.yml) on `master`: the default **preflight** is read-only; explicitly selecting **desktop-beta** or **desktop-stable** requests the corresponding publication after exact-master CI and native persistence verification. Existing per-lane workflows remain manual fallbacks until publication acceptance. Beta publication is manual only; ordinary pushes, tags, and `[desktop-beta]` commit markers never dispatch releases. The former auto-beta entry is now a read-only manual release preflight. The MSI has no Authenticode publisher certificate, so Windows may display **Unknown Publisher**.

Starting with `v0.1.0-beta.3`, the beta channel supports **Tauri-signature-verified in-app updates**. This requires the existing Tauri updater signing configuration; it does not require paid Windows publisher signing. Earlier betas require a one-time manual upgrade. Stable publisher-signed releases have a separate workflow and credential requirements.

See [desktop distribution and signing](docs/DESKTOP_FIRST_RELEASE.md) for the exact publication and upgrade contract. Never assume a local debug build proves installed MSI behavior.

## Self-host with Docker

For a local source build, use the localhost port-publishing override:

```sh
git clone https://github.com/howlil/notespace.git
cd notespace
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Open `http://localhost:8080`.

`compose.yaml` intentionally exposes the container port without publishing it on the host because reverse-proxy/PaaS deployments own the public route. `compose.local.yaml` is the explicit localhost override. Both use the same stable `notespace-data` volume.

Do not use `docker compose down -v` unless you intentionally want to remove the data volume. Keep `NOTESPACE_DATA_VOLUME` stable across redeploys.

### Versioned container images

Maintainers explicitly run **Release** with mode **image** from verified `master` to publish to GitHub Container Registry. An optional stable `version` input (for example an existing `v1.2.3` tag pointing at current master) publishes versioned aliases and `latest`; leaving it blank publishes only the SHA tag. Desktop tags, including beta tags, never trigger image publication:

```text
ghcr.io/howlil/notespace:<version>
ghcr.io/howlil/notespace:latest
```

The source-build Compose path remains the simplest local setup. Operators may use the GHCR image in their existing container platform without rebuilding the repository.

### Remote access protection

Notespace remains usable without application authentication on a trusted private network. For an instance exposed beyond that boundary, set an owner password:

```env
NOTESPACE_PASSWORD=use-a-long-random-secret
```

The owner username is fixed to `notespace`. When configured, the application and API require HTTP Basic authentication; `/api/health` remains unauthenticated for platform health checks.

**Terminate HTTPS at your reverse proxy/platform before using Basic authentication remotely.** The scheme does not encrypt credentials on its own.

This is deliberately a single-owner deployment gate, not an account/RBAC system.

## Data ownership and recovery

The Library tools surface exposes:

- **Backup** — downloads a versioned `notespace-backup.zip` containing all canonical user-owned library data and deduplicated binary blobs;
- **Restore** — transactionally replaces the current library from a compatible Notespace ZIP backup or legacy JSON backup;
- **Trash** — restores accidentally deleted Workspaces or deletes them permanently;
- **Import Markdown vault** — selects a Markdown directory/vault and imports files into a chosen Category.

The full-library backup includes Categories, active and trashed Workspaces, authored snapshots, durable image assets, activity sessions, and legacy history rows when present. FTS/search projection rows are intentionally excluded because they are derived and rebuilt from authored state.

The application backup/restore path is currently intentionally capped at **64 MiB** because the archive adapter still assembles a round trip in memory. For a larger installation, use infrastructure-level backup until archive streaming is implemented: stop the container and copy the complete SQLite volume, or use an equivalent SQLite-safe snapshot procedure. Include SQLite WAL files when copying a live data directory.

## Development

Requires Node.js 24, bun 1.3.14, Go 1.25+ and Task 3.x. Windows PowerShell is supported.

```sh
npm install --global bun@1.3.14
go install github.com/go-task/task/v3/cmd/task@latest
bun install --frozen-lockfile
task dev
```

Open `http://localhost:3000`. Task orchestrates the Go API and Vite development server; bun owns frontend package commands and the lockfile, Go owns backend build/test commands, and Docker Compose owns the self-hosted runtime.

### Data locations

Development and production stores are deliberately separate:

| Runtime | SQLite location |
| --- | --- |
| `task dev` | `<repository>/data/dev/notespace.db` |
| Standalone server/binary | `<process working directory>/data/notespace.db`, unless `NOTESPACE_DB` is set |
| Docker Compose | `/data/notespace.db` in the stable `notespace-data` volume |
| `cargo tauri dev` or a debug desktop build | `<Tauri app data>/dev/notespace.db` |
| Packaged desktop release | `<Tauri app data>/notespace.db` |
| Desktop automated test | `<NOTESPACE_DESKTOP_TEST_DATA_DIR>/notespace.db` when explicitly provided |

The runtime never moves or merges these SQLite stores automatically. Existing
`apps/server/data` and desktop app-data databases stay untouched; use the
application backup/restore flow for an intentional data transfer.

Useful commands:

```sh
task --list
task check
task build
task verify
task up
task down
```

## Production without Docker

```sh
task build
./bin/notespace
```

On Windows, run `./bin/notespace.exe`.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `NOTESPACE_ADDR` | `127.0.0.1:8080` | Go listener |
| `NOTESPACE_DB` | `<process working directory>/data/notespace.db` | Durable SQLite path |
| `NOTESPACE_WEB_DIR` | `apps/web/dist/client` | Built SPA assets |
| `NOTESPACE_PASSWORD` | empty | Optional single-owner HTTP Basic protection |

Compose additionally supports `NOTESPACE_BIND_IP`, `NOTESPACE_PORT`, and `NOTESPACE_DATA_VOLUME` as documented in `.env.example`.

## Save and consistency behavior

Edits update immediately and durable Canvas saves are coalesced through the granular Canvas boundary. Legacy compatibility fields remain readable but are not authored by the current UI. **Saved** appears only after pending authoring writes are acknowledged by SQLite. Normal autosave does not write periodic history checkpoints.

For the same Workspace opened in multiple tabs in one browser, Canvas element changes are exchanged directly through `BroadcastChannel` and reconciled with Excalidraw element version semantics. This local path is coalesced separately from server autosave, so sibling tabs can converge quickly without sending an HTTP request for every pointer movement.

Granular durable Canvas writes carry the version of the resource they mutate and use the Excalidraw-specific reconciliation boundary. Legacy whole-workspace update routes remain compatibility surfaces, not the primary authoring path.

Pan and zoom are per-tab view state and are not persisted as authored Canvas changes. This prevents ordinary navigation from generating unnecessary saves or false conflicts.

This is same-browser multi-tab synchronization, not cross-device multiplayer collaboration or offline CRDT synchronization.

Moving a Workspace to Trash captures its authored state and image assets inside one SQLite transaction before removing it from the active library. Full-library backup uses a consistent SQLite read transaction; restore is all-or-nothing.

## Activity sessions

Activity tracking is manual: Start, Pause/Resume, and End are explicit user actions. A user-visible logical session may cross midnight. Persistence splits daily accounting into date segments, but Recent sessions groups those segments back into one session and deleting it removes the complete logical session.

## Search behavior

SQLite authored Workspace state remains authoritative. Granular Canvas saves acknowledge after the authored transaction commits and deliberately leave FTS repair to the next search. Lower-frequency create/move operations may refresh their projection eagerly. Search compares projection metadata with authored revisions and repairs stale rows lazily, so derived indexing never turns a successfully committed Canvas save into a failed save.

## API compatibility

Workspace terminology is canonical for new clients:

```text
/workspaces/:id
/api/workspaces/*
```

Legacy browser `/projects/:id` URLs redirect to `/workspaces/:id`. Legacy `/api/projects/*` routes remain temporarily available for compatibility and advertise deprecation; new application code should not introduce new Project-named HTTP consumers.

## Verification

`task check` runs local static and unit/integration checks; `task verify` adds production builds and the PR browser smoke set (the same set the `ci` gate runs).

The browser suite is WebdriverIO standalone plus `node:test`; there is no Playwright dependency. Pull requests run the critical journeys, pushes to `master` run the same critical gate plus Go formatting/vet/race/build, Docker persistence restart smoke, and relevant desktop gates. The Windows Server 2022 native WebView2 critical journey covers UI routing and close/relaunch durability. Target-device visual acceptance is separate and is not inferred from CI.

For ownership and focused commands, read [testing and CI](docs/TESTING.md).

## Implementation boundaries

- TanStack Start SPA, React, TypeScript, Vite, Tailwind utilities/tokens, Radix primitives.
- Excalidraw is an adapter behind Notespace-owned Canvas snapshots; legacy DTO fields stay at the compatibility boundary.
- Same-browser Canvas tab synchronization uses `BroadcastChannel`; durable persistence remains server-owned.
- Go `net/http`, `database/sql`, pure-Go `modernc.org/sqlite`, explicit SQL and embedded transactional migrations.
- SQLite uses WAL + FULL synchronous with one pooled connection.
- Search, activity telemetry, durable assets, Trash, authored state, and legacy history compatibility data remain in the same self-hosted SQLite ownership boundary.
- No hosted service is required for core editing.

For a current implementation map, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). For testing and CI ownership, read [`docs/TESTING.md`](docs/TESTING.md). Repository-local implementation rules start at [`AGENTS.md`](AGENTS.md).
