# Notespace

A free, self-hosted workspace for writing and spatial thinking. Each **Project** owns one structured document and one Excalidraw canvas, with a shared title, lifecycle, and save status.

Sprint 1 includes create/open/delete, recent projects, title search, structured notes, a resizable canvas workspace, light/dark themes, and SQLite persistence.

![Notespace workspace](docs/evidence/sprint-1/workspace-light.png)

## Self-host with Docker

```sh
git clone https://github.com/howlil/notespace.git
cd notespace
docker compose up --build -d --wait
```

Open **http://localhost:8080**. `.env.example` documents optional port/bind settings; the defaults need no configuration. Compose runs one Go process serving the built web app and API, with SQLite in the `notespace-data` volume. No Node process or external database is needed at runtime.

This first slice is a private, single-instance tool with **no authentication**. The host port binds to loopback. Use a trusted private network or an authenticating reverse proxy if exposing it beyond your machine. Do not use `docker compose down -v` unless you intend to remove all project data. For a simple consistent backup, stop the container and copy the entire volume, including any SQLite WAL files, before starting it again.

## Development

Requires Node.js 24, pnpm 11.19.0 and Go 1.25+. Windows PowerShell is supported by these commands.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
```

Terminal 1:

```sh
cd apps/server
go run ./cmd/notespace
```

Terminal 2 (repository root):

```sh
pnpm dev
```

Open **http://localhost:3000**. Vite forwards `/api` to Go on port 8080 and preserves the browser origin. The default database is relative to the server working directory (`apps/server/data/notespace.db`).

## Production without Docker

```sh
pnpm build
cd apps/server
go build -o ../../bin/notespace ./cmd/notespace
cd ../..
./bin/notespace
```

On Windows, build with `-o ../../bin/notespace.exe` and run `./bin/notespace.exe`. Run the binary from the repository root; it serves `apps/web/dist/client` and stores the database at `data/notespace.db`. Keep the same `NOTESPACE_DB` path when switching between development and production if you want the same data.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `NOTESPACE_ADDR` | `127.0.0.1:8080` | Go listener |
| `NOTESPACE_DB` | `data/notespace.db` | Durable SQLite path |
| `NOTESPACE_WEB_DIR` | `apps/web/dist/client` | Built Start SPA and bundled fonts |

## Save behavior

Edits update immediately and autosave after 650 ms of inactivity. Saves are serialized per project; edits made while saving are coalesced into the next request. **All changes saved** appears only after SQLite acknowledges the write. App navigation flushes pending changes and remains on the project if saving fails. Browser reload/close warns while changes are unsaved; wait for the saved indicator to guarantee durability. Forced browser/process termination before acknowledgement can lose pending edits.

Each save carries a project version. Concurrent stale tabs receive `409`, retain local edits, and cannot silently overwrite the stored project. This is conflict detection, not collaborative editing or offline sync.

## Verification

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
cd apps/server
go vet ./...
go test -race ./...
go build ./cmd/notespace
cd ../..
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests start an isolated Go instance on port 8081 with a fresh database in the OS temporary directory. Production build is required first. CI also runs Docker Compose and:

```sh
python3 scripts/smoke-persistence.py --compose-restart
```

## Implementation boundaries

- TanStack Start in SPA mode, React, TypeScript, Vite, Tailwind tokens/utilities and Radix dialogs. Start prerenders the app shell; Go serves it under the same origin as the API.
- Tiptap and Excalidraw are lazy-loaded adapters. Their versioned snapshots live inside the Project; no separate Note/Canvas resource exists.
- Go `net/http`, `database/sql`, pure-Go `modernc.org/sqlite`, explicit SQL and embedded transactional migrations. WAL + FULL synchronous, one pooled connection. No CGO required for deployment.
- Geist and Excalidraw fonts are served by the instance. The dashboard does not load either editor.
- API: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/{id}`, and `GET /api/health`. PATCH requires `title`, `document`, `canvas`, `splitRatio`, and the last acknowledged `version`. JSON bodies are capped at 10 MiB; titles at 160 characters. This initial internal API has no public compatibility guarantee.

Editor selection and self-host packaging implement the authorized Sprint 1 scope. Tiptap, Excalidraw, React, TanStack, Tailwind, Radix and Geist use permissive licenses (MIT/OFL as applicable); modernc SQLite uses BSD-3-Clause and SQLite's public-domain core. See package license files for transitive notices. The lockfiles pin actual dependency versions.

Current scope excludes collaboration, AI, sharing, export, cross-surface references, icon libraries, desktop shells, and team permissions. Embedded Excalidraw provides its own native editing controls; Notespace does not add integrations for its optional hosted services.

Iteration state, design rules, and evidence are maintained in [`.agents/CURRENT_ITERATION.md`](.agents/CURRENT_ITERATION.md).
