# Notespace

A free, self-hosted knowledge workspace for structured notes, spatial thinking, and deliberate study.

The user-facing model is:

```text
Category
└── Workspace
    ├── Notes[]
    ├── Canvas
    ├── checkpoint history
    ├── durable image assets
    └── study activity
```

Notespace is intentionally not a generic Notion clone, collaboration platform, AI wrapper, or gamified productivity dashboard.

## Core capability

- Category → Workspace library with recent-first Home and scalable category browsing.
- Multiple durable Tiptap Notes plus one Excalidraw Canvas per Workspace.
- Split authoring with up to four panes and one Canvas pane.
- Quick Capture and Markdown ingestion.
- Global FTS search with exact Note/block context and universal `Ctrl/Cmd + K` Quick Open.
- Durable image assets, Workspace ZIP/Markdown export, checkpoint history and restore.
- Recoverable Workspace Trash with explicit permanent deletion.
- Versioned full-library backup/transactional restore covering Categories, active Workspaces, Trash, history, images, and study sessions.
- Bulk Markdown/Obsidian-vault folder import; referenced selected images are copied into Notespace assets.
- Explicit Start / Pause / Resume / End study sessions.
- Deliberate Recall: write from memory with the Note hidden, then reveal the source for self-comparison. No scores, XP, or generated questions.

## Self-host with Docker

```sh
git clone https://github.com/howlil/notespace.git
cd notespace
docker compose up --build -d --wait
```

Open `http://localhost:8080`. Compose runs one Go process serving the built web app and API with SQLite in the explicitly named `notespace-data` volume. No Node process or external database is required at runtime.

Do not use `docker compose down -v` unless you intentionally want to remove the data volume. Keep `NOTESPACE_DATA_VOLUME` stable across redeploys.

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

- **Backup** — downloads a versioned `notespace-backup.json` containing all canonical user-owned library data;
- **Restore** — transactionally replaces the current library from a compatible backup;
- **Trash** — restores accidentally deleted Workspaces or deletes them permanently;
- **Import Markdown vault** — selects a Markdown directory/vault and imports files into a chosen Category.

The full-library backup includes Categories, active and trashed Workspaces, authored snapshots, checkpoint history, durable image assets, and study sessions. FTS/search projection rows are intentionally excluded because they are derived and rebuilt from authored state.

For infrastructure-level backup, stopping the container and copying the complete SQLite volume remains valid. Include SQLite WAL files when copying a live data directory.

## Development

Requires Node.js 24, pnpm 11.19.0, Go 1.25+ and Task 3.x. Windows PowerShell is supported.

```sh
npm install --global pnpm@11.19.0
go install github.com/go-task/task/v3/cmd/task@latest
pnpm install --frozen-lockfile
task dev
```

Open `http://localhost:3000`. Task orchestrates the Go API and Vite development server; pnpm owns frontend package commands, Go owns backend build/test commands, and Docker Compose owns the self-hosted runtime.

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
| `NOTESPACE_DB` | `data/notespace.db` | Durable SQLite path |
| `NOTESPACE_WEB_DIR` | `apps/web/dist/client` | Built SPA assets |
| `NOTESPACE_PASSWORD` | empty | Optional single-owner HTTP Basic protection |

Compose additionally supports `NOTESPACE_BIND_IP`, `NOTESPACE_PORT`, and `NOTESPACE_DATA_VOLUME` as documented in `.env.example`.

## Save and consistency behavior

Edits update immediately and autosave after 650 ms of inactivity. Saves are serialized per Workspace; **All changes saved** appears only after SQLite acknowledges the write.

Each save carries a Workspace version. Concurrent stale tabs receive `409`, retain local edits, and cannot silently overwrite newer stored content. This is conflict detection, not collaborative editing or offline synchronization.

Moving a Workspace to Trash captures its authored state, checkpoint history, and image assets inside one SQLite transaction before removing it from the active library. Full-library backup uses a consistent SQLite read transaction; restore is all-or-nothing.

## Verification

Run deterministic local gates with:

```sh
task verify
```

The suite covers TypeScript typechecking/lint/unit/build, Go vet/race/build, repository knowledge contracts, and risk-selected production composition checks. Persistence/runtime changes additionally exercise Docker Compose and restart durability.

Manual browser/black-box testing and screenshot review are not required merge gates.

## Implementation boundaries

- TanStack Start SPA, React, TypeScript, Vite, Tailwind utilities/tokens, Radix primitives.
- Tiptap and Excalidraw are adapters behind Notespace-owned Workspace/Note snapshots.
- Go `net/http`, `database/sql`, pure-Go `modernc.org/sqlite`, explicit SQL and embedded transactional migrations.
- SQLite uses WAL + FULL synchronous with one pooled connection.
- Search, study telemetry, checkpoint history, durable assets, Trash, and authored state remain in the same self-hosted SQLite ownership boundary.
- No hosted service is required for core editing.

For authoritative product/engineering guidance start at [`AGENTS.md`](AGENTS.md). Active milestone state lives in [`.agents/CURRENT_ITERATION.md`](.agents/CURRENT_ITERATION.md).
